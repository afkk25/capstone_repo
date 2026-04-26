from fastapi import APIRouter

from app.services.ranking_engine import compute_ranking

router = APIRouter()


@router.get("/cities/{city_id}/ranking")
def get_city_ranking(city_id: str):
    return compute_ranking(city_id)