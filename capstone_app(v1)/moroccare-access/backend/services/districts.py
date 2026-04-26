from __future__ import annotations

import json
import logging
import re
from pathlib import Path
from typing import Any

import geopandas as gpd
import numpy as np
import pandas as pd

from core.config import BASE_DIR, city_dir, load_city_config
from services.notebook_bridge.loaders import get_city_paths

logger = logging.getLogger(__name__)

COMMUNE_NAME_CANDIDATES = ["commune", "commune_name", "district", "district_name", "name"]
DISTRICT_NAME_CANDIDATES = ["district", "district_name", "commune_name"]
DISTRICT_ID_CANDIDATES = ["district_id", "id", "district_idx", "OBJECTID", "FID"]


class DistrictDataUnavailable(RuntimeError):
    """Raised when district/commune geometry exists nowhere usable for a city."""


def _slug(value: str) -> str:
    token = re.sub(r"[^a-z0-9]+", "_", str(value).strip().lower())
    token = re.sub(r"_+", "_", token).strip("_")
    return token or "unknown"


def _clean_name(value: Any, fallback: str) -> str:
    try:
        if pd.isna(value):
            return fallback
    except Exception:
        pass
    text = str(value).strip()
    if not text or text.lower() in {"nan", "none", "null", "unknown"}:
        return fallback
    return text


def _resolve_repo_root() -> Path:
    for root in [BASE_DIR, *BASE_DIR.parents]:
        data_dir = root / "data"
        if (data_dir / "processed").exists() or (data_dir / "final").exists() or (data_dir / "interim").exists():
            return root
    return BASE_DIR


def _resolve_configured_path(raw_path: str, city_id: str) -> Path | None:
    text = str(raw_path or "").strip()
    if not text:
        return None
    path = Path(text)
    candidates = [path] if path.is_absolute() else [
        city_dir(city_id) / path,
        BASE_DIR / path,
        BASE_DIR / "data" / path,
        _resolve_repo_root() / path,
    ]
    return next((candidate for candidate in candidates if candidate.exists()), None)


def _zone_source_candidates(city_id: str) -> list[Path]:
    cfg = load_city_config(city_id)
    configured = _resolve_configured_path(str(cfg.get("datasets", {}).get("district_boundaries", "")), city_id)
    paths = get_city_paths(city_id)
    candidates = [configured]
    if city_id.lower() == "casablanca":
        candidates.extend([paths.processed_districts_with_worldpop_gpkg, paths.final_district_summary_gpkg, paths.processed_casablanca_districts_gpkg])
    seen: set[Path] = set()
    out: list[Path] = []
    for candidate in candidates:
        if candidate is None:
            continue
        resolved = candidate.resolve()
        if resolved in seen:
            continue
        seen.add(resolved)
        out.append(candidate)
    return out


def _detect_column(columns: list[str], candidates: list[str]) -> str | None:
    by_lower = {str(col).lower(): str(col) for col in columns}
    for candidate in candidates:
        if candidate.lower() in by_lower:
            return by_lower[candidate.lower()]
    return None


def normalize_zone_gdf(gdf: gpd.GeoDataFrame, *, source_path: Path, city_id: str) -> gpd.GeoDataFrame:
    if gdf.empty:
        raise DistrictDataUnavailable(f"Zone source is empty: {source_path.name}")
    if "geometry" not in gdf.columns or gdf.crs is None:
        raise DistrictDataUnavailable(f"Zone source has invalid geometry/CRS: {source_path.name}")

    work = gdf[gdf.geometry.notna() & ~gdf.geometry.is_empty].copy().reset_index(drop=True)
    if work.empty:
        raise DistrictDataUnavailable(f"Zone source has no valid geometries: {source_path.name}")

    commune_name_col = _detect_column(list(work.columns), COMMUNE_NAME_CANDIDATES)
    district_name_col = _detect_column(list(work.columns), DISTRICT_NAME_CANDIDATES)
    district_id_col = _detect_column(list(work.columns), DISTRICT_ID_CANDIDATES)

    work["commune_name"] = [
        _clean_name(value, f"Commune {i + 1}") for i, value in enumerate(work[commune_name_col].to_list())
    ] if commune_name_col else [f"Commune {i + 1}" for i in range(len(work))]

    work["district_name"] = [
        _clean_name(value, work["commune_name"].iloc[i]) for i, value in enumerate(work[district_name_col].to_list())
    ] if district_name_col else work["commune_name"].astype(str)

    work["commune_id"] = work.apply(lambda r: _slug(f"{r['district_name']}_{r['commune_name']}"), axis=1)
    work["district_id"] = work["commune_id"]  # compatibility alias
    if district_id_col is not None:
        work["district_id_raw"] = work[district_id_col].astype(str)

    metric_crs = load_city_config(city_id).get("crs_metric", "EPSG:32629") or "EPSG:32629"
    metric = work.to_crs(metric_crs)
    work["area_km2"] = pd.to_numeric(work.get("area_km2"), errors="coerce")
    missing_area = work["area_km2"].isna() | (work["area_km2"] <= 0)
    if missing_area.any():
        work.loc[missing_area, "area_km2"] = metric.loc[missing_area].geometry.area / 1_000_000

    if "population_worldpop" in work.columns and "population_raster" not in work.columns:
        work["population_raster"] = pd.to_numeric(work["population_worldpop"], errors="coerce").fillna(0.0)
    elif "population_raster" in work.columns:
        work["population_raster"] = pd.to_numeric(work["population_raster"], errors="coerce").fillna(0.0)
    else:
        work["population_raster"] = 0.0

    work["district_source"] = str(source_path)
    keep_cols = [c for c in [
        "commune_id",
        "commune_name",
        "district_name",
        "district_id",
        "population_raster",
        "population_worldpop",
        "pop_density_km2",
        "area_km2",
        "commune_type_encoded",
        "geometry",
        "district_source",
    ] if c in work.columns]
    return work[keep_cols].copy()


def load_city_districts(city_id: str) -> tuple[gpd.GeoDataFrame, list[str]]:
    warnings: list[str] = []
    last_error: Exception | None = None
    for candidate in _zone_source_candidates(city_id):
        if not candidate.exists():
            continue
        try:
            return normalize_zone_gdf(gpd.read_file(candidate), source_path=candidate, city_id=city_id), warnings
        except Exception as exc:
            last_error = exc
            warnings.append("A configured commune/district layer could not be used.")
            logger.warning("Unable to load zone source %s for %s: %s", candidate, city_id, exc)
    if last_error:
        raise DistrictDataUnavailable("Commune boundaries are not available in a usable format.") from last_error
    raise DistrictDataUnavailable("Commune boundaries are not available for the current dataset.")


def assign_zones_to_points(
    city_id: str,
    rows: pd.DataFrame,
    *,
    latitude_col: str = "latitude",
    longitude_col: str = "longitude",
) -> tuple[pd.DataFrame, list[str]]:
    if rows.empty or {latitude_col, longitude_col}.difference(rows.columns):
        return rows.copy(), []

    zones, warnings = load_city_districts(city_id)
    valid = rows.copy()
    lat = pd.to_numeric(valid[latitude_col], errors="coerce")
    lon = pd.to_numeric(valid[longitude_col], errors="coerce")
    valid = valid[lat.notna() & lon.notna()].copy()
    if valid.empty:
        return rows.copy(), warnings

    points = gpd.GeoDataFrame(valid, geometry=gpd.points_from_xy(valid[longitude_col], valid[latitude_col]), crs="EPSG:4326")
    metric_crs = load_city_config(city_id).get("crs_metric", "EPSG:32629") or "EPSG:32629"
    points_for_join = points.drop(columns=["commune_id", "commune_name", "district_name", "district_id"], errors="ignore")
    join_cols = zones[["commune_id", "commune_name", "district_name", "geometry"]].rename(
        columns={
            "commune_id": "_commune_id_join",
            "commune_name": "_commune_name_join",
            "district_name": "_district_name_join",
        }
    )
    joined = gpd.sjoin(points_for_join.to_crs(metric_crs), join_cols.to_crs(metric_crs), how="left", predicate="within").drop(
        columns=["index_right", "geometry"], errors="ignore"
    )

    enriched = rows.copy()
    for out_col, join_col in [
        ("commune_id", "_commune_id_join"),
        ("commune_name", "_commune_name_join"),
        ("district_name", "_district_name_join"),
    ]:
        if join_col in joined.columns:
            enriched.loc[joined.index, out_col] = joined[join_col].astype("object").to_numpy()
    if "commune_id" in enriched.columns:
        enriched["district_id"] = enriched["commune_id"]
    return enriched, warnings


def assign_districts_to_points(
    city_id: str,
    rows: pd.DataFrame,
    *,
    latitude_col: str = "latitude",
    longitude_col: str = "longitude",
) -> tuple[pd.DataFrame, list[str]]:
    """Compatibility alias. Primary output is commune-level columns."""
    return assign_zones_to_points(city_id, rows, latitude_col=latitude_col, longitude_col=longitude_col)


def district_geojson_with_metrics(city_id: str, summaries: list[dict[str, Any]] | None = None) -> tuple[dict[str, Any], list[str]]:
    zones, warnings = load_city_districts(city_id)
    out = zones.to_crs("EPSG:4326").copy()
    out["commune_id"] = out["commune_id"].astype(str)
    out["commune_name_norm"] = out["commune_name"].astype(str).str.strip().str.lower()
    if summaries:
        summary_df = pd.DataFrame(summaries).copy()
        if "commune_id" in summary_df.columns:
            summary_df["commune_id"] = summary_df["commune_id"].astype(str)
            out = out.merge(summary_df, on="commune_id", how="left", suffixes=("", "_summary"))
        else:
            if "commune_name" not in summary_df.columns and "district_name" in summary_df.columns:
                summary_df["commune_name"] = summary_df["district_name"]
            summary_df["commune_name_norm"] = summary_df["commune_name"].astype(str).str.strip().str.lower()
            out = out.merge(summary_df.drop(columns=["commune_id", "district_id"], errors="ignore"), on="commune_name_norm", how="left", suffixes=("", "_summary"))
    out = out.drop(columns=["commune_name_norm"], errors="ignore")
    payload = json.loads(out.to_json())
    payload["analysis_unit"] = "commune"
    return payload, warnings
