from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Tuple

import geopandas as gpd
import numpy as np
import pandas as pd
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from shapely import wkt
from shapely.geometry import Point

from core.config import city_dir, list_city_ids, load_cities_registry, load_city_config
from core.equity import compute_equity
from core.features import compute_facility_proxy_features, compute_origin_features
from core.modeling import load_model, predict, train_model
from services.cache import clear_city_cache
from services.districts import DistrictDataUnavailable, assign_districts_to_points, district_geojson_with_metrics
from services.notebook_bridge.loaders import CityDataNotFoundError, get_city_paths, load_notebook_origin_metrics

router = APIRouter(tags=["cities"], prefix="/api")

BASELINE_VERSION = "origin-first-districts-v3"
BASELINE_METADATA_PATH = "baseline_metadata.json"


def _clean_label(value: Any, fallback: str) -> str:
    if value is None:
        return fallback
    try:
        if pd.isna(value):
            return fallback
    except (TypeError, ValueError):
        pass
    text = str(value).strip()
    if not text or text.lower() in {"nan", "none", "null", "unknown"}:
        return fallback
    return text


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


def _file_fingerprint(path: Path) -> str:
    stat = path.stat()
    return f"{path.name}:{stat.st_size}:{stat.st_mtime}"


def _origin_source_files(city_id: str) -> list[Path]:
    try:
        paths = get_city_paths(city_id)
    except CityDataNotFoundError:
        return []
    return [
        paths.interim_origin_metrics_csv,
        paths.interim_worldpop_origins_csv,
        paths.interim_worldpop_origin_points_csv,
        paths.processed_districts_with_worldpop_gpkg,
        paths.final_district_summary_gpkg,
        paths.final_district_summary_csv,
    ]


def _source_hash(city_id: str) -> str:
    folder = city_dir(city_id)
    files = [
        folder / "healthcare.csv",
        folder / "transport_stops.csv",
        *[p for p in _origin_source_files(city_id)],
    ]
    parts = [BASELINE_VERSION]
    for p in files:
        if p.exists():
            parts.append(_file_fingerprint(p))
        else:
            parts.append(f"{p.name}:missing")
    return "|".join(parts)


def _read_baseline_metadata(city_id: str) -> dict[str, Any]:
    metadata_path = city_dir(city_id) / BASELINE_METADATA_PATH
    if not metadata_path.exists():
        return {}
    try:
        return json.loads(metadata_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}


def _write_baseline_metadata(city_id: str, metadata: dict[str, Any]) -> None:
    metadata_path = city_dir(city_id) / BASELINE_METADATA_PATH
    metadata_path.write_text(json.dumps(metadata, indent=2), encoding="utf-8")


def _load_city_origin_metrics(city_id: str) -> tuple[pd.DataFrame, list[str]]:
    warnings: list[str] = []
    try:
        origins = load_notebook_origin_metrics(city_id)
    except CityDataNotFoundError:
        return pd.DataFrame(), [f"Origin-level data not found for city '{city_id}'. Falling back to facility proxy rows."]

    if origins.empty:
        return pd.DataFrame(), [f"Origin-level data is empty for city '{city_id}'. Falling back to facility proxy rows."]

    # If the file is multi-city, filter by city id where possible.
    if "city_id" in origins.columns:
        city_filtered = origins[origins["city_id"].astype(str).str.lower() == city_id.lower()].copy()
        if city_filtered.empty:
            return pd.DataFrame(), [f"Origin-level data exists but has no rows for city '{city_id}'. Falling back to facility proxy rows."]
        origins = city_filtered
    elif not bool(load_city_config(city_id).get("feature_flags", {}).get("allow_unscoped_origin_metrics")):
        warnings.append(
            f"Origin-level file has no city_id column for city '{city_id}'. Falling back to facility proxy rows."
        )
        return pd.DataFrame(), warnings

    return origins.copy(), warnings


def _build_analysis_frame(city_id: str, cfg: dict[str, Any], healthcare_gdf: gpd.GeoDataFrame, stops_gdf: gpd.GeoDataFrame) -> tuple[pd.DataFrame, dict[str, Any]]:
    origin_df, warnings = _load_city_origin_metrics(city_id)
    if not origin_df.empty:
        features_df = compute_origin_features(origin_df, healthcare_gdf, stops_gdf, cfg)
        if (
            not features_df.empty
            and (
                "district_id" not in features_df.columns
                or "district_name" not in features_df.columns
                or features_df["district_name"].astype(str).str.startswith("Area ").all()
            )
        ):
            try:
                features_df, district_warnings = assign_districts_to_points(city_id, features_df)
                warnings.extend(district_warnings)
            except DistrictDataUnavailable:
                warnings.append("District assignment is not available for the current dataset.")
        analysis_unit = "origin"
        source = "origin_metrics"
    else:
        features_df = compute_facility_proxy_features(healthcare_gdf, stops_gdf, cfg)
        try:
            features_df, district_warnings = assign_districts_to_points(city_id, features_df)
            warnings.extend(district_warnings)
        except DistrictDataUnavailable:
            pass
        analysis_unit = "facility_proxy"
        source = "facility_fallback"

    if features_df.empty:
        raise ValueError("No rows available for baseline feature generation")

    features_df["analysis_unit"] = analysis_unit
    if "origin_id" not in features_df.columns:
        features_df["origin_id"] = features_df.index.astype(str)
    if "origin_name" not in features_df.columns:
        features_df["origin_name"] = features_df["origin_id"].astype(str).radd("Origin ")
    if "district_name" not in features_df.columns:
        features_df["district_name"] = "Unknown"

    metadata = {
        "analysis_unit": analysis_unit,
        "source": source,
        "warnings": warnings,
        "source_hash": _source_hash(city_id),
        "version": BASELINE_VERSION,
    }
    return features_df, metadata


def _artifacts_stale(city_id: str) -> bool:
    folder = city_dir(city_id)
    model_path = folder / "model.pkl"
    feature_path = folder / "feature_names.json"
    features_path = folder / "features.csv"
    metadata = _read_baseline_metadata(city_id)
    if not model_path.exists() or not feature_path.exists() or not features_path.exists():
        return True
    if metadata.get("version") != BASELINE_VERSION:
        return True
    if metadata.get("source_hash") != _source_hash(city_id):
        return True
    return False


def _resolve_accessibility_scores(features_df: pd.DataFrame, scores: Any) -> np.ndarray:
    resolved = np.asarray(scores, dtype=float)
    if resolved.size == 0:
        return resolved
    resolved = np.nan_to_num(resolved, nan=0.0, posinf=1.0, neginf=0.0)
    if np.any(resolved > 0.0):
        return np.clip(resolved, 0.0, 1.0)

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

    try:
        if _artifacts_stale(city_id):
            raise FileNotFoundError("Model artifacts are stale and need retraining")
        model, feature_names, features_df = load_model(city_id)
        scores = predict(model, features_df, feature_names)
    except (FileNotFoundError, AttributeError, EOFError, KeyError, ValueError):
        cfg, healthcare_gdf, stops_gdf = _load_city_geo(city_id)
        features_df, metadata = _build_analysis_frame(city_id, cfg, healthcare_gdf, stops_gdf)
        model, feature_names, features_df = train_model(features_df, city_id)
        _write_baseline_metadata(city_id, metadata)
        scores = predict(model, features_df, feature_names)
    else:
        metadata = _read_baseline_metadata(city_id)
        if metadata.get("source_hash") != _source_hash(city_id):
            cfg, healthcare_gdf, stops_gdf = _load_city_geo(city_id)
            features_df, metadata = _build_analysis_frame(city_id, cfg, healthcare_gdf, stops_gdf)
            model, feature_names, features_df = train_model(features_df, city_id)
            _write_baseline_metadata(city_id, metadata)
            scores = predict(model, features_df, feature_names)

    scores = _resolve_accessibility_scores(features_df, scores)
    return features_df, scores


def _origin_rows(features_df: pd.DataFrame, scores: np.ndarray) -> list[dict[str, Any]]:
    score_2sfca = derive_2sfca_scores(features_df).to_numpy(dtype=float)
    rows = []
    for i, row in features_df.reset_index(drop=True).iterrows():
        score = float(scores[i])
        origin_id = str(row.get("origin_id", i))
        origin_name = _clean_label(row.get("origin_name"), f"Origin {i + 1}")
        analysis_unit = _clean_label(row.get("analysis_unit"), "")
        district_fallback = origin_name if analysis_unit == "facility_proxy" else "Unassigned area"
        district_name = _clean_label(row.get("district_name"), district_fallback)
        pop_value = pd.to_numeric(pd.Series([row.get("population")]), errors="coerce").fillna(0.0).iloc[0]
        rows.append(
            {
                "id": origin_id,
                "origin_id": origin_id,
                "name": origin_name,
                "district_name": str(district_name),
                "district_id": row.get("district_id"),
                "urban_ring": str(row.get("urban_ring", "Unknown")),
                "latitude": float(row["latitude"]),
                "longitude": float(row["longitude"]),
                "accessibility_score": score,
                "baseline_score": score,
                "travel_time_min": float((1.0 - max(0.0, min(1.0, score))) * 60.0),
                "score_2sfca": float(score_2sfca[i]),
                "population": float(pop_value),
                "underserved": 1 if score < 0.5 else 0,
            }
        )
    return rows


def _facility_rows(healthcare_gdf: gpd.GeoDataFrame) -> list[dict[str, Any]]:
    out = []
    for i, row in healthcare_gdf.reset_index(drop=True).iterrows():
        fallback_name = f"Healthcare facility {i + 1}"
        name = _clean_label(row.get("name"), fallback_name)
        out.append(
            {
                "id": f"facility-{i}",
                "name": name,
                "latitude": float(row["latitude"]),
                "longitude": float(row["longitude"]),
            }
        )
    return out


def _stop_rows(stops_gdf: gpd.GeoDataFrame) -> list[dict[str, Any]]:
    out = []
    for _, row in stops_gdf.reset_index(drop=True).iterrows():
        out.append(
            {
                "stop_name": str(row.get("stop_name", "")),
                "latitude": float(row["latitude"]),
                "longitude": float(row["longitude"]),
                "cluster_id": int(row["cluster_id"]) if pd.notna(row.get("cluster_id")) else None,
                "mode": str(row.get("mode", "")),
                "lines": str(row.get("Lines", "")),
            }
        )
    return out


def _district_summary_from_origins(features_df: pd.DataFrame, scores: np.ndarray) -> list[dict[str, Any]]:
    if features_df.empty or "district_name" not in features_df.columns:
        return []
    full = features_df.copy().reset_index(drop=True)
    score_series = pd.Series(scores).astype(float)
    work = full.copy()
    work = work[work["district_name"].notna()].copy()
    if work.empty:
        return []
    work["accessibility_score"] = score_series.loc[work.index].to_numpy(dtype=float)
    work["population"] = pd.to_numeric(work.get("population", 0.0), errors="coerce").fillna(0.0).clip(lower=0.0)
    work["travel_time_min"] = (1.0 - work["accessibility_score"].clip(lower=0.0, upper=1.0)) * 60.0

    def weighted_mean(values: pd.Series, weights: pd.Series) -> float:
        v = pd.to_numeric(values, errors="coerce").to_numpy(dtype=float)
        w = pd.to_numeric(weights, errors="coerce").fillna(0.0).clip(lower=0.0).to_numpy(dtype=float)
        mask = np.isfinite(v) & np.isfinite(w) & (w > 0)
        if mask.sum() == 0:
            return float(np.nanmean(v)) if np.isfinite(v).any() else 0.0
        return float(np.average(v[mask], weights=w[mask]))

    group_cols = ["district_name"]
    if "district_id" in work.columns:
        group_cols = ["district_id", "district_name"]

    grouped = (
        work.groupby(group_cols, dropna=False)
        .apply(
            lambda g: pd.Series(
                {
                    "district_name": str(g["district_name"].iloc[0]),
                    "district_id": g["district_id"].iloc[0] if "district_id" in g.columns else None,
                    "origin_count": int(len(g)),
                    "population": float(g["population"].sum()),
                    "avg_accessibility_score": weighted_mean(g["accessibility_score"], g["population"]),
                    "avg_travel_time_min": weighted_mean(g["travel_time_min"], g["population"]),
                    "underserved_pct": float(100.0 * g.loc[g["accessibility_score"] < 0.5, "population"].sum() / g["population"].sum())
                    if float(g["population"].sum()) > 0
                    else float((g["accessibility_score"] < 0.5).mean() * 100.0),
                    "pct_pop_score_below_50": float(100.0 * g.loc[g["accessibility_score"] < 0.5, "population"].sum() / g["population"].sum())
                    if float(g["population"].sum()) > 0
                    else float((g["accessibility_score"] < 0.5).mean() * 100.0),
                    "centroid_latitude": float(pd.to_numeric(g["latitude"], errors="coerce").mean()),
                    "centroid_longitude": float(pd.to_numeric(g["longitude"], errors="coerce").mean()),
                }
            )
        )
        .reset_index(drop=True)
        .sort_values(["avg_accessibility_score", "underserved_pct"], ascending=[True, False])
        .reset_index(drop=True)
    )
    grouped["rank"] = np.arange(1, len(grouped) + 1)
    return grouped.to_dict(orient="records")


def _district_aggregate_geojson(features_df: pd.DataFrame, scores: np.ndarray) -> dict[str, Any]:
    _ = features_df, scores
    return {"type": "FeatureCollection", "features": []}


@router.get("/cities")
def get_cities() -> list[dict[str, Any]]:
    registry = {city["id"]: city for city in load_cities_registry()}
    cities = []
    for city_id in list_city_ids():
        cfg = load_city_config(city_id)
        registry_entry = registry.get(city_id, {})
        cities.append(
            {
                "id": cfg["city_id"],
                "name": cfg["display_name"],
                "center_lat": cfg["center_lat"],
                "center_lon": cfg["center_lon"],
                "default_zoom": cfg.get("default_zoom"),
                "datasets": cfg.get("datasets", {}),
                "simulation": cfg.get("simulation", {}),
                "simulation_capabilities": cfg.get("simulation_capabilities", {}),
                "supported_intervention_types": cfg.get("supported_intervention_types", []),
                "artifact_paths": cfg.get("artifact_paths", {}),
                "feature_flags": cfg.get("feature_flags", {}),
                "registry_name": registry_entry.get("name"),
            }
        )
    return cities


@router.get("/cities/{city_id}/baseline")
def get_city_baseline(city_id: str) -> dict[str, Any]:
    try:
        clear_city_cache(city_id)
        _, healthcare_gdf, stops_gdf = _load_city_geo(city_id)
        features_df, scores = ensure_baseline_data(city_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"City '{city_id}' not found")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    metadata = _read_baseline_metadata(city_id)
    analysis_unit = str(metadata.get("analysis_unit", features_df.get("analysis_unit", pd.Series(["unknown"])).iloc[0]))
    origins = _origin_rows(features_df, scores)
    district_summaries = _district_summary_from_origins(features_df, scores) if analysis_unit == "origin" else []
    equity = compute_equity(features_df, scores)

    return {
        "analysis_unit": analysis_unit,
        "warnings": metadata.get("warnings", []),
        "origins": origins,
        "facilities": _facility_rows(healthcare_gdf),
        "transport_stops": _stop_rows(stops_gdf),
        "district_summaries": district_summaries,
        "equity": equity,
        "scenarios_available": [
            "baseline",
            "transport_plus",
            "walkability_plus",
            "facility_plus",
            "combined",
        ],
    }


@router.get("/cities/{city_id}/districts")
def get_city_district_geojson(city_id: str) -> Any:
    try:
        features_df, scores = ensure_baseline_data(city_id)
        metadata = _read_baseline_metadata(city_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"City '{city_id}' not found")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    summaries = _district_summary_from_origins(features_df, np.asarray(scores, dtype=float)) if metadata.get("analysis_unit") == "origin" else []
    try:
        geojson, district_warnings = district_geojson_with_metrics(city_id, summaries)
    except DistrictDataUnavailable:
        geojson = {"type": "FeatureCollection", "features": []}
        district_warnings = ["District-level map geometry is not available for the current dataset."]
    warnings = [*metadata.get("warnings", []), *district_warnings]
    if warnings:
        geojson["warnings"] = warnings
    return Response(content=json.dumps(geojson), media_type="application/json")
