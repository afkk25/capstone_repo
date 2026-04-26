from fastapi import APIRouter

from app.services.baseline_engine import compute_baseline

router = APIRouter()

@router.get("/cities/{city_id}/baseline")
def get_baseline(city_id: str):
    return compute_baseline(city_id)