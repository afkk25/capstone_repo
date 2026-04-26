from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from pyproj import Transformer

from app.services.city_store import city_dir
from app.services.accessibility_network import compute_automatic_network_travel_time

MOROCCO_METRIC_CRS = "EPSG:32629"
WGS84_CRS = "EPSG:4326"

TRAVEL_TIME_COLUMNS = [
    "baseline_time_min",
    "computed_baseline_time_min",
    "nearest_healthcare_travel_time_min",
    "nearest_facility_travel_time_min",
    "travel_time_min",
    "tt_base",
    "total_travel_time_min",
]

SCORE_COLUMNS = [
    "baseline_score",
    "computed_accessibility_score",
    "accessibility_score",
    "access_score",
    "score",
    "linear_accessibility_score",
]


@dataclass
class OriginMetricsResult:
    origins: pd.DataFrame
    travel_time_col: str | None
    score_col: str | None
    warnings: list[str]


def first_existing_column(df: pd.DataFrame, candidates: list[str]) -> str | None:
    for col in candidates:
        if col in df.columns:
            return col
    return None


def normalize_score_to_100(score: pd.Series) -> pd.Series:
    score = pd.to_numeric(score, errors="coerce")

    if score.notna().any() and score.max(skipna=True) <= 1.5:
        return score * 100

    return score


def looks_like_lonlat(x: pd.Series, y: pd.Series) -> bool:
    x_valid = pd.to_numeric(x, errors="coerce").dropna()
    y_valid = pd.to_numeric(y, errors="coerce").dropna()

    if x_valid.empty or y_valid.empty:
        return False

    return x_valid.between(-180, 180).all() and y_valid.between(-90, 90).all()


def haversine_m(lat1, lon1, lat2, lon2):
    lat1 = np.radians(lat1)
    lon1 = np.radians(lon1)
    lat2 = np.radians(lat2)
    lon2 = np.radians(lon2)

    dlat = lat2 - lat1
    dlon = lon2 - lon1

    a = (
        np.sin(dlat / 2) ** 2
        + np.cos(lat1) * np.cos(lat2) * np.sin(dlon / 2) ** 2
    )

    return 6371000 * (2 * np.arcsin(np.sqrt(np.clip(a, 0, 1))))


def add_origin_coordinates(origins: pd.DataFrame) -> pd.DataFrame:
    """
    Adds:
    - latitude
    - longitude
    - x_metric
    - y_metric

    Supports:
    - latitude/longitude
    - x/y as lon/lat
    - x/y as projected EPSG:32629
    """
    df = origins.copy()

    if {"latitude", "longitude"}.issubset(df.columns):
        lat = pd.to_numeric(df["latitude"], errors="coerce")
        lon = pd.to_numeric(df["longitude"], errors="coerce")

        transformer = Transformer.from_crs(
            WGS84_CRS,
            MOROCCO_METRIC_CRS,
            always_xy=True,
        )

        x_metric, y_metric = transformer.transform(
            lon.to_numpy(),
            lat.to_numpy(),
        )

        df["latitude"] = lat
        df["longitude"] = lon
        df["x_metric"] = x_metric
        df["y_metric"] = y_metric

        return df

    if {"x", "y"}.issubset(df.columns):
        x = pd.to_numeric(df["x"], errors="coerce")
        y = pd.to_numeric(df["y"], errors="coerce")

        if looks_like_lonlat(x, y):
            transformer = Transformer.from_crs(
                WGS84_CRS,
                MOROCCO_METRIC_CRS,
                always_xy=True,
            )

            x_metric, y_metric = transformer.transform(
                x.to_numpy(),
                y.to_numpy(),
            )

            df["longitude"] = x
            df["latitude"] = y
            df["x_metric"] = x_metric
            df["y_metric"] = y_metric

        else:
            transformer = Transformer.from_crs(
                MOROCCO_METRIC_CRS,
                WGS84_CRS,
                always_xy=True,
            )

            lon, lat = transformer.transform(
                x.to_numpy(),
                y.to_numpy(),
            )

            df["x_metric"] = x
            df["y_metric"] = y
            df["longitude"] = lon
            df["latitude"] = lat

        return df

    raise ValueError(
        "origins.csv must contain either latitude/longitude or x/y coordinates."
    )


def add_point_coordinates(points: pd.DataFrame) -> pd.DataFrame:
    """
    Standardize healthcare/stops point coordinates to latitude/longitude.
    """
    df = points.copy()

    if {"latitude", "longitude"}.issubset(df.columns):
        df["latitude"] = pd.to_numeric(df["latitude"], errors="coerce")
        df["longitude"] = pd.to_numeric(df["longitude"], errors="coerce")
        return df.dropna(subset=["latitude", "longitude"])

    if {"x", "y"}.issubset(df.columns):
        x = pd.to_numeric(df["x"], errors="coerce")
        y = pd.to_numeric(df["y"], errors="coerce")

        if looks_like_lonlat(x, y):
            df["longitude"] = x
            df["latitude"] = y
        else:
            transformer = Transformer.from_crs(
                MOROCCO_METRIC_CRS,
                WGS84_CRS,
                always_xy=True,
            )

            lon, lat = transformer.transform(
                x.to_numpy(),
                y.to_numpy(),
            )

            df["longitude"] = lon
            df["latitude"] = lat

        return df.dropna(subset=["latitude", "longitude"])

    return pd.DataFrame(columns=["latitude", "longitude"])


def load_healthcare_points(city_id: str) -> pd.DataFrame:
    """
    Load healthcare.csv and return valid healthcare points.
    """
    path = city_dir(city_id) / "healthcare.csv"

    if not path.exists():
        return pd.DataFrame(columns=["latitude", "longitude"])

    healthcare = pd.read_csv(path)
    healthcare = add_point_coordinates(healthcare)

    healthcare = healthcare[
        healthcare["latitude"].between(-90, 90)
        & healthcare["longitude"].between(-180, 180)
    ].copy()

    return healthcare


def compute_nearest_facility_time(
    origins: pd.DataFrame,
    healthcare: pd.DataFrame,
    travel_speed_m_per_min: float = 250,
    chunk_size: int = 2500,
) -> pd.Series:
    """
    Approximate fallback travel time to nearest healthcare facility.

    This is used only when origins.csv does not already contain travel-time data.
    It uses straight-line distance and a mixed urban speed proxy.
    """
    result = pd.Series(np.nan, index=origins.index, dtype="float64")

    valid_origins = origins[
        origins["latitude"].notna()
        & origins["longitude"].notna()
    ]

    valid_healthcare = healthcare[
        healthcare["latitude"].notna()
        & healthcare["longitude"].notna()
    ]

    if valid_origins.empty or valid_healthcare.empty:
        return result

    origin_indices = valid_origins.index.to_numpy()
    origin_lat = valid_origins["latitude"].astype(float).to_numpy()
    origin_lon = valid_origins["longitude"].astype(float).to_numpy()

    facility_lat = valid_healthcare["latitude"].astype(float).to_numpy()
    facility_lon = valid_healthcare["longitude"].astype(float).to_numpy()

    nearest_distances = np.full(len(valid_origins), np.inf)

    for start in range(0, len(valid_origins), chunk_size):
        end = min(start + chunk_size, len(valid_origins))

        distances = haversine_m(
            origin_lat[start:end, None],
            origin_lon[start:end, None],
            facility_lat[None, :],
            facility_lon[None, :],
        )

        nearest_distances[start:end] = np.nanmin(distances, axis=1)

    result.loc[origin_indices] = nearest_distances / travel_speed_m_per_min

    return result


def prepare_origin_metrics(
    city_id: str,
    origins: pd.DataFrame,
    score_threshold_min: float = 45,
    fallback_speed_m_per_min: float = 250,
) -> OriginMetricsResult:
    """
    Shared baseline-preparation function used by:
    - baseline_engine
    - accessibility_surface
    - ranking_engine
    - simulation_engine

    Ensures origins has:
    - latitude / longitude
    - x_metric / y_metric
    - population
    - baseline_time_min
    - baseline_score
    - surface_travel_time
    - surface_score
    """
    warnings: list[str] = []

    df = origins.copy()
    df = add_origin_coordinates(df)

    df["population"] = (
        pd.to_numeric(df.get("population", 1), errors="coerce")
        .fillna(1)
        .clip(lower=0)
    )

    travel_time_col = first_existing_column(df, TRAVEL_TIME_COLUMNS)
    score_col = first_existing_column(df, SCORE_COLUMNS)

    # 1. Travel time
    if travel_time_col is not None:
        df["baseline_time_min"] = pd.to_numeric(
            df[travel_time_col],
            errors="coerce",
        )

    else:
        network_time, network_warnings = compute_automatic_network_travel_time(
            city_id=city_id,
            origins=df,
        )

        warnings.extend(network_warnings)

        if network_time.notna().any():
            df["baseline_time_min"] = network_time
            df["computed_network_time_min"] = df["baseline_time_min"]
            travel_time_col = "computed_network_time_min"

        else:
            healthcare = load_healthcare_points(city_id)

            if healthcare.empty:
                raise ValueError(
                    "origins.csv does not contain a recognized travel-time column, "
                    "and neither the uploaded network files nor healthcare.csv could be used "
                    "to compute one. Please provide healthcare.csv with latitude/longitude "
                    "or x/y columns."
                )

            df["baseline_time_min"] = compute_nearest_facility_time(
                origins=df,
                healthcare=healthcare,
                travel_speed_m_per_min=fallback_speed_m_per_min,
            )

            df["computed_baseline_time_min"] = df["baseline_time_min"]
            travel_time_col = "computed_baseline_time_min"

            warnings.append(
                "Baseline travel time was automatically estimated from nearest healthcare facility distance. "
                "This is an approximate fallback, not full network routing."
            )

    if df["baseline_time_min"].isna().all():
        raise ValueError(
            "Unable to compute baseline travel time. Check origin, healthcare, and network coordinates."
        )

    # 2. Accessibility score
    if score_col is not None:
        df["baseline_score"] = normalize_score_to_100(df[score_col])
    else:
        df["baseline_score"] = 100 * (
            1
            - (df["baseline_time_min"].clip(lower=0) / score_threshold_min).clip(
                upper=1
            )
        )

        df["computed_accessibility_score"] = df["baseline_score"]
        score_col = "computed_accessibility_score"

        warnings.append(
            f"Accessibility score was automatically derived from baseline travel time using a {score_threshold_min:.0f}-minute threshold."
        )

    df["baseline_score"] = (
        pd.to_numeric(df["baseline_score"], errors="coerce")
        .clip(lower=0, upper=100)
    )

    df["surface_score"] = df["baseline_score"]
    df["surface_travel_time"] = df["baseline_time_min"]

    return OriginMetricsResult(
        origins=df,
        travel_time_col=travel_time_col,
        score_col=score_col,
        warnings=warnings,
    )


def file_signature(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None

    stat = path.stat()

    return {
        "filename": path.name,
        "size_bytes": stat.st_size,
        "mtime": stat.st_mtime,
    }


def metric_source_signature(city_id: str) -> dict[str, Any]:
    """
    Cache signature for layers that may depend on origins.csv and healthcare.csv.
    """
    folder = city_dir(city_id)

    return {
        "origins": file_signature(folder / "origins.csv"),
        "healthcare": file_signature(folder / "healthcare.csv"),
    }