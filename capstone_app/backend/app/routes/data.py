from fastapi import APIRouter

from app.models.schemas import DistrictData, HospitalData
from app.services.data_service import get_districts, get_hospitals

router = APIRouter(prefix="", tags=["data"])


@router.get("/districts", response_model=list[DistrictData])
def districts() -> list[DistrictData]:
    return get_districts()


@router.get("/hospitals", response_model=list[HospitalData])
def hospitals() -> list[HospitalData]:
    return get_hospitals()

