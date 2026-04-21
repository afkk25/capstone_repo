from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any, Literal

import numpy as np
import pandas as pd
from pyproj import Transformer

EARTH_RADIUS_KM = 6_371.0
WALKING_SPEED_KMH = 5.0
WAIT_TIME_MIN = 10.0
CASABLANCA_CITY_ID = "casablanca"


@dataclass(frozen=True)
class CasablancaSimulationData:
    origins_df: pd.DataFrame
    origin_ids: np.ndarray
    origin_lat: np.ndarray
    origin_lon: np.ndarray
    origin_name: np.ndarray
    population: np.ndarray
    district_name: np.ndarray
    tt_base: np.ndarray
    walk_time_to_stop_min: np.ndarray
    in_vehicle_time_min: np.ndarray
    before_score: np.ndarray
    stop_lat: np.ndarray
    stop_lon: np.ndarray
    healthcare_df: pd.DataFrame
    districts_df: pd.DataFrame


def _backend_data_dir() -> Path:
    return Path(__file__).resolve().parents[1] / "data"


def _resolve_csv_path(data_dir: Path, candidates: list[str]) -> Path:
    by_lower = {p.name.lower(): p for p in data_dir.iterdir() if p.is_file()}
    for name in candidates:
        candidate = data_dir / name
        if candidate.exists():
            return candidate
        found = by_lower.get(name.lower())
        if found is not None:
            return found
    raise FileNotFoundError(f"Missing required CSV. Tried: {', '.join(candidates)}")


def _numeric_series(df: pd.DataFrame, candidates: list[str], default: float = np.nan) -> pd.Series:
    for col in candidates:
        if col in df.columns:
            return pd.to_numeric(df[col], errors="coerce")
    return pd.Series(default, index=df.index, dtype=float)


def _text_series(df: pd.DataFrame, candidates: list[str], default: str) -> pd.Series:
    for col in candidates:
        if col in df.columns:
            raw = df[col].astype(str).str.strip()
            return raw.where(raw.ne(""), default)
    return pd.Series(default, index=df.index, dtype=object)


def _origin_lat_lon(worldpop_df: pd.DataFrame) -> tuple[pd.Series, pd.Series]:
    lat = _numeric_series(worldpop_df, ["lat", "latitude"])
    lon = _numeric_series(worldpop_df, ["lon", "longitude"])
    if lat.notna().any() and lon.notna().any():
        return lat, lon

    if {"x", "y"}.issubset(worldpop_df.columns):
        x = pd.to_numeric(worldpop_df["x"], errors="coerce")
        y = pd.to_numeric(worldpop_df["y"], errors="coerce")
        transformer = Transformer.from_crs("EPSG:32629", "EPSG:4326", always_xy=True)
        lon_arr, lat_arr = transformer.transform(x.to_numpy(dtype=float), y.to_numpy(dtype=float))
        return pd.Series(lat_arr, index=worldpop_df.index, dtype=float), pd.Series(lon_arr, index=worldpop_df.index, dtype=float)

    raise ValueError("Origin data must include lat/lon, latitude/longitude, or x/y columns")


def _haversine_km(lat1: Any, lon1: Any, lat2: Any, lon2: Any) -> np.ndarray:
    lat1_rad = np.radians(np.asarray(lat1, dtype=float))
    lon1_rad = np.radians(np.asarray(lon1, dtype=float))
    lat2_rad = np.radians(np.asarray(lat2, dtype=float))
    lon2_rad = np.radians(np.asarray(lon2, dtype=float))
    dlat = lat2_rad - lat1_rad
    dlon = lon2_rad - lon1_rad
    a = np.sin(dlat / 2.0) ** 2 + np.cos(lat1_rad) * np.cos(lat2_rad) * np.sin(dlon / 2.0) ** 2
    c = 2.0 * np.arcsin(np.sqrt(np.clip(a, 0.0, 1.0)))
    return EARTH_RADIUS_KM * c


def _minutes_from_km(distance_km: np.ndarray) -> np.ndarray:
    return np.asarray(distance_km, dtype=float) * (60.0 / WALKING_SPEED_KMH)


def _score_from_tt(travel_time_min: np.ndarray) -> np.ndarray:
    return np.maximum(0.0, 100.0 * (1.0 - (np.asarray(travel_time_min, dtype=float) / 60.0)))


def _weighted_mean(values: np.ndarray, weights: np.ndarray) -> float:
    v = np.asarray(values, dtype=float)
    w = np.asarray(weights, dtype=float)
    weight_sum = float(np.nansum(w))
    if weight_sum > 0.0:
        return float(np.average(v, weights=w))
    return float(np.nanmean(v)) if v.size else 0.0


def _nearest_facility_names(
    origin_lat: np.ndarray,
    origin_lon: np.ndarray,
    facility_lat: np.ndarray,
    facility_lon: np.ndarray,
    facility_names: np.ndarray,
) -> np.ndarray:
    if facility_lat.size == 0:
        return np.array(["Unknown facility"] * origin_lat.shape[0], dtype=object)
    distances = _haversine_km(origin_lat[:, np.newaxis], origin_lon[:, np.newaxis], facility_lat[np.newaxis, :], facility_lon[np.newaxis, :])
    nearest_idx = np.argmin(distances, axis=1)
    return facility_names[nearest_idx].astype(object)


def _prepare_origins(worldpop_df: pd.DataFrame, metrics_df: pd.DataFrame) -> pd.DataFrame:
    world = worldpop_df.copy()
    world["origin_id"] = pd.to_numeric(world.get("origin_id"), errors="coerce")
    world = world[world["origin_id"].notna()].copy()
    world["origin_id"] = world["origin_id"].astype(np.int64)

    lat, lon = _origin_lat_lon(world)
    world["lat"] = pd.to_numeric(lat, errors="coerce")
    world["lon"] = pd.to_numeric(lon, errors="coerce")
    world["population"] = _numeric_series(world, ["population", "population_worldpop", "pop_mean_pixel"]).fillna(0.0).clip(lower=0.0)
    world["district_name"] = _text_series(world, ["district_name", "district", "commune"], "Unknown")
    world["district_id"] = _numeric_series(world, ["district_id"])
    world["in_vehicle_time_min"] = _numeric_series(world, ["in_vehicle_time_min"])
    world["world_walk_time_to_stop_min"] = _numeric_series(world, ["walk_time_to_stop_min"])

    metrics = metrics_df.copy()
    metrics["origin_id"] = pd.to_numeric(metrics.get("origin_id"), errors="coerce")
    metrics = metrics[metrics["origin_id"].notna()].copy()
    metrics["origin_id"] = metrics["origin_id"].astype(np.int64)
    metrics["tt_base_metric"] = _numeric_series(metrics, ["tt_base", "total_travel_time_min"])
    metrics["metric_walk_time_to_stop_min"] = _numeric_series(metrics, ["walk_time_to_stop_min"])
    metrics["metric_in_vehicle_time_min"] = _numeric_series(metrics, ["in_vehicle_time_min"])

    merged = world.merge(
        metrics[["origin_id", "tt_base_metric", "metric_walk_time_to_stop_min", "metric_in_vehicle_time_min"]],
        on="origin_id",
        how="inner",
    )
    if merged.empty:
        raise ValueError("No origin rows remained after joining worldpop and accessibility metrics on origin_id")

    merged["walk_time_to_stop_min"] = (
        merged["metric_walk_time_to_stop_min"]
        .where(merged["metric_walk_time_to_stop_min"].notna(), merged["world_walk_time_to_stop_min"])
        .fillna(0.0)
        .clip(lower=0.0)
    )
    merged["tt_base"] = _numeric_series(
        merged,
        ["tt_base_metric", "tt_base", "tt_base_y", "tt_base_x", "total_travel_time_min", "total_travel_time_min_y", "total_travel_time_min_x"],
    )
    merged["in_vehicle_time_min"] = _numeric_series(
        merged,
        ["in_vehicle_time_min", "metric_in_vehicle_time_min", "in_vehicle_time_min_y", "in_vehicle_time_min_x"],
    )
    merged["in_vehicle_time_min"] = merged["in_vehicle_time_min"].where(
        merged["in_vehicle_time_min"].notna(),
        np.maximum(0.0, merged["tt_base"] - merged["walk_time_to_stop_min"] - WAIT_TIME_MIN),
    )

    merged = merged[
        merged["lat"].notna()
        & merged["lon"].notna()
        & merged["tt_base"].notna()
    ].copy()
    if merged.empty:
        raise ValueError("No valid origin rows with lat/lon and tt_base")

    merged["before_score"] = _score_from_tt(merged["tt_base"].to_numpy(dtype=float))
    return merged[
        [
            "origin_id",
            "lat",
            "lon",
            "population",
            "district_name",
            "district_id",
            "tt_base",
            "walk_time_to_stop_min",
            "in_vehicle_time_min",
            "before_score",
        ]
    ].copy()


def _load_casablanca_data() -> CasablancaSimulationData:
    data_dir = _backend_data_dir()
    metrics_path = _resolve_csv_path(data_dir, ["origin_accessibility_metrics.csv"])
    worldpop_path = _resolve_csv_path(
        data_dir,
        ["worldpop_origins_points.csv", "worldpop_origin_points.csv", "worldpop_origins.csv", "origin_accessibility_metrics.csv"],
    )
    stops_path = _resolve_csv_path(data_dir, ["casablanca_transport_stops.csv", "Casablanca_Transport_Stops.csv"])
    healthcare_path = _resolve_csv_path(data_dir, ["casablanca_healthcare.csv", "Casablanca_Healthcare.csv"])
    districts_path = _resolve_csv_path(data_dir, ["casablanca_districts.csv", "Casablanca_Districts.csv"])

    metrics_df = pd.read_csv(metrics_path)
    worldpop_df = pd.read_csv(worldpop_path)
    origins_df = _prepare_origins(worldpop_df, metrics_df)

    stops_df = pd.read_csv(stops_path)
    stop_lat_series = _numeric_series(stops_df, ["lat", "latitude"])
    stop_lon_series = _numeric_series(stops_df, ["lon", "longitude"])
    valid_stop_mask = stop_lat_series.notna() & stop_lon_series.notna()
    stop_lat = stop_lat_series[valid_stop_mask].to_numpy(dtype=float)
    stop_lon = stop_lon_series[valid_stop_mask].to_numpy(dtype=float)

    healthcare_df = pd.read_csv(healthcare_path)
    healthcare_lat = _numeric_series(healthcare_df, ["lat", "latitude"])
    healthcare_lon = _numeric_series(healthcare_df, ["lon", "longitude"])
    healthcare_name = _text_series(
        healthcare_df,
        ["name", "facility_name", "healthcare_name", "hospital_name"],
        "Unknown facility",
    ).astype(str)
    valid_healthcare_mask = healthcare_lat.notna() & healthcare_lon.notna()
    healthcare_lat_arr = healthcare_lat[valid_healthcare_mask].to_numpy(dtype=float)
    healthcare_lon_arr = healthcare_lon[valid_healthcare_mask].to_numpy(dtype=float)
    healthcare_name_arr = healthcare_name[valid_healthcare_mask].to_numpy(dtype=object)

    nearest_facility_name = _nearest_facility_names(
        origins_df["lat"].to_numpy(dtype=float),
        origins_df["lon"].to_numpy(dtype=float),
        healthcare_lat_arr,
        healthcare_lon_arr,
        healthcare_name_arr,
    )
    origins_df["origin_name"] = nearest_facility_name
    districts_df = pd.read_csv(districts_path)

    return CasablancaSimulationData(
        origins_df=origins_df,
        origin_ids=origins_df["origin_id"].to_numpy(dtype=np.int64),
        origin_lat=origins_df["lat"].to_numpy(dtype=float),
        origin_lon=origins_df["lon"].to_numpy(dtype=float),
        origin_name=origins_df["origin_name"].astype(str).to_numpy(dtype=object),
        population=origins_df["population"].to_numpy(dtype=float),
        district_name=origins_df["district_name"].astype(str).to_numpy(dtype=object),
        tt_base=origins_df["tt_base"].to_numpy(dtype=float),
        walk_time_to_stop_min=origins_df["walk_time_to_stop_min"].to_numpy(dtype=float),
        in_vehicle_time_min=origins_df["in_vehicle_time_min"].to_numpy(dtype=float),
        before_score=origins_df["before_score"].to_numpy(dtype=float),
        stop_lat=stop_lat,
        stop_lon=stop_lon,
        healthcare_df=healthcare_df,
        districts_df=districts_df,
    )


@lru_cache(maxsize=1)
def get_casablanca_simulation_data() -> CasablancaSimulationData:
    return _load_casablanca_data()


def preload_simulation_data() -> None:
    get_casablanca_simulation_data()


def _compute_new_tt(
    data: CasablancaSimulationData,
    intervention_type: Literal["healthcare_facility", "transport_stop"],
    latitude: float,
    longitude: float,
) -> tuple[np.ndarray, np.ndarray]:
    if intervention_type == "healthcare_facility":
        direct_walk_min = _minutes_from_km(_haversine_km(data.origin_lat, data.origin_lon, latitude, longitude))
        if data.stop_lat.size:
            facility_to_stop_walk_min = _minutes_from_km(_haversine_km(data.stop_lat, data.stop_lon, latitude, longitude)).min()
            transit_tt = data.walk_time_to_stop_min + WAIT_TIME_MIN + data.in_vehicle_time_min + float(facility_to_stop_walk_min)
        else:
            transit_tt = np.full_like(data.tt_base, np.inf, dtype=float)
        new_tt = np.minimum(np.minimum(direct_walk_min, transit_tt), data.tt_base)
    else:
        walk_to_new_stop_min = _minutes_from_km(_haversine_km(data.origin_lat, data.origin_lon, latitude, longitude))
        reduction = np.where(
            walk_to_new_stop_min < data.walk_time_to_stop_min,
            data.walk_time_to_stop_min - walk_to_new_stop_min,
            0.0,
        )
        new_tt = np.maximum(0.0, data.tt_base - reduction)

    improved = new_tt < data.tt_base
    return new_tt, improved


def _district_rows(work: pd.DataFrame) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for district, group in work.groupby("district_name", sort=True, dropna=False):
        pop = group["population"].to_numpy(dtype=float)
        before_score = group["before_score"].to_numpy(dtype=float)
        after_score = group["after_score"].to_numpy(dtype=float)
        before_tt = group["before_tt"].to_numpy(dtype=float)
        after_tt = group["after_tt"].to_numpy(dtype=float)
        improved = group["improved"].to_numpy(dtype=bool)
        rows.append(
            {
                "district_name": str(district),
                "before_avg_score": _weighted_mean(before_score, pop),
                "after_avg_score": _weighted_mean(after_score, pop),
                "score_delta": _weighted_mean(after_score, pop) - _weighted_mean(before_score, pop),
                "before_avg_tt": _weighted_mean(before_tt, pop),
                "after_avg_tt": _weighted_mean(after_tt, pop),
                "pop_improved": float(pop[improved].sum()),
                "origins_improved": int(improved.sum()),
            }
        )
    return rows


def run_point_simulation(
    intervention_type: str,
    latitude: float,
    longitude: float,
) -> dict[str, Any]:
    normalized_type = str(intervention_type).strip().lower()
    aliases = {
        "add_healthcare_facility": "healthcare_facility",
        "healthcare_facility": "healthcare_facility",
        "add_transport_stop": "transport_stop",
        "transport_stop": "transport_stop",
        "improve_service": "transport_stop",
    }
    if normalized_type not in aliases:
        raise ValueError("intervention_type must be one of: healthcare_facility, transport_stop")

    data = get_casablanca_simulation_data()
    intervention = aliases[normalized_type]
    new_tt, improved = _compute_new_tt(data, intervention, float(latitude), float(longitude))
    after_score = _score_from_tt(new_tt)

    pop = data.population
    before_score = data.before_score
    before_tt = data.tt_base
    summary = {
        "city_before_avg_score": _weighted_mean(before_score, pop),
        "city_after_avg_score": _weighted_mean(after_score, pop),
        "city_before_avg_tt": _weighted_mean(before_tt, pop),
        "city_after_avg_tt": _weighted_mean(new_tt, pop),
        "total_pop_improved": float(pop[improved].sum()),
        "total_origins_improved": int(improved.sum()),
    }

    work = pd.DataFrame(
        {
            "origin_id": data.origin_ids,
            "lat": data.origin_lat,
            "lon": data.origin_lon,
            "origin_name": data.origin_name,
            "population": pop,
            "district_name": data.district_name,
            "before_score": before_score,
            "after_score": after_score,
            "before_tt": before_tt,
            "after_tt": new_tt,
            "improved": improved,
        }
    )
    districts = _district_rows(work)

    origins_df = work.copy()
    origins_df["district"] = origins_df["district_name"].astype(str)
    origins_df["id"] = origins_df["origin_id"].astype(str)
    origins_df["facility_name"] = origins_df["origin_name"].astype(str)
    origins_df["name"] = origins_df["facility_name"]
    origins_df["district_name"] = origins_df["district"]
    origins_df["latitude"] = origins_df["lat"]
    origins_df["longitude"] = origins_df["lon"]
    origins_df["baseline_score"] = origins_df["before_score"] / 100.0
    origins_df["simulated_score"] = origins_df["after_score"] / 100.0
    origins_df["accessibility_score"] = origins_df["simulated_score"]
    origins_df["before_travel_time_min"] = origins_df["before_tt"]
    origins_df["travel_time_min"] = origins_df["after_tt"]
    origins_df["delta"] = (origins_df["after_score"] - origins_df["before_score"]) / 100.0
    origins_df["underserved"] = (origins_df["after_score"] < 50.0).astype(int)

    origins = origins_df[
        [
            "origin_id",
            "lat",
            "lon",
            "population",
            "district",
            "facility_name",
            "before_score",
            "after_score",
            "improved",
            "id",
            "name",
            "district_name",
            "latitude",
            "longitude",
            "baseline_score",
            "simulated_score",
            "accessibility_score",
            "before_travel_time_min",
            "travel_time_min",
            "delta",
            "underserved",
        ]
    ].to_dict(orient="records")

    impacted_origin_ids = origins_df.loc[origins_df["improved"], "origin_id"].astype(str).tolist()
    return {
        "city_id": CASABLANCA_CITY_ID,
        "summary": summary,
        "districts": districts,
        "origins": origins,
        "impacted_origin_ids": impacted_origin_ids,
        "added_facilities": [{"latitude": float(latitude), "longitude": float(longitude), "source": "user"}]
        if intervention == "healthcare_facility"
        else [],
        "added_transport_stops": [{"latitude": float(latitude), "longitude": float(longitude), "source": "user"}]
        if intervention == "transport_stop"
        else [],
        "intervention": {"intervention_type": intervention, "latitude": float(latitude), "longitude": float(longitude)},
    }

