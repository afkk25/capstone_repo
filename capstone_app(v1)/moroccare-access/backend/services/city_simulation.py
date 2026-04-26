from __future__ import annotations

import logging
import math
from typing import Any

import numpy as np
import pandas as pd

from core.config import get_default_point_simulation_city_id, load_city_config
from services.analytics import compute_summary_metrics
from services.origin_accessibility import DEFAULT_ACCESS_MAX_MIN, load_city_origin_baseline, simulate_origin_accessibility

logger = logging.getLogger(__name__)

DEFAULT_SCENARIO = {
    "facility_locations": [],
    "transport_stop_locations": [],
    "walking_speed_mps": 1.0,
    "walking_speed_kmh": 3.6,
    "waiting_time_min": 10.0,
    "transport_speed_kmh": 20.0,
    "k_nearest_stops": 5,
    "score_threshold_min": 45.0,
    "max_travel_time_min": 45.0,
    "coverage_thresholds": [30, 60],
    "facility_stop_connector_limit": 3,
    "max_origin_stop_walk_m": 1500.0,
}


def _safe_number(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, (np.integer,)):
        return int(value)
    if isinstance(value, (np.floating, float)):
        f = float(value)
        return f if math.isfinite(f) else None
    if pd.isna(value):
        return None
    return value


def json_safe(data: Any) -> Any:
    if isinstance(data, dict):
        return {str(k): json_safe(v) for k, v in data.items()}
    if isinstance(data, (list, tuple, set)):
        return [json_safe(v) for v in data]
    if isinstance(data, pd.DataFrame):
        return [json_safe(row) for row in data.to_dict(orient="records")]
    return _safe_number(data)


def _location_from_payload(payload: dict[str, Any]) -> dict[str, float] | None:
    location = payload.get("location")
    if isinstance(location, dict) and "latitude" in location and "longitude" in location:
        return {"latitude": float(location["latitude"]), "longitude": float(location["longitude"])}
    if payload.get("latitude") is not None and payload.get("longitude") is not None:
        return {"latitude": float(payload["latitude"]), "longitude": float(payload["longitude"])}
    return None


def normalize_simulation_payload(city_cfg: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    params = payload.get("parameters") if isinstance(payload.get("parameters"), dict) else {}
    merged_payload = {**params, **payload}
    scenario = dict(DEFAULT_SCENARIO)
    simulation_cfg = city_cfg.get("simulation") if isinstance(city_cfg.get("simulation"), dict) else {}
    defaults = simulation_cfg.get("default_parameters") if isinstance(simulation_cfg.get("default_parameters"), dict) else {}
    scenario.update({k: defaults[k] for k in defaults.keys() if k in scenario})

    for key in [
        "walking_speed_mps",
        "walking_speed_kmh",
        "waiting_time_min",
        "transport_speed_kmh",
        "k_nearest_stops",
        "score_threshold_min",
        "max_travel_time_min",
        "facility_stop_connector_limit",
        "max_origin_stop_walk_m",
    ]:
        if merged_payload.get(key) is not None:
            scenario[key] = merged_payload[key]

    if isinstance(merged_payload.get("coverage_thresholds"), list):
        scenario["coverage_thresholds"] = merged_payload["coverage_thresholds"]

    facilities = merged_payload.get("facility_locations") or []
    stops = merged_payload.get("transport_stop_locations") or []
    scenario_type = str(merged_payload.get("scenario_type") or merged_payload.get("intervention_type") or "").strip().lower()
    location = _location_from_payload(merged_payload)

    if scenario_type == "add_facility" and location:
        facilities = [location]
    elif scenario_type == "add_stop" and location:
        stops = [location]
    elif scenario_type in {"healthcare_facility", "add_healthcare_facility"} and location:
        facilities = [location]
        scenario_type = "add_facility"
    elif scenario_type in {"transport_stop", "add_transport_stop"} and location:
        stops = [location]
        scenario_type = "add_stop"

    if not facilities and not stops:
        raise ValueError("Simulation request must include scenario_type + location, or facility_locations, or transport_stop_locations")

    scenario["scenario_type"] = scenario_type or ("add_facility" if facilities else "add_stop")
    scenario["facility_locations"] = facilities
    scenario["transport_stop_locations"] = stops
    scenario["max_travel_time_min"] = float(scenario.get("max_travel_time_min") or DEFAULT_ACCESS_MAX_MIN)
    return scenario


def aggregate_origins_to_communes(origins_df: pd.DataFrame) -> list[dict[str, Any]]:
    if origins_df.empty:
        return []
    frame = origins_df.copy()
    if "commune_id" not in frame.columns and "district_id" in frame.columns:
        frame["commune_id"] = frame["district_id"]
    if "commune_name" not in frame.columns and "district_name" in frame.columns:
        frame["commune_name"] = frame["district_name"]
    if "district_name" not in frame.columns:
        frame["district_name"] = frame.get("commune_name", "Unknown")

    frame["population"] = pd.to_numeric(frame.get("population"), errors="coerce").fillna(0.0).clip(lower=0.0)
    frame["accessibility_score"] = pd.to_numeric(frame.get("accessibility_score"), errors="coerce")
    frame["total_travel_time_min"] = pd.to_numeric(frame.get("total_travel_time_min"), errors="coerce")
    frame["before_accessibility_score"] = pd.to_numeric(frame.get("before_accessibility_score"), errors="coerce")
    frame["before_total_travel_time_min"] = pd.to_numeric(frame.get("before_total_travel_time_min"), errors="coerce")

    def _wavg(values: pd.Series, weights: pd.Series) -> float:
        mask = values.notna() & weights.notna() & (weights > 0)
        if mask.sum() == 0:
            return float(values.mean()) if values.notna().any() else 0.0
        return float(np.average(values[mask], weights=weights[mask]))

    rows: list[dict[str, Any]] = []
    for (commune_id, commune_name, district_name), group in frame.groupby(["commune_id", "commune_name", "district_name"], dropna=False):
        pop = pd.to_numeric(group["population"], errors="coerce").fillna(0.0)
        rows.append(
            {
                "commune_id": str(commune_id),
                "district_id": str(commune_id),
                "commune_name": str(commune_name),
                "district_name": str(district_name),
                "population": float(pop.sum()),
                "baseline_score": _wavg(group["before_accessibility_score"], pop),
                "scenario_score": _wavg(group["accessibility_score"], pop),
                "score_gain": _wavg(group["accessibility_score"] - group["before_accessibility_score"], pop),
                "baseline_time": _wavg(group["before_total_travel_time_min"], pop),
                "scenario_time": _wavg(group["total_travel_time_min"], pop),
                "time_reduction": _wavg(group["before_total_travel_time_min"] - group["total_travel_time_min"], pop),
            }
        )
    rows.sort(key=lambda r: r["score_gain"], reverse=True)
    return rows


def _improved_population(frame: pd.DataFrame) -> float:
    deltas = pd.to_numeric(frame["accessibility_score"], errors="coerce") - pd.to_numeric(frame["before_accessibility_score"], errors="coerce")
    improved = deltas > 0.5
    pop = pd.to_numeric(frame.get("population"), errors="coerce").fillna(0.0)
    return float(pop[improved].sum())


def run_city_scenario(city_id: str, scenario_payload: dict[str, Any]) -> dict[str, Any]:
    city_cfg = load_city_config(city_id)
    logger.debug("Simulation payload received city=%s payload=%s", city_id, scenario_payload)
    scenario = normalize_simulation_payload(city_cfg, scenario_payload)
    logger.debug("Simulation payload normalized city=%s scenario=%s", city_id, scenario)

    baseline_df = load_city_origin_baseline(city_id)
    baseline_df = baseline_df.copy().reset_index(drop=True)
    baseline_df["before_accessibility_score"] = pd.to_numeric(baseline_df.get("accessibility_score"), errors="coerce")
    baseline_df["before_total_travel_time_min"] = pd.to_numeric(baseline_df.get("total_travel_time_min"), errors="coerce")

    simulated_df, scenario_entities, context = simulate_origin_accessibility(city_id, scenario, baseline_df=baseline_df)
    simulated_df = simulated_df.copy().reset_index(drop=True)
    simulated_df["before_accessibility_score"] = pd.to_numeric(simulated_df.get("before_accessibility_score"), errors="coerce")
    simulated_df["before_total_travel_time_min"] = pd.to_numeric(simulated_df.get("before_total_travel_time_min"), errors="coerce")
    simulated_df["accessibility_score"] = pd.to_numeric(simulated_df.get("accessibility_score"), errors="coerce")
    simulated_df["total_travel_time_min"] = pd.to_numeric(simulated_df.get("total_travel_time_min"), errors="coerce")

    commune_impacts = aggregate_origins_to_communes(simulated_df)
    baseline_summary = compute_summary_metrics(baseline_df.rename(columns={"total_travel_time_min": "travel_time_min"}))
    simulated_summary = compute_summary_metrics(simulated_df.rename(columns={"total_travel_time_min": "travel_time_min"}))

    population = pd.to_numeric(simulated_df.get("population"), errors="coerce").fillna(0.0)
    newly_covered_60 = (
        (pd.to_numeric(simulated_df["before_total_travel_time_min"], errors="coerce") > 60.0)
        & (pd.to_numeric(simulated_df["total_travel_time_min"], errors="coerce") <= 60.0)
    )

    response = {
        "city_id": city_id,
        "analysis_unit": "commune",
        "scenario_type": scenario["scenario_type"],
        "summary": {
            "total_population": float(population.sum()),
            "population_improved": _improved_population(simulated_df),
            "newly_covered_population_60min": float(population[newly_covered_60].sum()),
            "average_travel_time_reduction_min": float(
                (pd.to_numeric(simulated_df["before_total_travel_time_min"], errors="coerce") - pd.to_numeric(simulated_df["total_travel_time_min"], errors="coerce")).mean()
            ),
            "average_accessibility_score_gain": float(
                (pd.to_numeric(simulated_df["accessibility_score"], errors="coerce") - pd.to_numeric(simulated_df["before_accessibility_score"], errors="coerce")).mean()
            ),
            "avg_score_before": float(baseline_summary["avg_accessibility_score"]),
            "avg_score_after": float(simulated_summary["avg_accessibility_score"]),
            "avg_travel_time_before": float(baseline_summary["avg_travel_time"]),
            "avg_travel_time_after": float(simulated_summary["avg_travel_time"]),
        },
        "commune_impacts": commune_impacts,
        "district_impacts": commune_impacts,
        "origin_metrics_sample": json_safe(
            simulated_df[
                [
                    c
                    for c in [
                        "origin_id",
                        "commune_id",
                        "commune_name",
                        "district_name",
                        "population",
                        "before_total_travel_time_min",
                        "total_travel_time_min",
                        "before_accessibility_score",
                        "accessibility_score",
                        "nearest_facility_id",
                        "nearest_stop_id",
                        "reachable_30",
                        "reachable_60",
                    ]
                    if c in simulated_df.columns
                ]
            ]
            .head(250)
            .to_dict(orient="records")
        ),
        "added_facilities": scenario_entities.get("added_facilities", []),
        "added_transport_stops": scenario_entities.get("added_transport_stops", []),
        "facilities": context.get("facilities", []),
        "scenario": scenario,
    }
    return json_safe(response)


def run_point_simulation(city_id: str | None, intervention_type: str, latitude: float, longitude: float) -> dict[str, Any]:
    resolved_city_id = city_id or get_default_point_simulation_city_id()
    if not resolved_city_id:
        raise ValueError("city_id is required for point simulations when no default point-simulation city is configured")
    payload = {"intervention_type": intervention_type, "latitude": latitude, "longitude": longitude}
    return run_city_scenario(resolved_city_id, payload)


def recommend_city_placements(city_id: str) -> dict[str, Any]:
    baseline_df = load_city_origin_baseline(city_id)
    frame = baseline_df.copy()
    frame["accessibility_score"] = pd.to_numeric(frame.get("accessibility_score"), errors="coerce").fillna(0.0)
    frame["population"] = pd.to_numeric(frame.get("population"), errors="coerce").fillna(0.0)
    candidates = frame.sort_values(["accessibility_score", "population"], ascending=[True, False]).head(20)
    placements = [
        {
            "city_id": city_id,
            "intervention_type": "healthcare_facility",
            "origin_id": str(row.get("origin_id")),
            "commune_id": row.get("commune_id"),
            "commune_name": row.get("commune_name"),
            "district_name": row.get("district_name"),
            "latitude": float(row["latitude"]),
            "longitude": float(row["longitude"]),
            "baseline_accessibility_score": float(row["accessibility_score"]),
        }
        for _, row in candidates.iterrows()
    ]
    return json_safe(
        {
            "city_id": city_id,
            "analysis_unit": "commune",
            "placements": placements[:10],
            "facility_recommendations": placements[:5],
            "transport_stop_recommendations": placements[5:10],
            "methodology_notes": ["Candidates are underserved communes derived from origin accessibility scores (0-100)."],
        }
    )
