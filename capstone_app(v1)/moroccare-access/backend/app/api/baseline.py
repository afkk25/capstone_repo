from __future__ import annotations

import geopandas as gpd
import numpy as np
from fastapi import APIRouter, Query

from app.services.accessibility_engine import compute_origin_accessibility
from app.services.aggregation import aggregate_commune_summary, compute_kpis
from app.services.city_registry import get_city_bundle
from app.services.graph_builder import build_transport_graph
from app.services.json_utils import json_safe
from app.services.preprocessors import to_metric

router = APIRouter(prefix="/api/cities", tags=["baseline"])


def _facilities_near_transit_count(facilities: gpd.GeoDataFrame, stops: gpd.GeoDataFrame, radius_m: float = 500.0) -> int | None:
    if facilities is None or stops is None or facilities.empty or stops.empty:
        return None
    f = to_metric(facilities)
    s = to_metric(stops)
    joined = gpd.sjoin_nearest(f[["facility_id", "geometry"]], s[["geometry"]], how="left", distance_col="dist_m")
    return int((joined["dist_m"] <= radius_m).sum())


@router.get("/{city_id}/baseline")
def baseline(
    city_id: str,
    include_rows: bool = Query(default=False),
    include_facilities: bool = Query(default=False),
    include_transport_stops: bool = Query(default=False),
    include_map_layers: bool = Query(default=False),
) -> dict:
    bundle = get_city_bundle(city_id)

    warnings = list(bundle.readiness.warnings)

    if bundle.baseline_origins is not None and {"total_travel_time_min", "accessibility_score"}.issubset(bundle.baseline_origins.columns):
        origins = bundle.baseline_origins.copy()
    elif bundle.readiness.simulation_ready:
        art = build_transport_graph(bundle)
        bundle.graph_artifacts = art
        origins = compute_origin_accessibility(bundle, art)
        origins = origins.merge(
            bundle.origins[["origin_id", "commune_id", "commune_name", "district_name", "population"]],
            on="origin_id",
            how="left",
        )
        bundle.baseline_origins = origins
    else:
        origins = bundle.origins.copy() if bundle.origins is not None else None
        warnings.append("Baseline metrics missing and simulation graph unavailable.")

    commune_summary = aggregate_commune_summary(origins) if origins is not None else (bundle.commune_summary.copy() if bundle.commune_summary is not None else None)

    facilities_near = _facilities_near_transit_count(bundle.facilities, bundle.stops)
    kpis = compute_kpis(origins, bundle.facilities, bundle.stops, facilities_near)

    response = {
        "city_id": city_id,
        "city_name": bundle.city_name,
        "analysis_unit": "commune",
        "readiness": {
            "baseline_ready": bool(bundle.readiness.baseline_ready),
            "simulation_ready": bool(bundle.readiness.simulation_ready),
            "missing_files": bundle.readiness.missing_files,
            "warnings": warnings,
        },
        "kpis": kpis,
        "commune_summary": commune_summary.to_dict(orient="records") if commune_summary is not None else [],
        "district_summary": commune_summary.to_dict(orient="records") if commune_summary is not None else [],
        "district_summaries": commune_summary.to_dict(orient="records") if commune_summary is not None else [],
        "warnings": warnings,
        "methodology_notes": [
            "Origins are demand points (WorldPop-derived), facilities are destinations only.",
            "Accessibility uses origin->walk to stop->wait->transit network->walk to facility.",
        ],
    }

    if include_rows and origins is not None:
        response["baseline_rows"] = origins.drop(columns=["geometry"], errors="ignore").head(5000).to_dict(orient="records")
        response["origins"] = response["baseline_rows"]

    if include_facilities and bundle.facilities is not None:
        fweb = bundle.facilities.to_crs("EPSG:4326")
        response["facilities_baseline"] = (
            fweb[[c for c in ["facility_id", "name", "latitude", "longitude", "geometry"] if c in fweb.columns]].assign(
                latitude=fweb.geometry.y, longitude=fweb.geometry.x
            )[["facility_id", "name", "latitude", "longitude"]].to_dict(orient="records")
        )

    if include_transport_stops and bundle.stops is not None:
        sweb = bundle.stops.to_crs("EPSG:4326")
        response["transport_stops_baseline"] = (
            sweb[[c for c in ["stop_key", "stop_name", "mode", "Lines", "geometry"] if c in sweb.columns]].assign(
                latitude=sweb.geometry.y, longitude=sweb.geometry.x
            )[["stop_key", "stop_name", "mode", "Lines", "latitude", "longitude"]].to_dict(orient="records")
        )

    if include_map_layers:
        if bundle.districts is not None:
            response["district_layer"] = json_safe(bundle.districts.__geo_interface__)

    return json_safe(response)
