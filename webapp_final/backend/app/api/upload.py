from pathlib import Path
import shutil

from fastapi import APIRouter, UploadFile, File, Form, HTTPException

from app.services.city_store import (
    slugify_city_id,
    city_dir,
    write_city_metadata,
    get_city_status,
)
from app.services.validators import validate_city_files

router = APIRouter()


def clear_city_cache(folder):
    cache_dir = folder / "cache"
    if cache_dir.exists():
        shutil.rmtree(cache_dir)


async def save_upload(file: UploadFile | None, destination: Path) -> None:
    if file is None:
        return

    destination.parent.mkdir(parents=True, exist_ok=True)

    with destination.open("wb") as buffer:
        shutil.copyfileobj(file.file, buffer)


@router.post("/cities/upload")
async def upload_city(
    city_id: str = Form(...),
    city_name: str = Form(...),
    origins_file: UploadFile | None = File(None),
    healthcare_file: UploadFile | None = File(None),
    transport_stops_file: UploadFile | None = File(None),
    districts_file: UploadFile | None = File(None),
    route_stops_file: UploadFile | None = File(None),
    route_vertices_file: UploadFile | None = File(None),
    district_summary_file: UploadFile | None = File(None),
    population_file: UploadFile | None = File(None),
):
    try:
        normalized_city_id = slugify_city_id(city_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    folder = city_dir(normalized_city_id)
    folder.mkdir(parents=True, exist_ok=True)

    write_city_metadata(normalized_city_id, city_name)

    await save_upload(origins_file, folder / "origins.csv")
    await save_upload(healthcare_file, folder / "healthcare.csv")
    await save_upload(transport_stops_file, folder / "transport_stops.csv")
    await save_upload(districts_file, folder / "districts.csv")
    await save_upload(route_stops_file, folder / "route_stops.csv")
    await save_upload(route_vertices_file, folder / "route_vertices.csv")
    await save_upload(district_summary_file, folder / "district_accessibility_summary.csv")
    await save_upload(population_file, folder / "population.csv")

    validation_warnings = validate_city_files(folder)
    status = get_city_status(normalized_city_id)

    status["warnings"] = validation_warnings
    clear_city_cache(folder)
    try:
        from app.services.accessibility_surface import warm_accessibility_surface_cache
        warm_accessibility_surface_cache(normalized_city_id, grid_sizes=[500, 750])
    except Exception as exc:
        print(f"Could not warm cache after upload: {exc}")

    return status