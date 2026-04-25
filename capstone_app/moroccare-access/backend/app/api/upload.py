from __future__ import annotations

import shutil
from pathlib import Path

import pandas as pd
from fastapi import APIRouter, File, Form, UploadFile

from app.core.paths import ensure_city_dirs
from app.services.city_registry import clear_city_bundle_cache, get_city_status
from app.services.schema_detection import detect_dataframe_type

router = APIRouter(prefix="/api/cities", tags=["upload"])


NORMALIZED_NAMES = {
    "origins": "origins.csv",
    "facilities": "healthcare.csv",
    "stops": "transport_stops.csv",
    "route_stops": "route_stops.csv",
    "route_vertices": "route_vertices.csv",
    "districts": "districts.csv",
    "district_summary": "district_accessibility_summary.csv",
}


def _inspect_csv(path: Path) -> dict:
    try:
        df = pd.read_csv(path, nrows=2000)
        det = detect_dataframe_type(df, path.name)
        return {
            "filename": path.name,
            "detected_type": det.file_type,
            "required_columns_found": det.found_columns,
            "required_columns": det.required_columns,
            "missing_columns": det.missing_columns,
            "warnings": det.warnings,
        }
    except Exception as exc:
        return {
            "filename": path.name,
            "detected_type": None,
            "required_columns_found": [],
            "required_columns": [],
            "missing_columns": [],
            "warnings": [str(exc)],
        }


@router.post("/upload")
async def upload_city(
    city_id: str = Form(...),
    city_name: str | None = Form(default=None),
    files: list[UploadFile] = File(default=[]),
) -> dict:
    return await _upload_impl(city_id=city_id, city_name=city_name, files=files)


@router.post("/{city_id}/upload")
async def upload_city_scoped(
    city_id: str,
    files: list[UploadFile] = File(default=[]),
    city_name: str | None = None,
    is_new_city: bool = False,
) -> dict:
    return await _upload_impl(city_id=city_id, city_name=city_name, files=files)


async def _upload_impl(city_id: str, city_name: str | None, files: list[UploadFile]) -> dict:
    city_id = city_id.strip().lower()
    root = ensure_city_dirs(city_id)
    raw_dir = root / "raw"

    detections = []
    for f in files:
        target = raw_dir / f.filename
        with target.open("wb") as out:
            shutil.copyfileobj(f.file, out)
        detected = _inspect_csv(target)
        detections.append(detected)

        dtype = detected.get("detected_type")
        if dtype in NORMALIZED_NAMES:
            shutil.copy2(target, root / NORMALIZED_NAMES[dtype])

    clear_city_bundle_cache()
    status = get_city_status(city_id)

    readiness = {
        "baseline_ready": status["baseline_ready"],
        "simulation_ready": status["simulation_ready"],
        "missing_files": status["missing_files"],
        "warnings": status["warnings"],
    }

    return {
        "success": True,
        "city_summary": {
            "city_id": city_id,
            "display_name": city_name or status.get("city_name") or city_id.title(),
            "center_lat": 0,
            "center_lon": 0,
            "facilities_count": status.get("row_counts", {}).get("facilities", 0),
        },
        "detected_files": detections,
        "dataset_readiness": readiness,
        "file_requirements": {
            key: {
                "normalized_filename": val,
                "required_for_baseline": key in {"origins", "facilities", "districts", "stops"},
                "required_for_simulation": key in {"origins", "facilities", "districts", "stops", "route_stops", "route_vertices"},
            }
            for key, val in NORMALIZED_NAMES.items()
        },
    }
