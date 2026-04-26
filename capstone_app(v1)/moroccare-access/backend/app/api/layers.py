from __future__ import annotations

import numpy as np
import pandas as pd
from fastapi import APIRouter, Query

from app.services.aggregation import aggregate_commune_summary
from app.services.city_registry import get_city_bundle
from app.services.json_utils import json_safe

router = APIRouter(prefix="/api/cities", tags=["layers"])


def _commune_geojson(city_id: str) -> dict:
    bundle = get_city_bundle(city_id)
    warnings: list[str] = []
    zones = bundle.zones if bundle.zones is not None else bundle.districts
    if zones is None:
        return {"type": "FeatureCollection", "features": [], "analysis_unit": "commune", "warnings": ["commune polygons unavailable"]}

    gdf = zones.copy()
    metrics = bundle.commune_summary if bundle.commune_summary is not None else aggregate_commune_summary(bundle.baseline_origins)
    if "commune_id" not in gdf.columns and "district_id" in gdf.columns:
        gdf["commune_id"] = gdf["district_id"]
    if "commune_name" not in gdf.columns:
        gdf["commune_name"] = gdf.get("commune", gdf.get("district_name", "Unknown"))
    if "district_name" not in gdf.columns:
        gdf["district_name"] = gdf.get("district", gdf["commune_name"])
    gdf["commune_id"] = gdf["commune_id"].astype(str)
    gdf["commune_name"] = gdf["commune_name"].astype(str)

    if metrics is not None and not metrics.empty:
        m = metrics.copy()
        if "commune_id" not in m.columns and "district_id" in m.columns:
            m["commune_id"] = m["district_id"]
        if "commune_name" not in m.columns and "district_name" in m.columns:
            m["commune_name"] = m["district_name"]
        m["commune_id"] = m["commune_id"].astype(str)
        m["commune_name"] = m["commune_name"].astype(str)

        merged = gdf.merge(m, on="commune_id", how="left")
        if merged.filter(regex="_y$").notna().sum().sum() == 0 and "commune_name" in gdf.columns and "commune_name" in m.columns:
            normalized = metrics.copy()
            normalized["commune_name_norm"] = m["commune_name"].astype(str).str.strip().str.lower()
            merged = gdf.copy()
            merged["commune_name_norm"] = merged["commune_name"].astype(str).str.strip().str.lower()
            merged = merged.merge(normalized.drop(columns=["commune_id", "district_id"], errors="ignore"), on="commune_name_norm", how="left")
            warnings.append("Joined metrics by commune_name fallback due to commune_id mismatch")
        gdf = merged.drop(columns=["commune_name_norm"], errors="ignore")
    else:
        warnings.append("No commune metrics available")

    keep_cols = [
        c
        for c in [
            "commune_id",
            "commune_name",
            "district_name",
            "population",
            "population_raster",
            "origin_count",
            "avg_total_travel_time_min_pw",
            "pop_weighted_accessibility_score",
            "pct_pop_access_60min",
            "pct_pop_score_below_50",
            "geometry",
        ]
        if c in gdf.columns
    ]
    view = gdf[keep_cols].to_crs("EPSG:4326") if keep_cols else gdf.to_crs("EPSG:4326")
    return json_safe({"type": "FeatureCollection", "analysis_unit": "commune", "features": view.__geo_interface__["features"], "warnings": warnings})


@router.get("/{city_id}/districts")
def districts(city_id: str) -> dict:
    return _commune_geojson(city_id)


@router.get("/{city_id}/communes")
def communes(city_id: str) -> dict:
    return _commune_geojson(city_id)


@router.get("/{city_id}/facilities")
def facilities(city_id: str) -> dict:
    bundle = get_city_bundle(city_id)
    if bundle.facilities is None:
        return {"type": "FeatureCollection", "features": []}
    gdf = bundle.facilities.to_crs("EPSG:4326").copy()
    gdf["latitude"] = gdf.geometry.y
    gdf["longitude"] = gdf.geometry.x
    valid = gdf["latitude"].notna() & gdf["longitude"].notna() & np.isfinite(gdf["latitude"]) & np.isfinite(gdf["longitude"])
    invalid_count = int((~valid).sum())
    gdf = gdf.loc[valid].copy()
    if "commune_id" not in gdf.columns and "district_id" in gdf.columns:
        gdf["commune_id"] = gdf["district_id"]
    if "commune_name" not in gdf.columns and "district_name" in gdf.columns:
        gdf["commune_name"] = gdf["district_name"]
    cols = [c for c in ["facility_id", "name", "type", "capacity", "commune_id", "commune_name", "district_name", "latitude", "longitude", "geometry"] if c in gdf.columns]
    warnings = [f"Skipped {invalid_count} facilities with invalid coordinates"] if invalid_count > 0 else []
    return json_safe({"type": "FeatureCollection", "analysis_unit": "commune", "features": gdf[cols].__geo_interface__["features"], "rows": gdf.drop(columns=["geometry"]).to_dict(orient="records"), "warnings": warnings})


@router.get("/{city_id}/layers/facilities")
def facilities_layer(city_id: str) -> dict:
    return facilities(city_id)


@router.get("/{city_id}/stops")
def stops(city_id: str) -> dict:
    bundle = get_city_bundle(city_id)
    if bundle.stops is None:
        return {"type": "FeatureCollection", "features": []}
    gdf = bundle.stops.to_crs("EPSG:4326").copy()
    gdf["latitude"] = gdf.geometry.y
    gdf["longitude"] = gdf.geometry.x
    valid = gdf["latitude"].notna() & gdf["longitude"].notna() & np.isfinite(gdf["latitude"]) & np.isfinite(gdf["longitude"])
    invalid_count = int((~valid).sum())
    gdf = gdf.loc[valid].copy()
    if "lines" not in gdf.columns and "Lines" in gdf.columns:
        gdf["lines"] = gdf["Lines"]
    cols = [c for c in ["stop_key", "stop_name", "cluster_id", "mode", "lines", "Lines", "commune_name", "latitude", "longitude", "geometry"] if c in gdf.columns]
    warnings = [f"Skipped {invalid_count} stops with invalid coordinates"] if invalid_count > 0 else []
    return json_safe({"type": "FeatureCollection", "analysis_unit": "commune", "features": gdf[cols].__geo_interface__["features"], "rows": gdf.drop(columns=["geometry"]).to_dict(orient="records"), "warnings": warnings})


@router.get("/{city_id}/layers/stops")
def stops_layer(city_id: str) -> dict:
    return stops(city_id)


@router.get("/{city_id}/origins")
def origins(
    city_id: str,
    limit: int = Query(default=500, ge=1, le=10000),
    offset: int = Query(default=0, ge=0),
    sample: int | None = Query(default=None, ge=1, le=10000),
    as_geojson: bool = Query(default=False),
) -> dict:
    bundle = get_city_bundle(city_id)
    origins_df = bundle.baseline_origins if bundle.baseline_origins is not None else bundle.origins
    if origins_df is None:
        return {"city_id": city_id, "count": 0, "rows": []}

    df = origins_df.drop(columns=["geometry"], errors="ignore").copy()
    total = len(df)
    sample_n = sample
    if sample_n is not None:
        rows_df = df.sample(n=min(sample_n, total), random_state=42)
    else:
        rows_df = df.iloc[offset : offset + limit]

    if as_geojson and origins_df is not None and "geometry" in origins_df.columns:
        geodf = origins_df.loc[rows_df.index].to_crs("EPSG:4326").copy()
        keep = [c for c in ["origin_id", "population", "commune_name", "district_name", "total_travel_time_min", "accessibility_score", "geometry"] if c in geodf.columns]
        return json_safe({"type": "FeatureCollection", "features": geodf[keep].__geo_interface__["features"], "count": total})

    rows = rows_df.to_dict(orient="records")
    return json_safe({"city_id": city_id, "count": total, "rows": rows, "limit": limit, "offset": offset, "analysis_unit": "commune"})
