from __future__ import annotations

import copy
import uuid
from typing import Any

import pandas as pd

from app.services.accessibility_engine import approximate_accessibility_without_graph, compute_origin_accessibility
from app.services.aggregation import aggregate_commune_summary, safe_weighted_mean
from app.services.graph_builder import build_transport_graph
from app.services.preprocessors import assign_points_to_zones, ensure_geometry, to_metric, to_web


def _scenario_id() -> str:
    return f"scenario_{uuid.uuid4().hex[:10]}"


def _summary_from_delta(merged: pd.DataFrame) -> dict:
    pop = pd.to_numeric(merged.get("population"), errors="coerce").fillna(0)
    improved = pd.to_numeric(merged.get("time_delta"), errors="coerce") > 0
    newly_covered_60 = (pd.to_numeric(merged.get("baseline_total_travel_time_min"), errors="coerce") > 60) & (
        pd.to_numeric(merged.get("scenario_total_travel_time_min"), errors="coerce") <= 60
    )
    return {
        "total_population": float(pop.sum()),
        "population_improved": float(pop[improved].sum()),
        "newly_covered_population_60min": float(pop[newly_covered_60].sum()),
        "average_travel_time_reduction_min": safe_weighted_mean(merged.get("time_delta"), pop),
        "average_accessibility_score_gain": safe_weighted_mean(merged.get("score_delta"), pop),
    }


def _commune_impacts(merged: pd.DataFrame) -> list[dict]:
    rows = []
    for (commune_id, commune_name, district_name), grp in merged.groupby(["commune_id", "commune_name", "district_name"], dropna=False):
        pop = pd.to_numeric(grp.get("population"), errors="coerce").fillna(0)
        rows.append(
            {
                "commune_id": str(commune_id),
                "district_id": str(commune_id),
                "commune_name": str(commune_name),
                "district_name": str(district_name),
                "baseline_score": safe_weighted_mean(grp.get("baseline_accessibility_score"), pop),
                "scenario_score": safe_weighted_mean(grp.get("scenario_accessibility_score"), pop),
                "score_gain": safe_weighted_mean(grp.get("score_delta"), pop),
                "baseline_time": safe_weighted_mean(grp.get("baseline_total_travel_time_min"), pop),
                "scenario_time": safe_weighted_mean(grp.get("scenario_total_travel_time_min"), pop),
                "time_reduction": safe_weighted_mean(grp.get("time_delta"), pop),
                "population": float(pop.sum()),
            }
        )
    return rows


def _run(bundle: Any, params: dict) -> tuple[pd.DataFrame, list[str]]:
    warnings: list[str] = []
    if bundle.readiness.simulation_ready:
        art = build_transport_graph(bundle, params)
        out = compute_origin_accessibility(bundle, art, params)
        return out, warnings
    out, warnings = approximate_accessibility_without_graph(bundle, params)
    return out, warnings


def simulate(bundle: Any, payload: dict) -> dict:
    scenario_type = payload.get("scenario_type") or payload.get("intervention_type")
    location = payload.get("location") or {
        "latitude": payload.get("latitude"),
        "longitude": payload.get("longitude"),
    }
    params = payload.get("parameters", {})

    working = copy.deepcopy(bundle)
    warnings: list[str] = []
    new_facility_feature = None
    new_stop_feature = None

    if scenario_type in {"add_facility", "healthcare_facility", "add_healthcare_facility"}:
        gdf = working.facilities.copy()
        lat, lon = float(location["latitude"]), float(location["longitude"])
        new_id = "scenario_facility_1"
        new_row = pd.DataFrame(
            [{"facility_id": new_id, "name": "Scenario Facility", "latitude": lat, "longitude": lon, "capacity": 1, "type": "healthcare"}]
        )
        new_geo = ensure_geometry(new_row, "facilities")
        gdf = pd.concat([gdf, new_geo], ignore_index=True)
        working.facilities = to_web(to_metric(gdf))
        if working.zones is not None:
            working.facilities = assign_points_to_zones(working.facilities, working.zones)
        new_fac = working.facilities.iloc[-1]
        new_facility_feature = {
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [float(new_fac.geometry.x), float(new_fac.geometry.y)]},
            "properties": {
                "facility_id": str(new_fac.get("facility_id", new_id)),
                "name": str(new_fac.get("name", "Scenario Facility")),
                "type": "healthcare",
                "capacity": float(new_fac.get("capacity", 1)),
                "commune_id": new_fac.get("commune_id"),
                "commune_name": new_fac.get("commune_name"),
                "district_name": new_fac.get("district_name"),
            },
        }
        scenario_type = "add_facility"

    elif scenario_type in {"add_stop", "transport_stop", "add_transport_stop"}:
        gdf = working.stops.copy()
        lat, lon = float(location["latitude"]), float(location["longitude"])
        new_key = f"stop_new_{len(gdf)}"
        new_row = pd.DataFrame(
            [{"stop_key": new_key, "stop_name": "Scenario Stop", "latitude": lat, "longitude": lon, "mode": payload.get("mode", "transit")}]
        )
        new_geo = ensure_geometry(new_row, "stops")
        gdf = pd.concat([gdf, new_geo], ignore_index=True)
        working.stops = to_web(to_metric(gdf))
        if working.zones is not None:
            working.stops = assign_points_to_zones(working.stops, working.zones)
        new_stop = working.stops.iloc[-1]
        new_stop_feature = {
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [float(new_stop.geometry.x), float(new_stop.geometry.y)]},
            "properties": {
                "stop_key": str(new_stop.get("stop_key", new_key)),
                "stop_name": str(new_stop.get("stop_name", "Scenario Stop")),
                "mode": str(new_stop.get("mode", "transit")),
                "commune_id": new_stop.get("commune_id"),
                "commune_name": new_stop.get("commune_name"),
                "district_name": new_stop.get("district_name"),
            },
        }
        scenario_type = "add_stop"
    else:
        raise ValueError("Unsupported scenario_type")

    scenario_origins, extra_warnings = _run(working, params)
    warnings.extend(extra_warnings)
    if "commune_id" not in scenario_origins.columns and "district_id" in scenario_origins.columns:
        scenario_origins["commune_id"] = scenario_origins["district_id"]
    if "commune_name" not in scenario_origins.columns and "district_name" in scenario_origins.columns:
        scenario_origins["commune_name"] = scenario_origins["district_name"]

    baseline = bundle.baseline_origins.copy() if bundle.baseline_origins is not None else bundle.origins.copy()
    baseline = baseline[[c for c in baseline.columns if c != "geometry"]].copy()
    if "commune_id" not in baseline.columns and "district_id" in baseline.columns:
        baseline["commune_id"] = baseline["district_id"]
    if "commune_name" not in baseline.columns and "district_name" in baseline.columns:
        baseline["commune_name"] = baseline["district_name"]

    merged = baseline.merge(scenario_origins, on="origin_id", how="inner", suffixes=("_baseline", "_scenario"))
    merged["time_delta"] = pd.to_numeric(merged.get("total_travel_time_min_baseline"), errors="coerce") - pd.to_numeric(
        merged.get("total_travel_time_min_scenario"), errors="coerce"
    )
    merged["score_delta"] = pd.to_numeric(merged.get("accessibility_score_scenario"), errors="coerce") - pd.to_numeric(
        merged.get("accessibility_score_baseline"), errors="coerce"
    )

    baseline_summary = aggregate_commune_summary(
        baseline.rename(columns={"total_travel_time_min": "total_travel_time_min", "accessibility_score": "accessibility_score"})
    )
    scenario_summary = aggregate_commune_summary(scenario_origins)

    renamed = merged.rename(
        columns={
            "population_baseline": "population",
            "commune_id_baseline": "commune_id",
            "district_id_baseline": "district_id",
            "commune_name_baseline": "commune_name",
            "district_name_baseline": "district_name",
            "total_travel_time_min_baseline": "baseline_total_travel_time_min",
            "total_travel_time_min_scenario": "scenario_total_travel_time_min",
            "accessibility_score_baseline": "baseline_accessibility_score",
            "accessibility_score_scenario": "scenario_accessibility_score",
        }
    )
    for col in ["commune_id", "commune_name", "district_name"]:
        if col not in renamed.columns:
            renamed[col] = "Unknown"

    return {
        "scenario_id": _scenario_id(),
        "scenario_type": scenario_type,
        "analysis_unit": "commune",
        "summary": _summary_from_delta(renamed),
        "commune_impacts": _commune_impacts(renamed),
        "district_impacts": _commune_impacts(renamed),
        "origin_metrics_sample": scenario_origins.head(250).to_dict(orient="records"),
        "district_summaries_before": baseline_summary.to_dict(orient="records"),
        "district_summaries_after": scenario_summary.to_dict(orient="records"),
        "commune_summaries_before": baseline_summary.to_dict(orient="records"),
        "commune_summaries_after": scenario_summary.to_dict(orient="records"),
        "new_facility": new_facility_feature,
        "new_stop": new_stop_feature,
        "added_facilities": [{"latitude": location.get("latitude"), "longitude": location.get("longitude"), "source": "user"}]
        if scenario_type == "add_facility"
        else [],
        "facilities_added": [{"latitude": location.get("latitude"), "longitude": location.get("longitude"), "source": "user"}]
        if scenario_type == "add_facility"
        else [],
        "added_transport_stops": [{"latitude": location.get("latitude"), "longitude": location.get("longitude"), "source": "user"}]
        if scenario_type == "add_stop"
        else [],
        "transport_stops_added": [{"latitude": location.get("latitude"), "longitude": location.get("longitude"), "source": "user"}]
        if scenario_type == "add_stop"
        else [],
        "warnings": warnings,
    }
