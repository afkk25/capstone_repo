from fastapi import APIRouter

from app.services.map_layers import facilities_geojson, stops_geojson, districts_geojson

router = APIRouter()

@router.get("/cities/{city_id}/facilities")
def get_facilities(city_id: str):
    return facilities_geojson(city_id)


@router.get("/cities/{city_id}/stops")
def get_stops(city_id: str):
    return stops_geojson(city_id)


@router.get("/cities/{city_id}/districts")
def get_districts(city_id: str):
    return districts_geojson(city_id)


@router.get("/cities/{city_id}/communes")
def get_communes(city_id: str):
    return districts_geojson(city_id)


@router.get("/cities/{city_id}/zones")
def get_zones(city_id: str):
    return districts_geojson(city_id)