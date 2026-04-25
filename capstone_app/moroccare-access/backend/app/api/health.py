from fastapi import APIRouter

router = APIRouter()


@router.get("/health")
def health() -> dict:
    return {"status": "ok"}


@router.get("/api/health")
def api_health() -> dict:
    return {"status": "ok"}
