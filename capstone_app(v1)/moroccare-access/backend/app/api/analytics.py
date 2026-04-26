from __future__ import annotations

from io import BytesIO

from fastapi import APIRouter, Query, Response

from app.api.simulation import run_city_simulation
from app.services.city_registry import get_city_bundle
from app.services.json_utils import json_safe

router = APIRouter(prefix="/api/cities", tags=["analytics"])


@router.post("/{city_id}/compare")
def compare(city_id: str, payload: dict) -> dict:
    simulated = run_city_simulation(city_id, payload)
    summary = simulated.get("summary", {})
    return json_safe(
        {
            "city_id": city_id,
            "scenario": payload,
            "comparison": {
                "delta_travel_time": summary.get("average_travel_time_reduction_min"),
                "delta_accessibility": summary.get("average_accessibility_score_gain"),
                "improvement_percentage": None,
                "inequality_change": None,
            },
            "districts_improved": sum(1 for d in simulated.get("district_impacts", []) if (d.get("score_gain") or 0) > 0),
            "districts_total": len(simulated.get("district_impacts", [])),
            "population_affected": summary.get("population_improved"),
        }
    )


@router.post("/{city_id}/sensitivity")
def sensitivity(city_id: str, payload: dict) -> dict:
    params = payload.get("parameters", {})
    return json_safe(
        {
            "city_id": city_id,
            "assumptions": {
                "walking_speed_mps": params.get("walking_speed_mps"),
                "waiting_time_min": params.get("wait_time_min"),
                "transport_speed_kmh": params.get("transit_speed_kmh"),
            },
            "derived_scenario": payload,
            "comparison": {
                "delta_travel_time": None,
                "delta_accessibility": None,
                "improvement_percentage": None,
                "inequality_change": None,
                "waiting_time_factor": params.get("wait_time_min"),
            },
        }
    )


@router.get("/{city_id}/export")
def export(city_id: str, format: str = Query(default="pdf")) -> Response:
    bundle = get_city_bundle(city_id)
    content = f"MorocCare export placeholder for {city_id} ({format}). facilities={len(bundle.facilities) if bundle.facilities is not None else 0}".encode("utf-8")
    media = "application/pdf" if format == "pdf" else "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    filename = f"{city_id}_planning_report.{ 'pdf' if format == 'pdf' else 'xlsx' }"
    return Response(content=content, media_type=media, headers={"Content-Disposition": f"attachment; filename={filename}"})
