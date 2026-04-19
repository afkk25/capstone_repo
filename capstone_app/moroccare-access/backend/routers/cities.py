from __future__ import annotations

import hashlib
from pathlib import Path
from typing import Any, Tuple

import geopandas as gpd
import numpy as np
import pandas as pd
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from shapely import wkt

from core.config import city_dir, list_city_ids, load_cities_registry, load_city_config
from core.equity import compute_equity
from core.features import compute_features
from core.modeling import load_model, predict, train_model
from services.cache import clear_city_cache

router = APIRouter(tags=["cities"], prefix="/api")


def _load_csv(path: Path, required_cols: list[str]) -> pd.DataFrame:
    if not path.exists():
        raise FileNotFoundError(str(path))
    df = pd.read_csv(path)
    missing = [c for c in required_cols if c not in df.columns]
    if missing:
        raise ValueError(f"Missing columns in {path.name}: {missing}")
    return df


def _load_city_geo(city_id: str) -> Tuple[dict[str, Any], gpd.GeoDataFrame, gpd.GeoDataFrame]:
    cfg = load_city_config(city_id)
    folder = city_dir(city_id)
    healthcare_df = _load_csv(folder / "healthcare.csv", ["name", "latitude", "longitude", "geometry"])
    stops_df = _load_csv(folder / "transport_stops.csv", ["cluster_id", "stop_name", "Lines", "mode", "longitude", "latitude"])

    healthcare_gdf = gpd.GeoDataFrame(
        healthcare_df.copy(),
        geometry=healthcare_df["geometry"].apply(wkt.loads),
        crs="EPSG:4326",
    )
    stops_gdf = gpd.GeoDataFrame(
        stops_df.copy(),
        geometry=gpd.points_from_xy(stops_df["longitude"], stops_df["latitude"]),
        crs="EPSG:4326",
    )
    return cfg, healthcare_gdf, stops_gdf


def _file_sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        while True:
            chunk = f.read(1024 * 1024)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()


def _source_hash(city_id: str) -> str:
    folder = city_dir(city_id)
    healthcare_path = folder / "healthcare.csv"
    stops_path = folder / "transport_stops.csv"
    if not healthcare_path.exists() or not stops_path.exists():
        return ""
    return f"{_file_sha256(healthcare_path)}|{_file_sha256(stops_path)}"


def _artifacts_stale(city_id: str) -> bool:
    """
    Return True when CSV inputs are newer than model artifacts.
    This keeps frontend data in sync after CSV updates.
    """
    folder = city_dir(city_id)
    healthcare_path = folder / "healthcare.csv"
    stops_path = folder / "transport_stops.csv"
    model_path = folder / "model.pkl"
    feature_path = folder / "feature_names.json"
    features_path = folder / "features.csv"

    if not healthcare_path.exists() or not stops_path.exists():
        return False
    if not model_path.exists() or not feature_path.exists() or not features_path.exists():
        return True

    src_mtime = max(healthcare_path.stat().st_mtime, stops_path.stat().st_mtime)
    artifact_mtime = min(model_path.stat().st_mtime, feature_path.stat().st_mtime, features_path.stat().st_mtime)
    return src_mtime > artifact_mtime


def _artifacts_inconsistent(city_id: str, features_df: pd.DataFrame) -> bool:
    """
    Detect artifact drift even when mtime does not change (copy/overwrite preserving timestamp).
    """
    folder = city_dir(city_id)
    hash_path = folder / "source_hash.txt"
    current_hash = _source_hash(city_id)
    if not current_hash:
        return False
    if not hash_path.exists():
        return True
    stored_hash = hash_path.read_text(encoding="utf-8").strip()
    if stored_hash != current_hash:
        return True

    # Additional structural guardrail.
    healthcare_df = _load_csv(folder / "healthcare.csv", ["name", "latitude", "longitude", "geometry"])
    if len(features_df) != len(healthcare_df):
        return True
    return False


def _resolve_accessibility_scores(features_df: pd.DataFrame, scores: Any) -> np.ndarray:
    resolved = np.asarray(scores, dtype=float)
    if resolved.size == 0:
        return resolved
    resolved = np.nan_to_num(resolved, nan=0.0, posinf=1.0, neginf=0.0)
    if np.any(resolved > 0.0):
        return np.clip(resolved, 0.0, 1.0)

    # Fallback for stale/degenerate model artifacts: reuse persisted training targets.
    for col in ("accessibility_score", "baseline_score"):
        if col in features_df.columns:
            fallback = pd.to_numeric(features_df[col], errors="coerce").fillna(0.0).to_numpy(dtype=float)
            if fallback.size == resolved.size and np.any(fallback > 0.0):
                return np.clip(fallback, 0.0, 1.0)
    return np.clip(resolved, 0.0, 1.0)


def derive_2sfca_scores(df: pd.DataFrame) -> pd.Series:
    if df.empty:
        return pd.Series(dtype=float)

    if "score_2sfca" in df.columns:
        values = pd.to_numeric(df["score_2sfca"], errors="coerce").fillna(0.0)
        if (values != 0.0).any() or "num_healthcare_facilities" not in df.columns:
            return values.astype(float)

    if "healthcare_density_1km" in df.columns:
        values = pd.to_numeric(df["healthcare_density_1km"], errors="coerce").fillna(0.0)
        if (values != 0.0).any() or "num_healthcare_facilities" not in df.columns:
            return values.astype(float)

    if "num_healthcare_facilities" in df.columns:
        counts = pd.to_numeric(df["num_healthcare_facilities"], errors="coerce").fillna(0.0)
        return (counts / float(np.pi)).astype(float)

    return pd.Series(0.0, index=df.index, dtype=float)


def ensure_baseline_data(city_id: str) -> tuple[pd.DataFrame, Any]:
    if city_id not in list_city_ids():
        raise FileNotFoundError(f"City '{city_id}' is not registered")
    folder = city_dir(city_id)
    hash_path = folder / "source_hash.txt"
    source_hash = _source_hash(city_id)
    try:
        if _artifacts_stale(city_id):
            raise FileNotFoundError("Model artifacts are stale and need retraining")
        model, feature_names, features_df = load_model(city_id)
        if _artifacts_inconsistent(city_id, features_df):
            raise FileNotFoundError("Model artifacts are inconsistent with source data")
        scores = predict(model, features_df, feature_names)
    except (FileNotFoundError, AttributeError, EOFError, KeyError, ValueError):
        cfg, healthcare_gdf, stops_gdf = _load_city_geo(city_id)
        features_df = compute_features(healthcare_gdf, stops_gdf, cfg)
        model, feature_names, features_df = train_model(features_df, city_id)
        source_hash = _source_hash(city_id)
        if source_hash:
            hash_path.write_text(source_hash, encoding="utf-8")
        scores = predict(model, features_df, feature_names)
    else:
        if source_hash and (not hash_path.exists() or hash_path.read_text(encoding="utf-8").strip() != source_hash):
            hash_path.write_text(source_hash, encoding="utf-8")
    scores = _resolve_accessibility_scores(features_df, scores)
    return features_df, scores


@router.get("/cities")
def get_cities() -> list[dict[str, Any]]:
    registry = load_cities_registry()
    if registry:
        return [
            {
                "id": city["id"],
                "name": city["name"],
                "center_lat": city.get("center_lat"),
                "center_lon": city.get("center_lon"),
            }
            for city in registry
        ]

    cities = []
    for city_id in list_city_ids():
        cfg = load_city_config(city_id)
        cities.append(
            {
                "id": cfg["city_id"],
                "name": cfg["display_name"],
                "center_lat": cfg["center_lat"],
                "center_lon": cfg["center_lon"],
            }
        )
    return cities


@router.get("/cities/{city_id}/baseline")
def get_city_baseline(city_id: str) -> dict[str, Any]:
    try:
        clear_city_cache(city_id)
        _, _, stops_gdf = _load_city_geo(city_id)
        features_df, scores = ensure_baseline_data(city_id)
        equity = compute_equity(features_df, scores)
        score_2sfca = derive_2sfca_scores(features_df).to_numpy(dtype=float)
        facilities = []
        vulns = equity["vulnerability_scores"]
        for i, row in features_df.reset_index(drop=True).iterrows():
            score = float(scores[i])
            facilities.append(
                {
                    "name": str(row["facility"]),
                    "district_name": str(row["facility"]),
                    "latitude": float(row["latitude"]),
                    "longitude": float(row["longitude"]),
                    "urban_ring": str(row["urban_ring"]),
                    "accessibility_score": score,
                    "baseline_score": score,
                    "travel_time_min": float((1.0 - max(0.0, min(1.0, score))) * 60.0),
                    "score_2sfca": float(score_2sfca[i]),
                    "population": float(row.get("population", 0.0)),
                    "underserved": 1 if score < 0.5 else 0,
                    "vulnerability_score": float(vulns[i]),
                }
            )
        transport_stops = []
        for _, row in stops_gdf.reset_index(drop=True).iterrows():
            transport_stops.append(
                {
                    "stop_name": str(row.get("stop_name", "")),
                    "latitude": float(row["latitude"]),
                    "longitude": float(row["longitude"]),
                    "cluster_id": int(row["cluster_id"]) if pd.notna(row.get("cluster_id")) else None,
                    "mode": str(row.get("mode", "")),
                    "lines": str(row.get("Lines", "")),
                }
            )
        return {
            "facilities": facilities,
            "transport_stops": transport_stops,
            "equity": equity,
            "scenarios_available": [
                "baseline",
                "transport_plus",
                "walkability_plus",
                "facility_plus",
                "combined",
            ],
        }
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"City '{city_id}' not found")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/cities/{city_id}/districts")
def get_city_district_geojson(city_id: str) -> Any:
    """
    Lightweight GeoJSON endpoint for map rendering.
    Geometry is represented as facility points to keep compatibility with existing artifacts.
    """
    try:
        _, healthcare_gdf, _ = _load_city_geo(city_id)
        features_df, scores = ensure_baseline_data(city_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"City '{city_id}' not found")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    attr_df = features_df.copy().reset_index(drop=True)
    attr_df["accessibility_score"] = pd.Series(scores).astype(float).to_numpy()
    attr_df["district_name"] = attr_df["facility"].astype(str)
    attr_df["travel_time_min"] = (1.0 - attr_df["accessibility_score"].clip(lower=0.0, upper=1.0)) * 60.0
    attr_df["score_2sfca"] = derive_2sfca_scores(attr_df).to_numpy(dtype=float)
    attr_df["underserved"] = (attr_df["accessibility_score"] < 0.5).astype(int)

    geo = healthcare_gdf.reset_index(drop=True).copy()
    geo["district_name"] = attr_df["district_name"]
    geo["accessibility_score"] = attr_df["accessibility_score"]
    geo["travel_time_min"] = attr_df["travel_time_min"]
    geo["score_2sfca"] = attr_df["score_2sfca"]
    geo["underserved"] = attr_df["underserved"]
    geo["population"] = pd.to_numeric(attr_df.get("population", 0.0), errors="coerce").fillna(0.0)

    return Response(content=geo.to_json(), media_type="application/json")
