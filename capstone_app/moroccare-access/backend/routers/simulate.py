from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from core.config import get_default_point_simulation_city_id
from services.city_simulation import run_city_scenario, run_point_simulation

router = APIRouter(tags=["simulate"], prefix="/api")


class LocationPoint(BaseModel):
    latitude: float = Field(ge=-90.0, le=90.0)
    longitude: float = Field(ge=-180.0, le=180.0)


class ScenarioPayload(BaseModel):
    stop_density_multiplier: float | None = Field(default=None, ge=0.1, le=3.0)
    reduce_nearest_stop_distance_pct: float | None = Field(default=None, ge=0.0, le=1.0)
    add_facilities: int | None = Field(default=None, ge=0, le=20)
    facility_locations: list[LocationPoint] = Field(default_factory=list)
    transport_stop_locations: list[LocationPoint] = Field(default_factory=list)
    walking_speed_mps: float | None = Field(default=None, ge=0.2, le=3.0)
    waiting_time_min: float | None = Field(default=None, ge=1.0, le=60.0)
    transport_speed_kmh: float | None = Field(default=None, ge=2.0, le=80.0)


class PointSimulationPayload(BaseModel):
    city_id: str | None = None
    intervention_type: str
    latitude: float = Field(ge=-90.0, le=90.0)
    longitude: float = Field(ge=-180.0, le=180.0)


@router.post("/simulate")
def simulate_point_intervention(payload: PointSimulationPayload) -> dict[str, Any]:
    try:
        return run_point_simulation(
            city_id=payload.city_id or get_default_point_simulation_city_id(),
            intervention_type=payload.intervention_type,
            latitude=payload.latitude,
            longitude=payload.longitude,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/cities/{city_id}/simulate")
def simulate_city(city_id: str, payload: ScenarioPayload) -> dict[str, Any]:
    try:
        return run_city_scenario(city_id, payload.model_dump())
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"City '{city_id}' not found")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
