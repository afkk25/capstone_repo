from fastapi import APIRouter

from app.services.city_store import list_city_statuses, get_city_status

router = APIRouter()

@router.get("/cities")
def get_cities():
    return list_city_statuses()


@router.get("/cities/{city_id}/status")
def get_city_status_endpoint(city_id: str):
    return get_city_status(city_id)