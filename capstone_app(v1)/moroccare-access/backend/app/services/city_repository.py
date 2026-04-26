from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

import pandas as pd

from app.services.dataset_registry import normalized_filename
from core.config import city_dir, load_cities_registry, save_cities_registry, save_city_config

MANIFEST_NAME = "dataset_manifest.json"


def slugify_city_id(city_name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", city_name.strip().lower()).strip("_")


def city_manifest_path(city_id: str) -> Path:
    return city_dir(city_id) / MANIFEST_NAME


def load_city_manifest(city_id: str) -> dict[str, Any]:
    path = city_manifest_path(city_id)
    if not path.exists():
        return {"city_id": city_id, "files": {}}
    return json.loads(path.read_text(encoding="utf-8"))


def save_city_manifest(city_id: str, manifest: dict[str, Any]) -> None:
    path = city_manifest_path(city_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")


def upsert_city_registry(city_id: str, display_name: str, center_lat: float | None, center_lon: float | None) -> None:
    registry = load_cities_registry()
    updated = False
    for city in registry:
        if city["id"] == city_id:
            city["name"] = display_name
            city["center_lat"] = center_lat
            city["center_lon"] = center_lon
            updated = True
            break
    if not updated:
        registry.append({"id": city_id, "name": display_name, "center_lat": center_lat, "center_lon": center_lon})
    save_cities_registry(registry)


def persist_city_dataset(
    city_id: str,
    *,
    display_name: str,
    normalized_frames: dict[str, pd.DataFrame],
    raw_files: dict[str, tuple[str, bytes]],
    warnings: list[str],
) -> dict[str, Any]:
    folder = city_dir(city_id)
    folder.mkdir(parents=True, exist_ok=True)
    raw_folder = folder / "raw"
    raw_folder.mkdir(parents=True, exist_ok=True)

    manifest = load_city_manifest(city_id)
    manifest["city_id"] = city_id
    manifest["display_name"] = display_name
    manifest["files"] = {}
    manifest["warnings"] = warnings

    for file_type, (filename, content) in raw_files.items():
        raw_path = raw_folder / filename
        raw_path.write_bytes(content)
        normalized_path = folder / normalized_filename(file_type)
        normalized_frames[file_type].to_csv(normalized_path, index=False)
        manifest["files"][file_type] = {
            "raw_filename": filename,
            "normalized_filename": normalized_path.name,
            "row_count": int(len(normalized_frames[file_type])),
        }

    center_lat = None
    center_lon = None
    if "facilities" in normalized_frames and not normalized_frames["facilities"].empty:
        center_lat = float(pd.to_numeric(normalized_frames["facilities"]["latitude"], errors="coerce").dropna().mean())
        center_lon = float(pd.to_numeric(normalized_frames["facilities"]["longitude"], errors="coerce").dropna().mean())
    elif "origins" in normalized_frames and not normalized_frames["origins"].empty:
        center_lat = float(pd.to_numeric(normalized_frames["origins"]["latitude"], errors="coerce").dropna().mean())
        center_lon = float(pd.to_numeric(normalized_frames["origins"]["longitude"], errors="coerce").dropna().mean())

    save_city_config(
        city_id,
        {
            "city_id": city_id,
            "display_name": display_name,
            "center_lat": center_lat,
            "center_lon": center_lon,
            "crs_metric": "EPSG:32629",
            "urban_ring_radii_km": [8, 18, 999],
        },
    )
    save_city_manifest(city_id, manifest)
    upsert_city_registry(city_id, display_name, center_lat, center_lon)
    return manifest
