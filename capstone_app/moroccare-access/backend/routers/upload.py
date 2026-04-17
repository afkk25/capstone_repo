from __future__ import annotations

import csv
import io

import geopandas as gpd
import pandas as pd
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from shapely import wkt

from core.config import city_dir, save_city_config
from core.features import compute_features
from core.modeling import train_model
from services.cache import clear_city_cache

router = APIRouter(tags=["upload"], prefix="/api")

HEALTHCARE_COLUMNS = ["name", "latitude", "longitude", "geometry"]
STOPS_COLUMNS = ["cluster_id", "stop_name", "Lines", "mode", "longitude", "latitude"]


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


@router.post("/cities/upload")
async def upload_city(
    city_id: str = Form(...),
    display_name: str = Form(...),
    center_lat: float = Form(...),
    center_lon: float = Form(...),
    crs_metric: str = Form("EPSG:32629"),
    healthcare_file: UploadFile = File(...),
    transport_stops_file: UploadFile = File(...),
) -> dict:
    if not city_id.strip():
        raise HTTPException(status_code=400, detail="city_id is required")

    healthcare_bytes = await healthcare_file.read()
    stops_bytes = await transport_stops_file.read()

    try:
        healthcare_df = _validate_columns(healthcare_bytes, HEALTHCARE_COLUMNS, healthcare_file.filename or "healthcare.csv")
        stops_df = _validate_columns(stops_bytes, STOPS_COLUMNS, transport_stops_file.filename or "transport_stops.csv")
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    folder = city_dir(city_id)
    folder.mkdir(parents=True, exist_ok=True)
    healthcare_df.to_csv(folder / "healthcare.csv", index=False)
    stops_df.to_csv(folder / "transport_stops.csv", index=False)

    save_city_config(
        city_id,
        {
            "city_id": city_id,
            "display_name": display_name,
            "center_lat": center_lat,
            "center_lon": center_lon,
            "crs_metric": crs_metric,
            "urban_ring_radii_km": [8, 18, 999],
        },
    )

    healthcare_gdf = gpd.GeoDataFrame(healthcare_df.copy(), geometry=healthcare_df["geometry"].apply(wkt.loads), crs="EPSG:4326")
    stops_gdf = gpd.GeoDataFrame(
        stops_df.copy(),
        geometry=gpd.points_from_xy(stops_df["longitude"], stops_df["latitude"]),
        crs="EPSG:4326",
    )
    config = {
        "city_id": city_id,
        "display_name": display_name,
        "center_lat": center_lat,
        "center_lon": center_lon,
        "crs_metric": crs_metric,
        "urban_ring_radii_km": [8, 18, 999],
    }
    features_df = compute_features(healthcare_gdf, stops_gdf, config)
    _, _, trained_df = train_model(features_df, city_id)
    clear_city_cache(city_id)
    return {
        "success": True,
        "city_summary": {
            "city_id": city_id,
            "display_name": display_name,
            "center_lat": center_lat,
            "center_lon": center_lon,
            "facilities_count": int(len(trained_df)),
        },
    }
