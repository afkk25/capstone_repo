from __future__ import annotations

import hashlib
import json
import logging
from pathlib import Path
from typing import Any

import geopandas as gpd
import pandas as pd

from app.core.config import get_legacy_data_root
from app.core.paths import city_dir
from app.core.schemas import CityBundle, CityFiles
from app.services.aggregation import aggregate_district_summary
from app.services.preprocessors import (
    assign_points_to_zones,
    preprocess_districts,
    preprocess_facilities,
    preprocess_origins,
    preprocess_route_stops,
    preprocess_route_vertices,
    preprocess_stops,
)
from app.services.schema_detection import detect_dataframe_type
from app.services.validators import validate_readiness

logger = logging.getLogger("moroccare")


FILE_CANDIDATES = {
    "origins": ["origins.csv", "worldpop_origins.csv", "origin_accessibility_metrics.csv", "worldpop_origin_points.csv"],
    "facilities": ["healthcare.csv", "Casablanca_Healthcare.csv"],
    "stops": ["transport_stops.csv", "Casablanca_Transport_Stops.csv"],
    "route_stops": ["route_stops.csv", "Casablanca_Transport_Route_Stops.csv"],
    "route_vertices": ["route_vertices.csv", "Casablanca_Transport_Route_Vertices.csv"],
    "districts": ["districts.csv", "districts.geojson", "Casablanca_Districts.csv"],
    "district_summary": ["district_accessibility_summary.csv"],
}


def _city_name_from_id(city_id: str) -> str:
    return city_id.replace("_", " ").title()


def _read_table(path: Path) -> pd.DataFrame:
    suffix = path.suffix.lower()
    if suffix == ".csv":
        return pd.read_csv(path)
    if suffix in {".geojson", ".json"}:
        gdf = gpd.read_file(path)
        return pd.DataFrame(gdf)
    raise ValueError(f"Unsupported input file: {path}")


def find_city_files(city_id: str) -> CityFiles:
    cdir = city_dir(city_id)
    legacy = get_legacy_data_root()
    is_casablanca = city_id.strip().lower() == "casablanca"

    def pick(name: str) -> Path | None:
        for candidate in FILE_CANDIDATES[name]:
            p1 = cdir / candidate
            if p1.exists():
                return p1
            # Legacy root fallback is Casablanca-only to avoid cross-city leakage.
            p2 = legacy / candidate
            if is_casablanca and p2.exists():
                return p2
        # schema-based fallback scan in city dir
        if cdir.exists():
            for p in cdir.iterdir():
                if p.suffix.lower() != ".csv":
                    continue
                try:
                    df = pd.read_csv(p, nrows=1000)
                    det = detect_dataframe_type(df, p.name)
                    if det.file_type == name:
                        return p
                except Exception:
                    continue
        return None

    files = CityFiles(
        origins=pick("origins"),
        facilities=pick("facilities"),
        stops=pick("stops"),
        route_stops=pick("route_stops"),
        route_vertices=pick("route_vertices"),
        districts=pick("districts"),
        district_summary=pick("district_summary"),
    )
    return files


def city_signature(city_id: str, files: CityFiles) -> str:
    h = hashlib.sha256()
    h.update(city_id.encode("utf-8"))
    for name in ["origins", "facilities", "stops", "route_stops", "route_vertices", "districts", "district_summary"]:
        p = getattr(files, name)
        if p is None:
            h.update(f"{name}:missing".encode("utf-8"))
            continue
        stat = p.stat()
        h.update(f"{name}:{p}:{stat.st_mtime_ns}:{stat.st_size}".encode("utf-8"))
    return h.hexdigest()


def _load_districts(path: Path | None) -> gpd.GeoDataFrame | None:
    if path is None:
        return None
    if path.suffix.lower() in {".geojson", ".json"}:
        gdf = gpd.read_file(path)
        if "commune_name" not in gdf.columns:
            if "commune" in gdf.columns:
                gdf["commune_name"] = gdf["commune"]
            elif "district_name" in gdf.columns:
                gdf["commune_name"] = gdf["district_name"]
            elif "district" in gdf.columns:
                gdf["commune_name"] = gdf["district"]
        if "district_name" not in gdf.columns:
            if "district" in gdf.columns:
                gdf["district_name"] = gdf["district"]
            else:
                gdf["district_name"] = gdf["commune_name"]
        if "commune_id" not in gdf.columns:
            key = (gdf["district_name"].astype(str) + "_" + gdf["commune_name"].astype(str)).str.lower().str.replace(r"[^a-z0-9]+", "_", regex=True).str.strip("_")
            gdf["commune_id"] = key
        gdf["district_id"] = gdf["commune_id"]
        return gdf
    df = pd.read_csv(path)
    return preprocess_districts(df)


def load_city_bundle(city_id: str) -> CityBundle:
    files = find_city_files(city_id)
    readiness = validate_readiness(files)
    cdir = city_dir(city_id)

    metadata = {}
    cfg = cdir / "config.json"
    if cfg.exists():
        try:
            metadata = json.loads(cfg.read_text(encoding="utf-8"))
        except Exception:
            metadata = {}

    bundle = CityBundle(
        city_id=city_id,
        city_name=metadata.get("display_name", _city_name_from_id(city_id)),
        city_path=cdir,
        files=files,
        readiness=readiness,
        metadata=metadata,
    )

    districts = _load_districts(files.districts)
    bundle.districts = districts
    bundle.zones = districts
    bundle.metadata["analysis_unit"] = "commune"

    if files.origins:
        origins = preprocess_origins(_read_table(files.origins))
        if districts is not None and ("commune_id" not in origins.columns or origins["commune_id"].isna().all()):
            origins = assign_points_to_zones(origins, districts)
        if "district_id" not in origins.columns and "commune_id" in origins.columns:
            origins["district_id"] = origins["commune_id"]
        if "district_name" not in origins.columns and "commune_name" in origins.columns:
            origins["district_name"] = origins["commune_name"]
        bundle.origins = origins
    if files.facilities:
        fac = preprocess_facilities(_read_table(files.facilities), districts=districts)
        if districts is not None:
            fac = assign_points_to_zones(fac, districts)
        bundle.facilities = fac
    if files.stops:
        stops = preprocess_stops(_read_table(files.stops))
        if districts is not None:
            stops = assign_points_to_zones(stops, districts)
        bundle.stops = stops
    if files.route_stops:
        bundle.route_stops = preprocess_route_stops(_read_table(files.route_stops))
    if files.route_vertices:
        bundle.route_vertices = preprocess_route_vertices(_read_table(files.route_vertices))

    if files.district_summary and files.district_summary.exists():
        bundle.district_summary = pd.read_csv(files.district_summary)
    elif bundle.origins is not None and not bundle.origins.empty:
        bundle.district_summary = aggregate_district_summary(bundle.origins)
    bundle.commune_summary = bundle.district_summary.copy() if bundle.district_summary is not None else None

    if bundle.origins is not None and {"total_travel_time_min", "accessibility_score"}.issubset(bundle.origins.columns):
        bundle.baseline_origins = bundle.origins.copy()
    elif bundle.origins is not None:
        bundle.baseline_origins = bundle.origins.copy()

    logger.info(
        "City loaded: %s files=%s readiness=(baseline=%s simulation=%s)",
        city_id,
        {k: str(v) if v else None for k, v in files.__dict__.items()},
        readiness.baseline_ready,
        readiness.simulation_ready,
    )
    return bundle


def city_status(city_id: str, bundle: CityBundle | None = None) -> dict[str, Any]:
    if bundle is None:
        bundle = load_city_bundle(city_id)

    row_counts = {
        "origins": int(len(bundle.origins)) if bundle.origins is not None else 0,
        "facilities": int(len(bundle.facilities)) if bundle.facilities is not None else 0,
        "stops": int(len(bundle.stops)) if bundle.stops is not None else 0,
        "route_stops": int(len(bundle.route_stops)) if bundle.route_stops is not None else 0,
        "route_vertices": int(len(bundle.route_vertices)) if bundle.route_vertices is not None else 0,
        "districts": int(len(bundle.districts)) if bundle.districts is not None else 0,
        "communes": int(len(bundle.zones)) if bundle.zones is not None else 0,
    }

    return {
        "city_id": bundle.city_id,
        "city_name": bundle.city_name,
        "analysis_unit": "commune",
        "loaded_files": {k: str(v) if v else None for k, v in bundle.files.__dict__.items()},
        "row_counts": row_counts,
        "baseline_ready": bundle.readiness.baseline_ready,
        "simulation_ready": bundle.readiness.simulation_ready,
        "missing_files": bundle.readiness.missing_files,
        "warnings": bundle.readiness.warnings + bundle.load_warnings,
    }
