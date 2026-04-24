from __future__ import annotations

import json
import pickle
from pathlib import Path
from tempfile import NamedTemporaryFile

import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingRegressor

from core.config import city_dir

FEATURE_COLS = [
    "distance_to_nearest_stop_m",
    "stop_density",
    "stop_density_1km",
    "population",
    "population_density",
    "num_healthcare_facilities",
    "healthcare_density_1km",
    "distance_to_city_center_km",
    "interaction_stop_pop_density",
    "interaction_fac_pop",
]


def _atomic_write_bytes(path: Path, payload: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with NamedTemporaryFile(dir=path.parent, delete=False) as tmp:
        tmp.write(payload)
        tmp.flush()
        Path(tmp.name).replace(path)


def _atomic_write_text(path: Path, payload: str) -> None:
    _atomic_write_bytes(path, payload.encode("utf-8"))


def _atomic_write_csv(path: Path, df: pd.DataFrame) -> None:
    _atomic_write_text(path, df.to_csv(index=False))


def _target_accessibility_score(df: pd.DataFrame) -> pd.Series:
    inv_distance = 1.0 / pd.to_numeric(df["distance_to_nearest_stop_m"], errors="coerce").fillna(0.0).clip(lower=1e-6)
    stop_rank = df["stop_density"].rank(pct=True, ascending=True)
    inv_dist_rank = inv_distance.rank(pct=True, ascending=True)
    hc_rank = df["healthcare_density_1km"].rank(pct=True, ascending=True)
    return stop_rank * 0.4 + inv_dist_rank * 0.3 + hc_rank * 0.3


def _scaled_score_series(values: pd.Series) -> pd.Series:
    numeric = pd.to_numeric(values, errors="coerce").fillna(0.0)
    if float(numeric.max()) > 1.5:
        numeric = numeric / 100.0
    return numeric.clip(lower=0.0, upper=1.0)


def _prepare_features(df: pd.DataFrame, feature_names: list[str]) -> pd.DataFrame:
    out = df.copy()
    for col in feature_names:
        if col not in out.columns:
            out[col] = 0.0
        out[col] = pd.to_numeric(out[col], errors="coerce")
    out[feature_names] = out[feature_names].fillna(0.0)
    return out


def train_model(features_df: pd.DataFrame, city_id: str) -> tuple[GradientBoostingRegressor, list[str], pd.DataFrame]:
    if features_df.empty:
        raise ValueError("Cannot train model on empty features")
    train_df = _prepare_features(features_df, FEATURE_COLS)
    existing_score = train_df.get("accessibility_score")
    if existing_score is not None and pd.to_numeric(existing_score, errors="coerce").notna().any():
        train_df["accessibility_score"] = _scaled_score_series(existing_score)
    else:
        train_df["accessibility_score"] = _target_accessibility_score(train_df)
    x = train_df[FEATURE_COLS].to_numpy(dtype=float)
    y = train_df["accessibility_score"].to_numpy(dtype=float)
    model = GradientBoostingRegressor(
        n_estimators=200,
        learning_rate=0.1,
        max_depth=5,
        subsample=0.9,
        random_state=42,
    )
    model.fit(x, y)
    city_path = city_dir(city_id)
    city_path.mkdir(parents=True, exist_ok=True)

    model_path = city_path / "model.pkl"
    feature_path = city_path / "feature_names.json"
    features_path = city_path / "features.csv"
    _atomic_write_bytes(model_path, pickle.dumps(model))
    _atomic_write_text(feature_path, json.dumps(FEATURE_COLS, indent=2))
    _atomic_write_csv(features_path, train_df)
    return model, FEATURE_COLS, train_df


def load_model(city_id: str) -> tuple[GradientBoostingRegressor, list[str], pd.DataFrame]:
    city_path = city_dir(city_id)
    model_path = city_path / "model.pkl"
    feature_path = city_path / "feature_names.json"
    features_path = city_path / "features.csv"

    if not model_path.exists() or not feature_path.exists() or not features_path.exists():
        raise FileNotFoundError(f"Model artifacts are missing for city '{city_id}'")
    if model_path.stat().st_size == 0:
        raise EOFError(f"Model artifact is empty for city '{city_id}'")

    try:
        with model_path.open("rb") as f:
            model = pickle.load(f)
    except (EOFError, pickle.UnpicklingError) as exc:
        raise EOFError(f"Model artifact is unreadable for city '{city_id}'") from exc
    feature_names = json.loads(feature_path.read_text(encoding="utf-8"))
    features_df = pd.read_csv(features_path)
    return model, feature_names, features_df


def predict(model: GradientBoostingRegressor, features_df: pd.DataFrame, feature_names: list[str]) -> np.ndarray:
    if features_df.empty:
        return np.array([], dtype=float)
    prepared = _prepare_features(features_df, feature_names)
    scores = model.predict(prepared[feature_names].to_numpy(dtype=float))
    return np.clip(scores, 0, 1)
