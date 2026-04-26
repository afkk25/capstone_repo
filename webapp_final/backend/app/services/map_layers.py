import json
from pathlib import Path
from typing import Any

import pandas as pd
from shapely import wkt
from shapely.geometry import mapping

from app.services.city_store import city_dir


def point_feature(lon: float, lat: float, properties: dict[str, Any]) -> dict[str, Any] | None:
    try:
        lon_f = float(lon)
        lat_f = float(lat)
    except Exception:
        return None

    if not (-180 <= lon_f <= 180 and -90 <= lat_f <= 90):
        return None

    return {
        "type": "Feature",
        "geometry": {
            "type": "Point",
            "coordinates": [lon_f, lat_f],
        },
        "properties": properties,
    }


def facilities_geojson(city_id: str) -> dict[str, Any]:
    path = city_dir(city_id) / "healthcare.csv"

    if not path.exists():
        return {"type": "FeatureCollection", "features": []}

    df = pd.read_csv(path)
    features = []

    for idx, row in df.iterrows():
        props = {
            "facility_id": str(row.get("facility_id", f"facility_{idx + 1}")),
            "name": str(row.get("name", "Healthcare facility")),
            "type": str(row.get("type", row.get("amenity", "healthcare"))),
        }

        feature = point_feature(
            lon=row.get("longitude"),
            lat=row.get("latitude"),
            properties=props,
        )

        if feature:
            features.append(feature)

    return {
        "type": "FeatureCollection",
        "features": features,
    }


def stops_geojson(city_id: str) -> dict[str, Any]:
    path = city_dir(city_id) / "transport_stops.csv"

    if not path.exists():
        return {"type": "FeatureCollection", "features": []}

    df = pd.read_csv(path)
    features = []

    for idx, row in df.iterrows():
        props = {
            "stop_key": str(row.get("stop_key", row.get("cluster_id", f"stop_{idx + 1}"))),
            "stop_name": str(row.get("stop_name", "Transport stop")),
            "mode": str(row.get("mode", "")),
            "Lines": str(row.get("Lines", "")),
        }

        feature = point_feature(
            lon=row.get("longitude"),
            lat=row.get("latitude"),
            properties=props,
        )

        if feature:
            features.append(feature)

    return {
        "type": "FeatureCollection",
        "features": features,
    }


def districts_geojson(city_id: str) -> dict[str, Any]:
    path = city_dir(city_id) / "districts.csv"

    if not path.exists():
        return {"type": "FeatureCollection", "features": []}

    df = pd.read_csv(path)
    features = []

    for idx, row in df.iterrows():
        raw_geometry = row.get("geometry")

        if not isinstance(raw_geometry, str) or not raw_geometry.strip():
            continue

        try:
            geom = wkt.loads(raw_geometry)
        except Exception:
            continue

        zone_name = (
            row.get("commune")
            or row.get("commune_name")
            or row.get("district")
            or row.get("district_name")
            or f"Zone {idx + 1}"
        )

        district_name = (
            row.get("district")
            or row.get("district_name")
            or zone_name
        )

        props = {
            "zone_id": str(row.get("zone_id", f"zone_{idx + 1}")),
            "zone_name": str(zone_name),
            "commune_name": str(zone_name),
            "district_name": str(district_name),
        }

        features.append(
            {
                "type": "Feature",
                "geometry": mapping(geom),
                "properties": props,
            }
        )

    return {
        "type": "FeatureCollection",
        "features": features,
    }