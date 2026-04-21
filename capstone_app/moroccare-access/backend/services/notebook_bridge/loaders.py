from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import geopandas as gpd
import joblib
import pandas as pd
from shapely import wkt

from core.config import city_dir, load_city_config


class NotebookBridgeError(RuntimeError):
    """Base exception for notebook bridge loading failures."""


class CityDataNotFoundError(NotebookBridgeError):
    """Raised when a city folder or required city file does not exist."""


class ArtifactValidationError(NotebookBridgeError):
    """Raised when an artifact exists but does not satisfy schema/contract checks."""


@dataclass(frozen=True)
class CityPaths:
    """Resolved file-system paths for a city within file-based storage."""

    city_id: str
    root: Path
    config: Path
    healthcare_csv: Path
    transport_stops_csv: Path
    features_csv: Path
    model_pkl: Path
    feature_names_json: Path
    interim_origin_metrics_csv: Path
    interim_worldpop_origins_csv: Path
    interim_worldpop_origin_points_csv: Path
    final_district_summary_csv: Path
    final_modeling_results_dir: Path
    final_cls_test_clean_csv: Path
    final_cls_cv_clean_csv: Path
    final_feature_importance_csv: Path
    processed_cls_test_clean_csv: Path
    processed_cls_cv_clean_csv: Path
    processed_feature_importance_csv: Path


def get_city_dir(city_id: str) -> Path:
    """
    Resolve city folder from existing backend file-based storage.

    Raises:
        CityDataNotFoundError: if city directory does not exist.
    """
    folder = city_dir(city_id)
    if not folder.exists() or not folder.is_dir():
        raise CityDataNotFoundError(f"City directory not found for '{city_id}': {folder}")
    return folder


def get_city_paths(city_id: str) -> CityPaths:
    """
    Build canonical city paths used by notebook-bridge services.

    Notes:
    - City-scoped files live under backend/data/cities/<city_id>/
    - Notebook-derived aggregate outputs currently live at repository-level data/interim,data/final.
    """
    folder = get_city_dir(city_id)
    backend_root = Path(__file__).resolve().parents[2]
    repo_root = _resolve_repo_root(backend_root)
    return CityPaths(
        city_id=city_id,
        root=folder,
        config=folder / "config.json",
        healthcare_csv=folder / "healthcare.csv",
        transport_stops_csv=folder / "transport_stops.csv",
        features_csv=folder / "features.csv",
        model_pkl=folder / "model.pkl",
        feature_names_json=folder / "feature_names.json",
        interim_origin_metrics_csv=repo_root / "data" / "interim" / "origin_accessibility_metrics.csv",
        interim_worldpop_origins_csv=repo_root / "data" / "interim" / "worldpop_origins.csv",
        interim_worldpop_origin_points_csv=repo_root / "data" / "interim" / "worldpop_origin_points.csv",
        final_district_summary_csv=repo_root / "data" / "final" / "district_accessibility_summary.csv",
        final_modeling_results_dir=repo_root / "data" / "final" / "modeling_results",
        final_cls_test_clean_csv=repo_root / "data" / "final" / "modeling_results" / "cls_test_clean.csv",
        final_cls_cv_clean_csv=repo_root / "data" / "final" / "modeling_results" / "cls_cv_clean.csv",
        final_feature_importance_csv=repo_root / "data" / "final" / "modeling_results" / "classification_clean_feature_importance.csv",
        processed_cls_test_clean_csv=repo_root / "data" / "processed" / "cls_test_clean.csv",
        processed_cls_cv_clean_csv=repo_root / "data" / "processed" / "cls_cv_clean.csv",
        processed_feature_importance_csv=repo_root / "data" / "processed" / "classification_clean_feature_importance.csv",
    )


def _resolve_repo_root(backend_root: Path) -> Path:
    """
    Resolve repository root for notebook-derived artifacts.

    Supports both:
    - local repo layout where interim/final data may live above backend/
    - container layout where backend is mounted directly at /app
    """
    search_roots = [backend_root, *list(backend_root.parents)]
    for root in search_roots:
        data_dir = root / "data"
        if (data_dir / "interim").exists() or (data_dir / "final").exists():
            return root
    return backend_root


def _read_csv(path: Path, required_cols: list[str] | None = None) -> pd.DataFrame:
    if not path.exists():
        raise CityDataNotFoundError(f"Required file not found: {path}")
    df = pd.read_csv(path)
    if required_cols:
        missing = [c for c in required_cols if c not in df.columns]
        if missing:
            raise ArtifactValidationError(f"{path.name} missing columns: {missing}")
    return df


def load_city_dataframe(city_id: str, filename: str, required_cols: list[str] | None = None) -> pd.DataFrame:
    """
    Load a CSV directly from backend/data/cities/<city_id>/<filename>.
    """
    path = get_city_dir(city_id) / filename
    return _read_csv(path, required_cols=required_cols)


def load_city_healthcare_df(city_id: str) -> pd.DataFrame:
    """
    Load city healthcare CSV with notebook-compatible schema.
    """
    return load_city_dataframe(
        city_id,
        "healthcare.csv",
        required_cols=["name", "latitude", "longitude", "geometry"],
    )


def load_city_transport_stops_df(city_id: str) -> pd.DataFrame:
    """
    Load city transport stops CSV with notebook-compatible schema.
    """
    return load_city_dataframe(
        city_id,
        "transport_stops.csv",
        required_cols=["cluster_id", "stop_name", "Lines", "mode", "longitude", "latitude"],
    )


def load_city_healthcare_gdf(city_id: str) -> gpd.GeoDataFrame:
    """
    Load healthcare points as GeoDataFrame in EPSG:4326.
    """
    df = load_city_healthcare_df(city_id)
    gdf = gpd.GeoDataFrame(df.copy(), geometry=df["geometry"].apply(wkt.loads), crs="EPSG:4326")
    return gdf


def load_city_transport_stops_gdf(city_id: str) -> gpd.GeoDataFrame:
    """
    Load transport stops as GeoDataFrame in EPSG:4326.
    """
    df = load_city_transport_stops_df(city_id)
    gdf = gpd.GeoDataFrame(df.copy(), geometry=gpd.points_from_xy(df["longitude"], df["latitude"]), crs="EPSG:4326")
    return gdf


def load_model_artifact(city_id: str, model_name: str | None = None) -> Any:
    """
    Load model artifact from city folder.

    Args:
        city_id: city identifier.
        model_name: optional model file name; defaults to model.pkl.
    """
    folder = get_city_dir(city_id)
    model_path = folder / (model_name or "model.pkl")
    if not model_path.exists():
        raise CityDataNotFoundError(f"Model artifact not found: {model_path}")
    return joblib.load(model_path) if model_path.suffix in {".joblib"} else _load_pickle_with_joblib_fallback(model_path)


def _load_pickle_with_joblib_fallback(path: Path) -> Any:
    """
    Load pickled model with joblib for compatibility with existing artifacts.
    """
    try:
        return joblib.load(path)
    except Exception as exc:
        raise ArtifactValidationError(f"Unable to load model artifact '{path.name}': {exc}") from exc


def load_baseline_artifact(city_id: str) -> pd.DataFrame:
    """
    Load city baseline feature artifact (features.csv).
    """
    paths = get_city_paths(city_id)
    return _read_csv(paths.features_csv)


def load_simulation_artifact(city_id: str, filename: str | None = None) -> pd.DataFrame:
    """
    Load simulation artifact from city folder.

    Notes:
    - Existing backend does not persist simulation outputs by default.
    - This loader supports future persisted files like simulation_results.csv.
    """
    file_name = filename or "simulation_results.csv"
    path = get_city_dir(city_id) / file_name
    return _read_csv(path)


def load_notebook_origin_metrics(city_id: str) -> pd.DataFrame:
    """
    Load notebook-derived origin-level metrics.

    Preference order:
    1) data/interim/origin_accessibility_metrics.csv
    2) data/interim/worldpop_origins.csv
    3) data/interim/worldpop_origin_points.csv
    """
    paths = get_city_paths(city_id)
    df: pd.DataFrame | None = None
    if paths.interim_origin_metrics_csv.exists():
        df = _read_csv(paths.interim_origin_metrics_csv)
    elif paths.interim_worldpop_origins_csv.exists():
        df = _read_csv(paths.interim_worldpop_origins_csv)
    elif paths.interim_worldpop_origin_points_csv.exists():
        df = _read_csv(paths.interim_worldpop_origin_points_csv)
    if df is not None:
        if "city_id" in df.columns:
            city_rows = df[df["city_id"].astype(str).str.lower() == city_id.lower()].copy()
            if city_rows.empty:
                raise CityDataNotFoundError(f"Origin metrics exist but no rows match city_id='{city_id}'")
            return city_rows
        cfg = load_city_config(city_id)
        if not bool(cfg.get("feature_flags", {}).get("allow_unscoped_origin_metrics")):
            raise CityDataNotFoundError(
                f"Origin metrics are not city-scoped (missing city_id), so city '{city_id}' cannot be selected safely."
            )
        return df
    raise CityDataNotFoundError(
        "No notebook origin metrics found. Expected one of: "
        f"{paths.interim_origin_metrics_csv}, "
        f"{paths.interim_worldpop_origins_csv}, "
        f"or {paths.interim_worldpop_origin_points_csv}"
    )


def load_notebook_district_summary(city_id: str) -> pd.DataFrame:
    """
    Load notebook-derived district summary table.
    """
    _ = city_id
    paths = get_city_paths(city_id)
    return _read_csv(paths.final_district_summary_csv)


def _read_first_existing_csv(paths: list[Path], required_cols: list[str] | None = None) -> pd.DataFrame:
    for p in paths:
        if p.exists():
            return _read_csv(p, required_cols=required_cols)
    raise CityDataNotFoundError(
        "No matching modeling artifact found. Tried: " + ", ".join(str(p) for p in paths)
    )


def load_notebook_modeling_csv(city_id: str, filename: str, required_cols: list[str] | None = None) -> pd.DataFrame:
    """
    Load notebook-derived modeling CSVs with fallback between final/modeling_results and processed.
    """
    paths = get_city_paths(city_id)
    if filename == "cls_test_clean.csv":
        candidates = [paths.final_cls_test_clean_csv, paths.processed_cls_test_clean_csv]
    elif filename == "cls_cv_clean.csv":
        candidates = [paths.final_cls_cv_clean_csv, paths.processed_cls_cv_clean_csv]
    elif filename == "classification_clean_feature_importance.csv":
        candidates = [paths.final_feature_importance_csv, paths.processed_feature_importance_csv]
    else:
        candidates = [paths.final_modeling_results_dir / filename]
    return _read_first_existing_csv(candidates, required_cols=required_cols)


def load_notebook_feature_importance(city_id: str) -> pd.DataFrame:
    """
    Load permutation feature importance exported by modeling notebook.
    """
    paths = get_city_paths(city_id)
    return _read_first_existing_csv(
        [paths.final_feature_importance_csv, paths.processed_feature_importance_csv],
        required_cols=["feature"],
    )

