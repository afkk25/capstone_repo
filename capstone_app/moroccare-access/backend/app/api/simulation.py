from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.services.city_registry import get_city_bundle
from app.services.json_utils import json_safe
from app.services.simulation_engine import simulate

router = APIRouter(tags=["simulation"])


@router.post("/api/cities/{city_id}/simulate")
def run_city_simulation(city_id: str, payload: dict) -> dict:
    bundle = get_city_bundle(city_id)
    try:
        out = simulate(bundle, payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    response = {
        "city_id": city_id,
        "scenario_id": out["scenario_id"],
        "scenario_type": out["scenario_type"],
        "analysis_unit": "commune",
        "summary": out["summary"],
        "commune_impacts": out.get("commune_impacts", []),
        "district_impacts": out["district_impacts"],
        "origin_metrics_sample": out["origin_metrics_sample"],
        "district_summaries_before": out["district_summaries_before"],
        "district_summaries_after": out["district_summaries_after"],
        "commune_summaries_before": out.get("commune_summaries_before", out["district_summaries_before"]),
        "commune_summaries_after": out.get("commune_summaries_after", out["district_summaries_after"]),
        "new_facility": out.get("new_facility"),
        "new_stop": out.get("new_stop"),
        "added_facilities": out.get("added_facilities", []),
        "facilities_added": out.get("facilities_added", out.get("added_facilities", [])),
        "added_transport_stops": out.get("added_transport_stops", []),
        "transport_stops_added": out.get("transport_stops_added", out.get("added_transport_stops", [])),
        "warnings": out.get("warnings", []),
    }
    return json_safe(response)


@router.post("/api/simulate")
def run_point_simulation(payload: dict) -> dict:
    city_id = (payload.get("city_id") or "casablanca").strip().lower()
    scenario_type = payload.get("intervention_type")
    if scenario_type in {"healthcare_facility", "add_healthcare_facility"}:
        st = "add_facility"
    elif scenario_type in {"transport_stop", "add_transport_stop"}:
        st = "add_stop"
    else:
        st = scenario_type

    return run_city_simulation(
        city_id,
        {
            "scenario_type": st,
            "location": {"latitude": payload.get("latitude"), "longitude": payload.get("longitude")},
            "parameters": {},
        },
    )
