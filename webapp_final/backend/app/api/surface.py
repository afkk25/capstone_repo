# from fastapi import APIRouter, HTTPException, Query

# from app.services.accessibility_surface import make_accessibility_surface

# router = APIRouter()


# @router.get("/cities/{city_id}/accessibility-surface")
# def get_accessibility_surface(
#     city_id: str,
#     grid_size_m: int = Query(350, ge=100, le=2000),
# ):
#     try:
#         return make_accessibility_surface(city_id, grid_size_m=grid_size_m)
#     except ValueError as exc:
#         raise HTTPException(status_code=400, detail=str(exc))
#     except Exception as exc:
#         raise HTTPException(
#             status_code=500,
#             detail=f"Failed to build accessibility surface: {exc}",
#         )

from fastapi import APIRouter, HTTPException, Query

from app.services.accessibility_surface import make_accessibility_surface

router = APIRouter()


@router.get("/cities/{city_id}/accessibility-surface")
def get_accessibility_surface(
    city_id: str,
    grid_size_m: int = Query(500, ge=100, le=2000),
    force_rebuild: bool = Query(False),
):
    try:
        return make_accessibility_surface(
            city_id,
            grid_size_m=grid_size_m,
            force_rebuild=force_rebuild,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to build accessibility surface: {exc}",
        )