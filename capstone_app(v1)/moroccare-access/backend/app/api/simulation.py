from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException

from app.services.json_utils import json_safe
from app.services.simulation_engine import run_city_scenario


router = APIRouter(tags=["simulation"])
logger = logging.getLogger("moroccare")


@router.post("/api/cities/{city_id}/simulate")
def run_city_simulation(city_id: str, payload: dict) -> dict:
    try:
        out = run_city_scenario(city_id, payload)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Unhandled simulation error city=%s", city_id)
        raise HTTPException(status_code=500, detail="Simulation failed. Please verify inputs and try again.") from exc
    return json_safe(out)


@router.post("/api/simulate")
def run_point_simulation(payload: dict) -> dict:
    city_id = (payload.get("city_id") or "casablanca").strip().lower()
    return run_city_simulation(city_id, payload)
