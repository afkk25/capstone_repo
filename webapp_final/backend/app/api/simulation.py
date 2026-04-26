from fastapi import APIRouter, HTTPException

from app.services.simulation_engine import (
    run_simulation,
    recommend_simulation_locations,
)
router = APIRouter()


@router.post("/cities/{city_id}/simulate")
def simulate_city(city_id: str, payload: dict):
    try:
        return run_simulation(city_id, payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Simulation failed: {exc}")
    

@router.get("/cities/{city_id}/simulation-recommendations")
def simulation_recommendations(
    city_id: str,
    scenario_type: str = "add_facility",
    limit: int = 5,
):
    try:
        return recommend_simulation_locations(
            city_id=city_id,
            scenario_type=scenario_type,
            limit=limit,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Simulation recommendations failed: {exc}",
        )