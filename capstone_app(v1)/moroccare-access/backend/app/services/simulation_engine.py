from __future__ import annotations

import copy
import uuid
from typing import Any

import pandas as pd
import numpy as np

from app.services.accessibility_engine import compute_origin_accessibility
from app.services.aggregation import aggregate_commune_summary, safe_weighted_mean
from app.services.city_registry import get_city_bundle
from app.services.graph_builder import build_transport_graph
from app.services.preprocessors import assign_points_to_zones, ensure_geometry, to_metric, to_web

DEFAULT_PARAMS = {
    "walking_speed_mps": 1.0,
    "walking_speed_kmh": 3.6,
    "wait_time_min": 10.0,
    "transit_speed_kmh": 20.0,
    "k_nearest_origin_stops": 5,
    "score_threshold_min": 45.0,
    "max_travel_time_min": 45.0,
}


def _scenario_id() -> str:
    return f"scenario_{uuid.uuid4().hex[:10]}"


def _summary_from_delta(merged: pd.DataFrame) -> dict:
    pop = pd.to_numeric(merged.get("population"), errors="coerce").fillna(0)
    improved = pd.to_numeric(merged.get("time_delta"), errors="coerce") > 1e-6
    newly_covered_60 = (pd.to_numeric(merged.get("baseline_total_travel_time_min"), errors="coerce") > 60) & (
        pd.to_numeric(merged.get("scenario_total_travel_time_min"), errors="coerce") <= 60
    )
    positive_time_reduction = pd.to_numeric(merged.get("time_delta"), errors="coerce").clip(lower=0)
    positive_score_gain = pd.to_numeric(merged.get("score_delta"), errors="coerce").clip(lower=0)
    return {
        "total_population": float(pop.sum()),
        "population_improved": float(pop[improved].sum()),
        "newly_covered_population_60min": float(pop[newly_covered_60].sum()),
        "average_travel_time_reduction_min": safe_weighted_mean(positive_time_reduction, pop),
        "average_accessibility_score_gain": safe_weighted_mean(positive_score_gain, pop),
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


def _normalize_payload(payload: dict[str, Any]) -> tuple[str, list[dict[str, float]], list[dict[str, float]], dict[str, Any]]:
    scenario_type_raw = payload.get("scenario_type") or payload.get("intervention_type") or ""
    scenario_type = str(scenario_type_raw).strip().lower()

    location = payload.get("location") if isinstance(payload.get("location"), dict) else None
    if location is None and payload.get("latitude") is not None and payload.get("longitude") is not None:
        location = {"latitude": payload.get("latitude"), "longitude": payload.get("longitude")}

    params_src = payload.get("parameters") if isinstance(payload.get("parameters"), dict) else {}
    params = {**DEFAULT_PARAMS, **params_src}
    for key in DEFAULT_PARAMS:
        if payload.get(key) is not None:
            params[key] = payload[key]
    if params.get("walking_speed_mps") is None and params.get("walking_speed_kmh") is not None:
        params["walking_speed_mps"] = float(params["walking_speed_kmh"]) / 3.6
    if params.get("walking_speed_kmh") is None and params.get("walking_speed_mps") is not None:
        params["walking_speed_kmh"] = float(params["walking_speed_mps"]) * 3.6
    params["walking_speed_mps"] = float(params.get("walking_speed_mps", 1.0))
    params["walking_speed_kmh"] = float(params.get("walking_speed_kmh", 3.6))
    params["wait_time_min"] = float(params.get("wait_time_min", 10.0))
    params["transit_speed_kmh"] = float(params.get("transit_speed_kmh", params.get("transport_speed_kmh", 20.0)))
    params["score_threshold_min"] = float(params.get("score_threshold_min", 45.0))
    params["max_travel_time_min"] = float(params.get("max_travel_time_min", 45.0))

    facilities = payload.get("facility_locations") if isinstance(payload.get("facility_locations"), list) else []
    stops = payload.get("transport_stop_locations") if isinstance(payload.get("transport_stop_locations"), list) else []

    if scenario_type in {"add_facility", "healthcare_facility", "add_healthcare_facility"}:
        if location:
            facilities = [{"latitude": float(location["latitude"]), "longitude": float(location["longitude"])}]
        scenario_type = "add_facility"
    elif scenario_type in {"add_stop", "transport_stop", "add_transport_stop"}:
        if location:
            stops = [{"latitude": float(location["latitude"]), "longitude": float(location["longitude"])}]
        scenario_type = "add_stop"
    elif not scenario_type:
        if facilities:
            scenario_type = "add_facility"
        elif stops:
            scenario_type = "add_stop"

    def _norm(rows: list[dict[str, Any]], label: str) -> list[dict[str, float]]:
        out: list[dict[str, float]] = []
        for i, row in enumerate(rows):
            if not isinstance(row, dict) or "latitude" not in row or "longitude" not in row:
                raise ValueError(f"{label}[{i}] must include latitude and longitude")
            out.append({"latitude": float(row["latitude"]), "longitude": float(row["longitude"])})
        return out

    facilities = _norm(facilities, "facility_locations")
    stops = _norm(stops, "transport_stop_locations")
    if not facilities and not stops:
        raise ValueError("Simulation request must include scenario_type + location, or facility_locations, or transport_stop_locations")
    return scenario_type, facilities, stops, params


def simulate(bundle: Any, payload: dict) -> dict:
    scenario_type, facilities, stops, params = _normalize_payload(payload)

    working = copy.deepcopy(bundle)
    warnings: list[str] = []
    new_facility_feature = None
    new_stop_feature = None

    if scenario_type == "add_facility":
        gdf = working.facilities.copy()
        added_features = []
        for idx, row in enumerate(facilities):
            lat, lon = float(row["latitude"]), float(row["longitude"])
            new_id = f"scenario_facility_{idx + 1}"
            new_row = pd.DataFrame(
                [{"facility_id": new_id, "name": f"Scenario Facility {idx + 1}", "latitude": lat, "longitude": lon, "capacity": 1, "type": "healthcare"}]
            )
            new_geo = ensure_geometry(new_row, "facilities")
            gdf = pd.concat([gdf, new_geo], ignore_index=True)
            added_features.append((new_id, lat, lon))
        working.facilities = to_web(to_metric(gdf))
        if working.zones is not None:
            working.facilities = assign_points_to_zones(working.facilities, working.zones)
        if len(working.facilities) > 0:
            new_fac = working.facilities.iloc[-1]
            new_facility_feature = {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [float(new_fac.geometry.x), float(new_fac.geometry.y)]},
                "properties": {
                    "facility_id": str(new_fac.get("facility_id", "")),
                    "name": str(new_fac.get("name", "Scenario Facility")),
                    "type": "healthcare",
                    "capacity": float(new_fac.get("capacity", 1)),
                    "commune_id": new_fac.get("commune_id"),
                    "commune_name": new_fac.get("commune_name"),
                    "district_name": new_fac.get("district_name"),
                },
            }

    elif scenario_type == "add_stop":
        gdf = working.stops.copy()
        for idx, row in enumerate(stops):
            lat, lon = float(row["latitude"]), float(row["longitude"])
            new_key = f"scenario_stop_{idx + 1}_{len(gdf)}"
            new_row = pd.DataFrame(
                [{"stop_key": new_key, "stop_name": f"Scenario Stop {idx + 1}", "latitude": lat, "longitude": lon, "mode": payload.get("mode", "transit")}]
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
    else:
        raise ValueError("Unsupported scenario_type")

    if not bool(working.readiness.simulation_ready):
        missing = ", ".join(working.readiness.missing_files) if working.readiness.missing_files else "route_stops, route_vertices, zones/origins"
        raise ValueError(f"Simulation data is incomplete for {working.city_name}: missing {missing}.")

    art = build_transport_graph(working, params)
    scenario_origins = compute_origin_accessibility(working, art, params)
    scenario_origins["accessibility_score"] = pd.to_numeric(scenario_origins.get("accessibility_score"), errors="coerce").clip(lower=0.0, upper=100.0)
    extra_warnings: list[str] = []
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
    merged["total_travel_time_min_scenario"] = np.minimum(
        pd.to_numeric(merged.get("total_travel_time_min_baseline"), errors="coerce"),
        pd.to_numeric(merged.get("total_travel_time_min_scenario"), errors="coerce"),
    )
    merged["accessibility_score_scenario"] = np.maximum(
        pd.to_numeric(merged.get("accessibility_score_baseline"), errors="coerce"),
        pd.to_numeric(merged.get("accessibility_score_scenario"), errors="coerce"),
    )
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

    pop = pd.to_numeric(renamed.get("population"), errors="coerce").fillna(0)
    baseline_tt = pd.to_numeric(renamed.get("baseline_total_travel_time_min"), errors="coerce")
    scenario_tt = pd.to_numeric(renamed.get("scenario_total_travel_time_min"), errors="coerce")
    baseline_score = pd.to_numeric(renamed.get("baseline_accessibility_score"), errors="coerce")
    scenario_score = pd.to_numeric(renamed.get("scenario_accessibility_score"), errors="coerce")

    def _weighted_mean(values: pd.Series, weights: pd.Series) -> float:
        mask = values.notna() & weights.notna() & (weights > 0)
        if mask.sum() == 0:
            return float(values.mean()) if values.notna().any() else 0.0
        return float((values[mask] * weights[mask]).sum() / weights[mask].sum())

    summary = _summary_from_delta(renamed)
    summary["avg_score_before"] = _weighted_mean(baseline_score, pop)
    summary["avg_score_after"] = _weighted_mean(scenario_score, pop)
    summary["avg_travel_time_before"] = _weighted_mean(baseline_tt, pop)
    summary["avg_travel_time_after"] = _weighted_mean(scenario_tt, pop)

    origin_coords = None
    try:
        origin_geo = bundle.origins.copy()
        if "geometry" in origin_geo.columns:
            origin_geo = to_web(origin_geo)
            origin_coords = pd.DataFrame(
                {
                    "origin_id": origin_geo["origin_id"].astype(str),
                    "latitude": origin_geo.geometry.y.astype(float),
                    "longitude": origin_geo.geometry.x.astype(float),
                }
            )
    except Exception:
        origin_coords = None
    if origin_coords is None:
        origin_coords = pd.DataFrame({"origin_id": renamed["origin_id"].astype(str)})
        origin_coords["latitude"] = np.nan
        origin_coords["longitude"] = np.nan

    origin_rows = renamed.merge(origin_coords, on="origin_id", how="left")
    origin_rows["before_score"] = pd.to_numeric(origin_rows.get("baseline_accessibility_score"), errors="coerce")
    origin_rows["after_score"] = pd.to_numeric(origin_rows.get("scenario_accessibility_score"), errors="coerce")
    origin_rows["baseline_score"] = origin_rows["before_score"]
    origin_rows["simulated_score"] = origin_rows["after_score"]
    origin_rows["before_travel_time_min"] = pd.to_numeric(origin_rows.get("baseline_total_travel_time_min"), errors="coerce")
    origin_rows["after_travel_time_min"] = pd.to_numeric(origin_rows.get("scenario_total_travel_time_min"), errors="coerce")
    origin_rows["travel_time_min"] = origin_rows["after_travel_time_min"]
    origin_rows["delta"] = pd.to_numeric(origin_rows.get("score_delta"), errors="coerce")
    origin_rows["accessibility_score"] = origin_rows["after_score"]

    origin_sample = origin_rows[
        [
            "origin_id",
            "commune_id",
            "commune_name",
            "district_name",
            "population",
            "latitude",
            "longitude",
            "before_score",
            "after_score",
            "baseline_score",
            "simulated_score",
            "before_travel_time_min",
            "after_travel_time_min",
            "travel_time_min",
            "delta",
            "baseline_total_travel_time_min",
            "scenario_total_travel_time_min",
            "baseline_accessibility_score",
            "scenario_accessibility_score",
            "time_delta",
            "score_delta",
            "accessibility_score",
        ]
    ].copy()
    origin_sample = origin_sample.head(250)
    baseline_rows = origin_sample.copy()
    baseline_rows["travel_time_min"] = baseline_rows["before_travel_time_min"]
    baseline_rows["accessibility_score"] = baseline_rows["before_score"]
    baseline_rows["simulated_score"] = baseline_rows["before_score"]

    return {
        "scenario_id": _scenario_id(),
        "scenario_type": scenario_type,
        "analysis_unit": "commune",
        "summary": summary,
        "commune_impacts": _commune_impacts(renamed),
        "district_impacts": _commune_impacts(renamed),
        "origin_metrics_sample": origin_sample.to_dict(orient="records"),
        "origins": origin_sample.to_dict(orient="records"),
        "simulated_rows": origin_sample.to_dict(orient="records"),
        "baseline_rows": baseline_rows.to_dict(orient="records"),
        "district_summaries_before": baseline_summary.to_dict(orient="records"),
        "district_summaries_after": scenario_summary.to_dict(orient="records"),
        "commune_summaries_before": baseline_summary.to_dict(orient="records"),
        "commune_summaries_after": scenario_summary.to_dict(orient="records"),
        "new_facility": new_facility_feature,
        "new_stop": new_stop_feature,
        "added_facilities": [{"latitude": row["latitude"], "longitude": row["longitude"], "source": "user"} for row in facilities] if scenario_type == "add_facility" else [],
        "facilities_added": [{"latitude": row["latitude"], "longitude": row["longitude"], "source": "user"} for row in facilities] if scenario_type == "add_facility" else [],
        "added_transport_stops": [{"latitude": row["latitude"], "longitude": row["longitude"], "source": "user"} for row in stops] if scenario_type == "add_stop" else [],
        "transport_stops_added": [{"latitude": row["latitude"], "longitude": row["longitude"], "source": "user"} for row in stops] if scenario_type == "add_stop" else [],
        "warnings": warnings,
        "scenario_parameters": params,
    }


def run_city_scenario(city_id: str, payload: dict) -> dict:
    bundle = get_city_bundle(city_id)
    return simulate(bundle, payload)
