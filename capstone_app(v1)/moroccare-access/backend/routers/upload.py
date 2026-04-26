from __future__ import annotations

import csv
import io

import pandas as pd
from fastapi import APIRouter, File, HTTPException, Query, UploadFile

from core.config import city_dir, load_cities_registry, save_cities_registry, save_city_config
from services.cache import clear_city_cache
from routers.cities import ensure_baseline_data

router = APIRouter(tags=["upload"], prefix="/api")

HEALTHCARE_COLUMNS = ["name", "latitude", "longitude", "geometry"]
STOPS_COLUMNS = ["cluster_id", "stop_name", "Lines", "mode", "longitude", "latitude"]
ORIGIN_COORDINATE_OPTIONS = ({"x", "y"}, {"latitude", "longitude"})


def _validate_columns(file_bytes: bytes, required_cols: list[str], filename: str) -> pd.DataFrame:
    try:
        text = file_bytes.decode("utf-8")
        reader = csv.DictReader(io.StringIO(text))
        if reader.fieldnames is None:
            raise ValueError("CSV has no header")
        missing = [c for c in required_cols if c not in reader.fieldnames]
        if missing:
            raise ValueError(f"Missing columns in {filename}: {missing}")
        return pd.read_csv(io.StringIO(text))
    except UnicodeDecodeError:
        raise ValueError(f"{filename} must be UTF-8 encoded")


def _validate_origin_file(file_bytes: bytes, filename: str) -> pd.DataFrame:
    try:
        text = file_bytes.decode("utf-8")
        df = pd.read_csv(io.StringIO(text))
    except UnicodeDecodeError:
        raise ValueError(f"{filename} must be UTF-8 encoded")
    if df.empty:
        raise ValueError(f"{filename} has no origin rows")
    columns = set(df.columns)
    if not any(option.issubset(columns) for option in ORIGIN_COORDINATE_OPTIONS):
        raise ValueError(f"{filename} must include either x/y columns or latitude/longitude columns")
    return df


def _normalized_city_id(city_name: str) -> str:
    return city_name.strip().lower().replace(" ", "_")


def _upsert_city_registry_entry(city_id: str, city_name: str, center_lat: float | None, center_lon: float | None) -> None:
    cities = load_cities_registry()
    found = False
    for city in cities:
        if city["id"] == city_id:
            city["name"] = city_name
            city["center_lat"] = center_lat
            city["center_lon"] = center_lon
            found = True
            break
    if not found:
        cities.append(
            {
                "id": city_id,
                "name": city_name,
                "center_lat": center_lat,
                "center_lon": center_lon,
            }
        )
    save_cities_registry(cities)


@router.post("/cities/{city_id}/upload")
async def upload_city_for_id(
    city_id: str,
    city_name: str | None = Query(default=None),
    is_new_city: bool = Query(default=False),
    healthcare_file: UploadFile = File(...),
    transport_stops_file: UploadFile = File(...),
    population_file: UploadFile | None = File(default=None),
) -> dict:
    _ = population_file
    if is_new_city:
        if not city_name or not city_name.strip():
            raise HTTPException(status_code=400, detail="city_name is required when is_new_city=true")
        normalized_city_id = _normalized_city_id(city_name)
        city_folder = city_dir(normalized_city_id)
        if city_folder.exists():
            raise HTTPException(status_code=400, detail="City already exists. Set is_new_city=False to update it.")
        city_folder.mkdir(parents=True, exist_ok=True)
        effective_city_id = normalized_city_id
        effective_city_name = city_name.strip()
        _upsert_city_registry_entry(effective_city_id, effective_city_name, None, None)
    else:
        effective_city_id = city_id.strip()
        if not effective_city_id:
            raise HTTPException(status_code=400, detail="city_id is required")
        effective_city_name = city_name.strip() if city_name and city_name.strip() else effective_city_id.replace("_", " ").title()
        city_folder = city_dir(effective_city_id)
        city_folder.mkdir(parents=True, exist_ok=True)

    healthcare_bytes = await healthcare_file.read()
    stops_bytes = await transport_stops_file.read()
    population_bytes = await population_file.read() if population_file is not None else None

    try:
        healthcare_df = _validate_columns(healthcare_bytes, HEALTHCARE_COLUMNS, healthcare_file.filename or "healthcare.csv")
        stops_df = _validate_columns(stops_bytes, STOPS_COLUMNS, transport_stops_file.filename or "transport_stops.csv")
        origin_df = _validate_origin_file(population_bytes, population_file.filename or "origin_accessibility_metrics.csv") if population_bytes else None
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    healthcare_df.to_csv(city_folder / "healthcare.csv", index=False)
    stops_df.to_csv(city_folder / "transport_stops.csv", index=False)
    if origin_df is not None:
        origin_df.to_csv(city_folder / "origin_accessibility_metrics.csv", index=False)

    center_lat = float(pd.to_numeric(healthcare_df.get("latitude"), errors="coerce").dropna().mean())
    center_lon = float(pd.to_numeric(healthcare_df.get("longitude"), errors="coerce").dropna().mean())

    save_city_config(
        effective_city_id,
        {
            "city_id": effective_city_id,
            "display_name": effective_city_name,
            "center_lat": center_lat,
            "center_lon": center_lon,
            "crs_metric": "EPSG:32629",
            "urban_ring_radii_km": [8, 18, 999],
        },
    )

    clear_city_cache(effective_city_id)
    try:
        trained_df, _ = ensure_baseline_data(effective_city_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    _upsert_city_registry_entry(effective_city_id, effective_city_name, center_lat, center_lon)
    return {
        "success": True,
        "city_summary": {
            "city_id": effective_city_id,
            "display_name": effective_city_name,
            "center_lat": center_lat,
            "center_lon": center_lon,
            "facilities_count": int(len(trained_df)),
            "analysis_rows_count": int(len(trained_df)),
            "analysis_unit": str(trained_df.get("analysis_unit", pd.Series(["unknown"])).iloc[0]) if len(trained_df) else "unknown",
            "origin_file_uploaded": origin_df is not None,
        },
    }


@router.post("/cities/upload")
async def upload_city_legacy(
    city_id: str = Query(...),
    city_name: str | None = Query(default=None),
    is_new_city: bool = Query(default=False),
    healthcare_file: UploadFile = File(...),
    transport_stops_file: UploadFile = File(...),
    population_file: UploadFile | None = File(default=None),
) -> dict:
    return await upload_city_for_id(
        city_id=city_id,
        city_name=city_name,
        is_new_city=is_new_city,
        healthcare_file=healthcare_file,
        transport_stops_file=transport_stops_file,
        population_file=population_file,
    )
