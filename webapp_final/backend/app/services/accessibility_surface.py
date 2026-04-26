from typing import Any
import json
from pathlib import Path

import numpy as np
import pandas as pd
from shapely.geometry import box, mapping
from shapely.ops import transform
from pyproj import Transformer

from app.services.city_store import city_dir
from app.services.baseline_engine import first_existing_column, safe_number
from app.services.origin_metrics import prepare_origin_metrics, metric_source_signature

MOROCCO_METRIC_CRS = "EPSG:32629"
WGS84_CRS = "EPSG:4326"


def weighted_average(values: pd.Series, weights: pd.Series) -> float | None:
    values = pd.to_numeric(values, errors="coerce")
    weights = pd.to_numeric(weights, errors="coerce").fillna(0)

    mask = values.notna() & weights.notna() & (weights > 0)

    if not mask.any():
        if values.notna().any():
            return float(values.mean())
        return None

    total_weight = weights[mask].sum()

    if total_weight <= 0:
        if values.notna().any():
            return float(values.mean())
        return None

    return float((values[mask] * weights[mask]).sum() / total_weight)


def looks_like_lonlat(x: pd.Series, y: pd.Series) -> bool:
    x_valid = pd.to_numeric(x, errors="coerce").dropna()
    y_valid = pd.to_numeric(y, errors="coerce").dropna()

    if x_valid.empty or y_valid.empty:
        return False

    return x_valid.between(-180, 180).all() and y_valid.between(-90, 90).all()


def get_cache_paths(city_id: str, grid_size_m: int) -> tuple[Path, Path]:
    folder = city_dir(city_id)
    cache_dir = folder / "cache"
    cache_dir.mkdir(parents=True, exist_ok=True)

    surface_path = cache_dir / f"accessibility_surface_{grid_size_m}m.geojson"
    metadata_path = cache_dir / f"accessibility_surface_{grid_size_m}m.meta.json"

    return surface_path, metadata_path


def get_origins_signature(origins_path: Path) -> dict[str, Any]:
    city_id = origins_path.parent.name
    return metric_source_signature(city_id)


def cache_is_valid(surface_path: Path, metadata_path: Path, origins_signature: dict[str, Any]) -> bool:
    if not surface_path.exists() or not metadata_path.exists():
        return False

    try:
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    except Exception:
        return False

    return metadata.get("origins_signature") == origins_signature


def read_cached_surface(surface_path: Path) -> dict[str, Any]:
    return json.loads(surface_path.read_text(encoding="utf-8"))


def write_cached_surface(
    surface_path: Path,
    metadata_path: Path,
    surface: dict[str, Any],
    origins_signature: dict[str, Any],
) -> None:
    metadata = {
        "origins_signature": origins_signature,
        "surface_metadata": surface.get("metadata", {}),
    }

    surface_path.write_text(
        json.dumps(surface, ensure_ascii=False),
        encoding="utf-8",
    )

    metadata_path.write_text(
        json.dumps(metadata, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )


def add_metric_coordinates(origins: pd.DataFrame) -> pd.DataFrame:
    df = origins.copy()

    if {"latitude", "longitude"}.issubset(df.columns):
        lat = pd.to_numeric(df["latitude"], errors="coerce")
        lon = pd.to_numeric(df["longitude"], errors="coerce")

        transformer = Transformer.from_crs(WGS84_CRS, MOROCCO_METRIC_CRS, always_xy=True)
        x_metric, y_metric = transformer.transform(lon.to_numpy(), lat.to_numpy())

        df["x_metric"] = x_metric
        df["y_metric"] = y_metric
        df["latitude"] = lat
        df["longitude"] = lon
        return df

    if {"x", "y"}.issubset(df.columns):
        x = pd.to_numeric(df["x"], errors="coerce")
        y = pd.to_numeric(df["y"], errors="coerce")

        if looks_like_lonlat(x, y):
            transformer = Transformer.from_crs(WGS84_CRS, MOROCCO_METRIC_CRS, always_xy=True)
            x_metric, y_metric = transformer.transform(x.to_numpy(), y.to_numpy())

            df["longitude"] = x
            df["latitude"] = y
            df["x_metric"] = x_metric
            df["y_metric"] = y_metric
        else:
            transformer = Transformer.from_crs(MOROCCO_METRIC_CRS, WGS84_CRS, always_xy=True)
            lon, lat = transformer.transform(x.to_numpy(), y.to_numpy())

            df["x_metric"] = x
            df["y_metric"] = y
            df["longitude"] = lon
            df["latitude"] = lat

        return df

    raise ValueError("origins.csv must contain either latitude/longitude or x/y coordinates.")


def add_accessibility_metrics(origins: pd.DataFrame) -> tuple[pd.DataFrame, str | None, str | None]:
    df = origins.copy()

    score_col = first_existing_column(
        df,
        [
            "accessibility_score",
            "access_score",
            "score",
            "linear_accessibility_score",
        ],
    )

    travel_time_col = first_existing_column(
        df,
        [
            "tt_base",
            "total_travel_time_min",
            "travel_time_min",
            "nearest_healthcare_travel_time_min",
            "nearest_facility_travel_time_min",
        ],
    )

    if score_col is not None:
        df["surface_score"] = pd.to_numeric(df[score_col], errors="coerce")

        if df["surface_score"].notna().any() and df["surface_score"].max(skipna=True) <= 1.5:
            df["surface_score"] = df["surface_score"] * 100

    elif travel_time_col is not None:
        travel_time = pd.to_numeric(df[travel_time_col], errors="coerce")

        df["surface_score"] = 100 * (
            1 - (travel_time.clip(lower=0) / 45).clip(upper=1)
        )

    else:
        raise ValueError(
            "origins.csv must contain accessibility_score or a travel-time column such as tt_base."
        )

    if travel_time_col is not None:
        df["surface_travel_time"] = pd.to_numeric(df[travel_time_col], errors="coerce")
    else:
        df["surface_travel_time"] = np.nan

    df["surface_score"] = df["surface_score"].clip(lower=0, upper=100)

    return df, score_col, travel_time_col


def compute_accessibility_surface(city_id: str, grid_size_m: int = 500) -> dict[str, Any]:
    if grid_size_m < 100:
        grid_size_m = 100

    if grid_size_m > 2000:
        grid_size_m = 2000

    folder = city_dir(city_id)
    origins_path = folder / "origins.csv"

    if not origins_path.exists():
        raise ValueError(f"Missing origins.csv for city '{city_id}'.")

    origins = pd.read_csv(origins_path)

    if "population" not in origins.columns:
        raise ValueError("origins.csv must contain a population column.")

    metrics = prepare_origin_metrics(city_id, origins)
    origins = metrics.origins
    score_col = metrics.score_col
    travel_time_col = metrics.travel_time_col

    origins["x_metric"] = pd.to_numeric(origins["x_metric"], errors="coerce")
    origins["y_metric"] = pd.to_numeric(origins["y_metric"], errors="coerce")

    valid = origins[
        origins["x_metric"].notna()
        & origins["y_metric"].notna()
        & origins["surface_score"].notna()
    ].copy()

    if valid.empty:
        raise ValueError("No valid origin points could be used for the accessibility surface.")

    valid["grid_x"] = np.floor(valid["x_metric"] / grid_size_m) * grid_size_m
    valid["grid_y"] = np.floor(valid["y_metric"] / grid_size_m) * grid_size_m

    transformer = Transformer.from_crs(MOROCCO_METRIC_CRS, WGS84_CRS, always_xy=True)

    features: list[dict[str, Any]] = []

    for (grid_x, grid_y), group in valid.groupby(["grid_x", "grid_y"], dropna=False):
        population = group["population"]

        score = weighted_average(group["surface_score"], population)
        travel_time = weighted_average(group["surface_travel_time"], population)

        total_population = float(population.sum())
        origin_count = int(len(group))

        cell = box(
            float(grid_x),
            float(grid_y),
            float(grid_x + grid_size_m),
            float(grid_y + grid_size_m),
        )

        cell_wgs84 = transform(transformer.transform, cell)

        features.append(
            {
                "type": "Feature",
                "geometry": mapping(cell_wgs84),
                "properties": {
                    "score": safe_number(score),
                    "avg_travel_time_min": safe_number(travel_time),
                    "population": safe_number(total_population),
                    "origin_count": origin_count,
                    "grid_size_m": grid_size_m,
                },
            }
        )

    return {
        "type": "FeatureCollection",
        "features": features,
        "metadata": {
            "city_id": city_id,
            "grid_size_m": grid_size_m,
            "score_column_used": score_col,
            "travel_time_column_used": travel_time_col,
            "metric_warnings": metrics.warnings,
            "cell_count": len(features),
            "source": "origin-level accessibility surface",
            "cached": False,
        },
    }


def make_accessibility_surface(
    city_id: str,
    grid_size_m: int = 500,
    force_rebuild: bool = False,
) -> dict[str, Any]:
    """
    Cached accessibility surface.

    First call computes and saves GeoJSON.
    Later calls read from cache unless origins.csv changed.
    """
    folder = city_dir(city_id)
    origins_path = folder / "origins.csv"

    if not origins_path.exists():
        raise ValueError(f"Missing origins.csv for city '{city_id}'.")

    origins_signature = get_origins_signature(origins_path)
    surface_path, metadata_path = get_cache_paths(city_id, grid_size_m)

    if not force_rebuild and cache_is_valid(surface_path, metadata_path, origins_signature):
        surface = read_cached_surface(surface_path)
        surface.setdefault("metadata", {})
        surface["metadata"]["cached"] = True
        return surface

    surface = compute_accessibility_surface(city_id, grid_size_m=grid_size_m)
    write_cached_surface(surface_path, metadata_path, surface, origins_signature)

    return surface


def warm_accessibility_surface_cache(city_id: str, grid_sizes: list[int] | None = None) -> None:
    """
    Optional startup/preload helper.
    Computes common grid sizes once so frontend pages load faster.
    """
    if grid_sizes is None:
        grid_sizes = [500, 750]

    for grid_size in grid_sizes:
        try:
            make_accessibility_surface(city_id, grid_size_m=grid_size, force_rebuild=False)
            print(f"Warm cache ready: {city_id} accessibility surface {grid_size}m")
        except Exception as exc:
            print(f"Could not warm surface cache for {city_id} {grid_size}m: {exc}")