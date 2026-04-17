from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import (
    GradientBoostingClassifier,
    GradientBoostingRegressor,
    RandomForestClassifier,
    RandomForestRegressor,
)
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LinearRegression, LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    f1_score,
    mean_absolute_error,
    mean_squared_error,
    precision_score,
    r2_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import KFold, StratifiedKFold, cross_validate, train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

from core.modeling import FEATURE_COLS
from core.simulation import apply_intervention
from routers.cities import ensure_baseline_data
from services.analytics import compute_summary_metrics
from services.notebook_bridge.loaders import (
    ArtifactValidationError,
    CityDataNotFoundError,
    get_city_paths,
    load_notebook_district_summary,
    load_notebook_origin_metrics,
)

RANDOM_STATE = 42
ACCESS_THRESHOLD = 50.0


@dataclass(frozen=True)
class ModelingArtifacts:
    regressor_path: Path
    classifier_path: Path
    metadata_path: Path


def _artifact_paths(city_id: str) -> ModelingArtifacts:
    folder = get_city_paths(city_id).root
    return ModelingArtifacts(
        regressor_path=folder / "notebook_modeling_regressor.joblib",
        classifier_path=folder / "notebook_modeling_classifier.joblib",
        metadata_path=folder / "notebook_modeling_metadata.json",
    )


def _source_token(city_id: str) -> str:
    """
    Build a deterministic token from notebook-derived inputs and city artifacts.
    Used to trigger lazy retraining when upstream data changes.
    """
    paths = get_city_paths(city_id)
    candidates = [
        paths.interim_origin_metrics_csv,
        paths.interim_worldpop_origins_csv,
        paths.final_district_summary_csv,
        paths.healthcare_csv,
        paths.transport_stops_csv,
    ]
    parts: list[str] = []
    for p in candidates:
        parts.append(f"{p.name}:{p.stat().st_mtime}" if p.exists() else f"{p.name}:missing")
    return "|".join(parts)


def _first_existing(*series: pd.Series) -> pd.Series:
    out = series[0].copy()
    for s in series[1:]:
        out = out.where(out.notna(), s)
    return out


def _safe_numeric(df: pd.DataFrame, cols: list[str]) -> pd.DataFrame:
    out = df.copy()
    for c in cols:
        if c in out.columns:
            out[c] = pd.to_numeric(out[c], errors="coerce")
    return out


def _haversine_km(lon1: pd.Series, lat1: pd.Series, lon2: float, lat2: float) -> pd.Series:
    a1 = np.radians(lat1.astype(float))
    b1 = np.radians(lon1.astype(float))
    a2 = np.radians(lat2)
    b2 = np.radians(lon2)
    dlat = a2 - a1
    dlon = b2 - b1
    a = np.sin(dlat / 2.0) ** 2 + np.cos(a1) * np.cos(a2) * np.sin(dlon / 2.0) ** 2
    c = 2 * np.arcsin(np.sqrt(np.clip(a, 0, 1)))
    return 6371.0 * c


def _load_modeling_dataframe(city_id: str) -> pd.DataFrame:
    """
    Build modeling table from notebook outputs with robust fallback.
    Preferred source: origin_accessibility_metrics.csv / worldpop_origins.csv.
    """
    origin_df = load_notebook_origin_metrics(city_id).copy()
    district_df = load_notebook_district_summary(city_id).copy()

    # Normalize likely numeric columns used in notebook-derived modeling.
    origin_df = _safe_numeric(
        origin_df,
        [
            "population",
            "x",
            "y",
            "walk_dist_to_stop_m",
            "walk_time_to_stop_min",
            "accessibility_score",
            "score_2sfca",
            "total_travel_time_min",
            "num_facilities_reachable_30min",
            "num_facilities_reachable_60min",
        ],
    )
    district_df = _safe_numeric(
        district_df,
        [
            "population_raster",
            "origin_count",
            "avg_walk_time_to_stop_min_pw",
        ],
    )
    finite_origin_cols = [
        c
        for c in [
            "population",
            "x",
            "y",
            "walk_dist_to_stop_m",
            "walk_time_to_stop_min",
            "accessibility_score",
            "score_2sfca",
            "total_travel_time_min",
            "num_facilities_reachable_30min",
            "num_facilities_reachable_60min",
        ]
        if c in origin_df.columns
    ]
    if finite_origin_cols:
        origin_df[finite_origin_cols] = origin_df[finite_origin_cols].replace([np.inf, -np.inf], np.nan)

    finite_district_cols = [c for c in ["population_raster", "origin_count", "avg_walk_time_to_stop_min_pw"] if c in district_df.columns]
    if finite_district_cols:
        district_df[finite_district_cols] = district_df[finite_district_cols].replace([np.inf, -np.inf], np.nan)

    if "district_id" in origin_df.columns and "district_id" in district_df.columns:
        merge_cols = [c for c in ["district_id", "population_raster", "origin_count", "avg_walk_time_to_stop_min_pw"] if c in district_df.columns]
        if merge_cols:
            origin_df = origin_df.merge(district_df[merge_cols].drop_duplicates(subset=["district_id"]), on="district_id", how="left")

    if "population" in origin_df.columns:
        origin_df["population"] = origin_df["population"].clip(lower=0)
        origin_df["log_population"] = np.log1p(origin_df["population"])
    else:
        origin_df["population"] = 1.0
        origin_df["log_population"] = np.log1p(origin_df["population"])

    if {"x", "y"}.issubset(origin_df.columns):
        lon0 = float(origin_df["x"].median(skipna=True))
        lat0 = float(origin_df["y"].median(skipna=True))
        origin_df["dist_to_center_km"] = _haversine_km(origin_df["x"], origin_df["y"], lon0, lat0)
        q75 = origin_df["dist_to_center_km"].quantile(0.75)
        origin_df["is_periphery"] = (origin_df["dist_to_center_km"] >= q75).astype(int)
    else:
        origin_df["dist_to_center_km"] = 0.0
        origin_df["is_periphery"] = 0

    if {"walk_time_to_stop_min", "dist_to_center_km"}.issubset(origin_df.columns):
        origin_df["walk_time_x_center"] = origin_df["walk_time_to_stop_min"] * origin_df["dist_to_center_km"]
    else:
        origin_df["walk_time_x_center"] = 0.0

    if {"walk_dist_to_stop_m", "population"}.issubset(origin_df.columns):
        origin_df["walk_dist_x_pop"] = origin_df["walk_dist_to_stop_m"] * np.log1p(origin_df["population"])
    else:
        origin_df["walk_dist_x_pop"] = 0.0

    # Targets aligned with notebook methodology.
    if "accessibility_score" not in origin_df.columns:
        raise ArtifactValidationError("Origin metrics must contain accessibility_score")
    origin_df["y_access"] = pd.to_numeric(origin_df["accessibility_score"], errors="coerce")
    origin_df["y_under"] = (origin_df["y_access"] < ACCESS_THRESHOLD).astype(int)
    origin_df = origin_df[origin_df["y_access"].notna()].copy()
    return origin_df


def _feature_sets(df: pd.DataFrame) -> dict[str, list[str]]:
    conservative = [
        "population",
        "walk_time_to_stop_min",
        "walk_dist_to_stop_m",
        "x",
        "y",
        "dist_to_center_km",
        "is_periphery",
        "population_raster",
        "origin_count",
        "avg_walk_time_to_stop_min_pw",
    ]
    enriched = conservative + ["log_population", "walk_time_x_center", "walk_dist_x_pop"]

    leakage_cols = {
        "accessibility_score",
        "y_access",
        "y_under",
        "score_2sfca",
        "total_travel_time_min",
        "num_facilities_reachable_30min",
        "num_facilities_reachable_60min",
        "nearest_facility_id",
        "is_unreachable",
        "is_access_30",
        "chosen_stop_key",
    }

    out: dict[str, list[str]] = {}
    for name, cols in {"clean_conservative": conservative, "clean_enriched": enriched}.items():
        valid = [c for c in cols if c in df.columns and c not in leakage_cols]
        if valid:
            out[name] = valid
    if not out:
        raise ArtifactValidationError("No valid feature set available after leakage filtering")
    return out


def prepare_features_for_city(city_id: str, feature_set: str = "clean_enriched") -> tuple[pd.DataFrame, pd.Series, pd.Series, list[str]]:
    """
    Prepare modeling features and targets from notebook-derived origin metrics.

    Returns:
        X, y_access, y_under, selected_feature_list
    """
    df = _load_modeling_dataframe(city_id)
    sets = _feature_sets(df)
    selected = sets.get(feature_set) or sets[next(iter(sets))]
    X = df[selected].copy()
    y_access = df["y_access"].copy()
    y_under = df["y_under"].copy()
    return X, y_access, y_under, selected


def _split_columns(X: pd.DataFrame) -> tuple[list[str], list[str]]:
    num_cols = [c for c in X.columns if pd.api.types.is_numeric_dtype(X[c])]
    cat_cols = [c for c in X.columns if c not in num_cols]
    return num_cols, cat_cols


def _make_preprocessor(X: pd.DataFrame, scale_numeric: bool = False) -> ColumnTransformer:
    num_cols, cat_cols = _split_columns(X)
    num_steps: list[tuple[str, Any]] = [("imputer", SimpleImputer(strategy="median"))]
    if scale_numeric:
        num_steps.append(("scaler", StandardScaler()))
    num_pipe = Pipeline(num_steps)
    cat_pipe = Pipeline(
        [
            ("imputer", SimpleImputer(strategy="most_frequent")),
            ("onehot", OneHotEncoder(handle_unknown="ignore")),
        ]
    )
    return ColumnTransformer(
        [
            ("num", num_pipe, num_cols),
            ("cat", cat_pipe, cat_cols),
        ],
        remainder="drop",
    )


def _train_regression(X: pd.DataFrame, y: pd.Series) -> tuple[Pipeline, dict[str, Any]]:
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=RANDOM_STATE)
    cv = KFold(n_splits=5, shuffle=True, random_state=RANDOM_STATE)
    specs = [
        ("linear", LinearRegression(), True),
        ("rf", RandomForestRegressor(n_estimators=250, max_depth=12, random_state=RANDOM_STATE, n_jobs=1), False),
        ("gbr", GradientBoostingRegressor(random_state=RANDOM_STATE), False),
    ]

    best_name = ""
    best_cv_r2 = float("-inf")
    best_pipe: Pipeline | None = None
    rows: list[dict[str, Any]] = []
    for name, model, scale in specs:
        pipe = Pipeline([("pre", _make_preprocessor(X_train, scale_numeric=scale)), ("model", model)])
        scores = cross_validate(
            pipe,
            X_train,
            y_train,
            cv=cv,
            scoring={"r2": "r2", "mae": "neg_mean_absolute_error", "rmse": "neg_root_mean_squared_error"},
            n_jobs=1,
        )
        cv_r2 = float(scores["test_r2"].mean())
        rows.append(
            {
                "model": name,
                "cv_r2": cv_r2,
                "cv_mae": float(-scores["test_mae"].mean()),
                "cv_rmse": float(-scores["test_rmse"].mean()),
            }
        )
        if cv_r2 > best_cv_r2:
            best_cv_r2 = cv_r2
            best_name = name
            best_pipe = pipe

    if best_pipe is None:
        raise ArtifactValidationError("Failed to train any regression model")

    best_pipe.fit(X_train, y_train)
    pred = best_pipe.predict(X_test)
    metrics = {
        "selected_model": best_name,
        "test_r2": float(r2_score(y_test, pred)),
        "test_mae": float(mean_absolute_error(y_test, pred)),
        "test_rmse": float(np.sqrt(mean_squared_error(y_test, pred))),
        "cv_candidates": rows,
    }
    return best_pipe, metrics


def _train_classifier(X: pd.DataFrame, y: pd.Series) -> tuple[Pipeline, dict[str, Any]]:
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=RANDOM_STATE, stratify=y)
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=RANDOM_STATE)
    specs = [
        ("logreg", LogisticRegression(max_iter=2000, random_state=RANDOM_STATE), True),
        (
            "rf",
            RandomForestClassifier(
                n_estimators=250,
                max_depth=12,
                min_samples_leaf=5,
                class_weight="balanced",
                random_state=RANDOM_STATE,
                n_jobs=1,
            ),
            False,
        ),
        ("gbc", GradientBoostingClassifier(random_state=RANDOM_STATE), False),
    ]

    best_name = ""
    best_cv_f1 = float("-inf")
    best_pipe: Pipeline | None = None
    rows: list[dict[str, Any]] = []
    for name, model, scale in specs:
        pipe = Pipeline([("pre", _make_preprocessor(X_train, scale_numeric=scale)), ("model", model)])
        scores = cross_validate(
            pipe,
            X_train,
            y_train,
            cv=cv,
            scoring={"f1": "f1", "roc_auc": "roc_auc", "accuracy": "accuracy"},
            n_jobs=1,
        )
        cv_f1 = float(scores["test_f1"].mean())
        rows.append(
            {
                "model": name,
                "cv_f1": cv_f1,
                "cv_roc_auc": float(scores["test_roc_auc"].mean()),
                "cv_accuracy": float(scores["test_accuracy"].mean()),
            }
        )
        if cv_f1 > best_cv_f1:
            best_cv_f1 = cv_f1
            best_name = name
            best_pipe = pipe

    if best_pipe is None:
        raise ArtifactValidationError("Failed to train any classification model")

    best_pipe.fit(X_train, y_train)
    pred = best_pipe.predict(X_test)
    if hasattr(best_pipe, "predict_proba"):
        proba = best_pipe.predict_proba(X_test)[:, 1]
    else:
        proba = np.zeros(len(pred), dtype=float)
    metrics = {
        "selected_model": best_name,
        "test_accuracy": float(accuracy_score(y_test, pred)),
        "test_precision": float(precision_score(y_test, pred, zero_division=0)),
        "test_recall": float(recall_score(y_test, pred, zero_division=0)),
        "test_f1": float(f1_score(y_test, pred, zero_division=0)),
        "test_roc_auc": float(roc_auc_score(y_test, proba) if len(np.unique(y_test)) > 1 else 0.0),
        "cv_candidates": rows,
    }
    return best_pipe, metrics


def _load_metadata(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise CityDataNotFoundError(f"Metadata artifact not found: {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def load_or_train_models(city_id: str, force_retrain: bool = False) -> dict[str, Any]:
    """
    Load trained notebook-bridge models, with lazy retraining when:
    - artifacts are missing
    - source token changed
    - force_retrain=True
    """
    artifact = _artifact_paths(city_id)
    token = _source_token(city_id)

    retrain = force_retrain
    if not artifact.regressor_path.exists() or not artifact.classifier_path.exists() or not artifact.metadata_path.exists():
        retrain = True
    else:
        try:
            metadata = _load_metadata(artifact.metadata_path)
            retrain = retrain or metadata.get("source_token") != token
        except Exception:
            retrain = True

    if retrain:
        X, y_access, y_under, selected_features = prepare_features_for_city(city_id, feature_set="clean_enriched")
        regressor, reg_metrics = _train_regression(X, y_access)
        classifier, cls_metrics = _train_classifier(X, y_under)

        joblib.dump(regressor, artifact.regressor_path)
        joblib.dump(classifier, artifact.classifier_path)
        metadata = {
            "city_id": city_id,
            "source_token": token,
            "feature_set": "clean_enriched",
            "features": selected_features,
            "regression_metrics": reg_metrics,
            "classification_metrics": cls_metrics,
            "target_threshold": ACCESS_THRESHOLD,
        }
        artifact.metadata_path.write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    else:
        metadata = _load_metadata(artifact.metadata_path)

    regressor = joblib.load(artifact.regressor_path)
    classifier = joblib.load(artifact.classifier_path)
    return {"regressor": regressor, "classifier": classifier, "metadata": metadata}


def _align_input_columns(rows: pd.DataFrame, expected: list[str]) -> pd.DataFrame:
    out = rows.copy()
    for c in expected:
        if c not in out.columns:
            out[c] = np.nan
    return out[expected].copy()


def predict_accessibility(city_id: str, input_data: dict[str, Any]) -> dict[str, Any]:
    """
    Predict accessibility score from input rows using trained regression model.
    """
    models = load_or_train_models(city_id)
    regressor: Pipeline = models["regressor"]
    expected = models["metadata"]["features"]

    rows = pd.DataFrame(input_data.get("rows", []))
    if rows.empty:
        return {"city_id": city_id, "predictions": []}

    X = _align_input_columns(rows, expected)
    pred = regressor.predict(X)
    pred = np.clip(np.asarray(pred, dtype=float), 0.0, 100.0)
    return {"city_id": city_id, "predictions": [float(x) for x in pred]}


def classify_underserved(city_id: str) -> dict[str, Any]:
    """
    Classify underserved rows from notebook origin metrics using trained classifier.
    """
    models = load_or_train_models(city_id)
    classifier: Pipeline = models["classifier"]
    expected = models["metadata"]["features"]

    df = _load_modeling_dataframe(city_id).reset_index(drop=True)
    X = _align_input_columns(df, expected)
    pred = classifier.predict(X)
    if hasattr(classifier, "predict_proba"):
        proba = classifier.predict_proba(X)[:, 1]
    else:
        proba = np.zeros(len(pred), dtype=float)

    id_col = "origin_id" if "origin_id" in df.columns else None
    rows = []
    for i, flag in enumerate(pred):
        rows.append(
            {
                "row_id": None if id_col is None else df.iloc[i][id_col],
                "underserved": bool(int(flag)),
                "probability": float(proba[i]),
            }
        )
    return {"city_id": city_id, "rows": rows}


def get_model_metrics(city_id: str) -> dict[str, Any]:
    """
    Return persisted metrics from lazy-trained notebook-bridge models.
    """
    models = load_or_train_models(city_id)
    md = models["metadata"]
    return {
        "city_id": city_id,
        "metrics": {
            "feature_set": md.get("feature_set"),
            "target_threshold": md.get("target_threshold"),
            "regression": md.get("regression_metrics", {}),
            "classification": md.get("classification_metrics", {}),
        },
    }


def _feature_names_from_pipeline(pipe: Pipeline) -> list[str]:
    pre = pipe.named_steps.get("pre")
    if pre is None:
        return []
    try:
        names = pre.get_feature_names_out()
        return [str(n) for n in names]
    except Exception:
        return []


def get_feature_importance(city_id: str, top_n: int = 15) -> dict[str, Any]:
    """
    Return feature importance from tree-based model internals when available.
    """
    models = load_or_train_models(city_id)
    classifier: Pipeline = models["classifier"]
    model = classifier.named_steps.get("model")
    if model is None or not hasattr(model, "feature_importances_"):
        return {"city_id": city_id, "feature_importance": []}

    names = _feature_names_from_pipeline(classifier)
    importances = np.asarray(model.feature_importances_, dtype=float)
    if len(names) != len(importances):
        # fallback to source feature names if transformer names are unavailable
        names = [str(x) for x in models["metadata"].get("features", [])]
        if len(names) != len(importances):
            names = [f"feature_{i}" for i in range(len(importances))]

    rows = (
        pd.DataFrame({"feature": names, "importance": importances})
        .sort_values("importance", ascending=False)
        .head(top_n)
        .reset_index(drop=True)
    )
    return {"city_id": city_id, "feature_importance": rows.to_dict(orient="records")}


def rank_interventions(city_id: str, scenarios: list[dict[str, Any]]) -> dict[str, Any]:
    """
    Rank intervention scenarios using predicted accessibility and underserved impact.

    Methodology:
    - apply scenario perturbation to baseline feature table
    - score with trained regressor
    - estimate underserved share from trained classifier
    - combine accessibility gain and underserved reduction into a ranking score
    """
    models = load_or_train_models(city_id)
    regressor: Pipeline = models["regressor"]
    classifier: Pipeline = models["classifier"]
    expected = models["metadata"]["features"]

    baseline_features, baseline_scores = ensure_baseline_data(city_id)
    base_df = baseline_features.copy().reset_index(drop=True)
    base_df["accessibility_score"] = pd.Series(baseline_scores).astype(float).to_numpy()
    if "population" not in base_df.columns:
        base_df["population"] = 1.0
    base_summary = compute_summary_metrics(base_df)
    base_under = float((base_df["accessibility_score"] < 0.5).mean())

    ranked: list[dict[str, Any]] = []
    for i, scenario in enumerate(scenarios):
        sim_df = apply_intervention(base_df.drop(columns=["accessibility_score"], errors="ignore"), scenario)
        X = _align_input_columns(sim_df, expected)
        pred_access = np.clip(np.asarray(regressor.predict(X), dtype=float), 0.0, 1.0)
        pred_under = np.asarray(classifier.predict(X), dtype=int)

        sim_rows = sim_df.copy()
        sim_rows["accessibility_score"] = pred_access
        sim_summary = compute_summary_metrics(sim_rows)
        sim_under = float(pred_under.mean())

        access_gain = float(sim_summary["avg_accessibility_score"] - base_summary["avg_accessibility_score"])
        underserved_reduction = float(base_under - sim_under)
        pop_impact = float(max(0.0, base_summary["underserved_population"] - sim_summary["underserved_population"]))
        score = access_gain * 0.5 + underserved_reduction * 0.3 + pop_impact * 0.2

        ranked.append(
            {
                "rank": 0,
                "scenario": scenario.get("name", f"scenario_{i+1}"),
                "district_improvement": access_gain,
                "inequality_reduction": underserved_reduction,
                "population_impact": pop_impact,
                "score": float(score),
                "explanation": (
                    f"Predicted access gain {access_gain:.4f}, underserved reduction {underserved_reduction:.4f}, "
                    f"underserved population impact {pop_impact:.1f}."
                ),
            }
        )

    ranked.sort(key=lambda r: r["score"], reverse=True)
    for idx, row in enumerate(ranked, start=1):
        row["rank"] = idx
    return {"city_id": city_id, "recommendations": ranked[:3]}

