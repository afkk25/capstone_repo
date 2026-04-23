from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

import geopandas as gpd
import numpy as np
import pandas as pd

from core.config import BASE_DIR, city_dir, load_city_config
from services.notebook_bridge.loaders import get_city_paths

logger = logging.getLogger(__name__)

DISTRICT_NAME_CANDIDATES = ["district", "commune", "district_name", "name"]
DISTRICT_ID_CANDIDATES = ["district_id", "id", "district_idx", "OBJECTID"]


class DistrictDataUnavailable(RuntimeError):
    """Raised when district geometry exists nowhere usable for a city."""


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


def _district_source_candidates(city_id: str) -> list[Path]:
    cfg = load_city_config(city_id)
    configured = _resolve_configured_path(
        str(cfg.get("datasets", {}).get("district_boundaries", "")),
        city_id,
    )
    paths = get_city_paths(city_id)
    candidates = [configured]
    if city_id.lower() == "casablanca":
        candidates.extend(
            [
                paths.processed_districts_with_worldpop_gpkg,
                paths.final_district_summary_gpkg,
                paths.processed_casablanca_districts_gpkg,
            ]
        )
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


def _clean_district_name(value: Any, fallback: str) -> str:
    try:
        if pd.isna(value):
            return fallback
    except (TypeError, ValueError):
        pass
    text = str(value).strip()
    return text if text and text.lower() not in {"nan", "none", "null", "unknown"} else fallback


def normalize_district_gdf(gdf: gpd.GeoDataFrame, *, source_path: Path, city_id: str) -> gpd.GeoDataFrame:
    if gdf.empty:
        raise DistrictDataUnavailable(f"District source is empty: {source_path.name}")
    if "geometry" not in gdf.columns:
        raise DistrictDataUnavailable(f"District source has no geometry column: {source_path.name}")
    if gdf.crs is None:
        raise DistrictDataUnavailable(f"District source has no CRS: {source_path.name}")

    work = gdf[gdf.geometry.notna() & ~gdf.geometry.is_empty].copy().reset_index(drop=True)
    if work.empty:
        raise DistrictDataUnavailable(f"District source has no valid geometries: {source_path.name}")

    name_col = _detect_column(list(work.columns), DISTRICT_NAME_CANDIDATES)
    id_col = _detect_column(list(work.columns), DISTRICT_ID_CANDIDATES)

    if name_col is None:
        work["district_name"] = [f"District {i + 1}" for i in range(len(work))]
    else:
        work["district_name"] = [
            _clean_district_name(value, f"District {i + 1}") for i, value in enumerate(work[name_col].to_list())
        ]

    if id_col is None:
        # Matches the notebook fallback in 03_data_analysis.ipynb for districts_with_worldpop.gpkg.
        work["district_id"] = np.arange(len(work)).astype(str)
    else:
        work["district_id"] = work[id_col].astype(str)

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
    preferred = [
        "district_id",
        "district_name",
        "population_raster",
        "population_worldpop",
        "pop_density_km2",
        "area_km2",
        "commune",
        "commune_type_encoded",
        "geometry",
        "district_source",
    ]
    keep = [col for col in preferred if col in work.columns]
    return work[keep].copy()


def load_city_districts(city_id: str) -> tuple[gpd.GeoDataFrame, list[str]]:
    warnings: list[str] = []
    last_error: Exception | None = None
    for candidate in _district_source_candidates(city_id):
        if not candidate.exists():
            continue
        try:
            return normalize_district_gdf(gpd.read_file(candidate), source_path=candidate, city_id=city_id), warnings
        except Exception as exc:
            last_error = exc
            warnings.append("A configured district layer could not be used.")
            logger.warning("Unable to load district source %s for %s: %s", candidate, city_id, exc)
    if last_error:
        raise DistrictDataUnavailable("District boundaries are not available in a usable format.") from last_error
    raise DistrictDataUnavailable("District boundaries are not available for the current dataset.")


def assign_districts_to_points(
    city_id: str,
    rows: pd.DataFrame,
    *,
    latitude_col: str = "latitude",
    longitude_col: str = "longitude",
) -> tuple[pd.DataFrame, list[str]]:
    if rows.empty or {latitude_col, longitude_col}.difference(rows.columns):
        return rows.copy(), []

    districts, warnings = load_city_districts(city_id)
    valid = rows.copy()
    lat = pd.to_numeric(valid[latitude_col], errors="coerce")
    lon = pd.to_numeric(valid[longitude_col], errors="coerce")
    valid = valid[lat.notna() & lon.notna()].copy()
    if valid.empty:
        return rows.copy(), warnings

    points = gpd.GeoDataFrame(valid, geometry=gpd.points_from_xy(valid[longitude_col], valid[latitude_col]), crs="EPSG:4326")
    metric_crs = load_city_config(city_id).get("crs_metric", "EPSG:32629") or "EPSG:32629"
    points_for_join = points.drop(columns=["district_id", "district_name"], errors="ignore")
    joined = gpd.sjoin(
        points_for_join.to_crs(metric_crs),
        districts[["district_id", "district_name", "geometry"]].to_crs(metric_crs),
        how="left",
        predicate="within",
    ).drop(columns=["index_right", "geometry"], errors="ignore")

    enriched = rows.copy()
    for col in ["district_id", "district_name"]:
        if col in joined.columns:
            enriched.loc[joined.index, col] = joined[col].astype("object").to_numpy()
    return enriched, warnings


def district_geojson_with_metrics(
    city_id: str,
    summaries: list[dict[str, Any]] | None = None,
) -> tuple[dict[str, Any], list[str]]:
    districts, warnings = load_city_districts(city_id)
    out = districts.to_crs("EPSG:4326").copy()
    if summaries:
        summary_df = pd.DataFrame(summaries).copy()
        if "district_id" in summary_df.columns:
            summary_df["district_id"] = summary_df["district_id"].astype(str)
            out = out.merge(summary_df, on="district_id", how="left", suffixes=("", "_summary"))
        elif "district_name" in summary_df.columns:
            out = out.merge(summary_df, on="district_name", how="left", suffixes=("", "_summary"))
    return json.loads(out.to_json()), warnings
