from fastapi import APIRouter

from app.models.schemas import HospitalData, SimulationRequest, SimulationResponse
from app.services.data_service import simulate_hospital_predictions

router = APIRouter(prefix="", tags=["simulation"])


@router.post("/simulate", response_model=SimulationResponse)
def simulate(payload: SimulationRequest) -> SimulationResponse:
    updated_hospitals: list[HospitalData] = simulate_hospital_predictions(
        increase_stop_density=payload.increase_stop_density,
        increase_facilities=payload.increase_facilities,
    )
    return SimulationResponse(
        assumptions={
            "increase_stop_density": payload.increase_stop_density,
            "increase_facilities": payload.increase_facilities,
        },
        hospitals=updated_hospitals,
    )

