from fastapi import APIRouter

from app.models.schemas import HealthResponse

router = APIRouter(prefix="", tags=["health"])


@router.get("/health", response_model=HealthResponse)
def get_health() -> HealthResponse:
    return HealthResponse(status="ok", message="Backend is healthy and running.")

