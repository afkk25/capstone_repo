from __future__ import annotations

import ast
import heapq
import logging
import math
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

import geopandas as gpd
import numpy as np
import pandas as pd

from core.config import load_city_config
from services.notebook_bridge.loaders import get_city_paths, load_city_healthcare_df, load_city_transport_stops_df, load_notebook_origin_metrics

logger = logging.getLogger(__name__)

DEFAULT_ACCESS_MAX_MIN = 45.0
DEFAULT_WALKING_SPEED_MPS = 1.0
DEFAULT_WALKING_SPEED_KMH = 3.6
DEFAULT_WAIT_TIME_MIN = 10.0
DEFAULT_TRANSPORT_SPEED_KMH = 20.0
DEFAULT_K_NEAREST_STOPS = 5
DEFAULT_STOP_CONNECTORS = 3
DEFAULT_MAX_CONNECTOR_WALK_M = 1_500.0
DEFAULT_COVERAGE_THRESHOLDS = (30.0, 60.0)


def _safe_numeric(df: pd.DataFrame, cols: list[str]) -> pd.DataFrame:
    out = df.copy()
    for col in cols:
        if col in out.columns:
            out[col] = pd.to_numeric(out[col], errors="coerce")
    return out


def _first_numeric_series(df: pd.DataFrame, candidates: list[str], default: float = np.nan) -> pd.Series:
    for col in candidates:
        if col in df.columns:
            return pd.to_numeric(df[col], errors="coerce")
    return pd.Series(default, index=df.index, dtype=float)


def _clean_text(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text or text.lower() in {"nan", "none", "null"}:
        return None
    return text


def _first_text_series(df: pd.DataFrame, candidates: list[str], fallback_prefix: str) -> pd.Series:
    for col in candidates:
        if col in df.columns:
            raw = df[col].apply(_clean_text)
            fallback = pd.Series([f"{fallback_prefix} {idx + 1}" for idx in range(len(df))], index=df.index, dtype="object")
            return raw.fillna(fallback).astype(str)
    return pd.Series([f"{fallback_prefix} {idx + 1}" for idx in range(len(df))], index=df.index, dtype="object")


def _slug(value: str) -> str:
    token = re.sub(r"[^a-z0-9]+", "_", str(value).strip().lower())
    token = re.sub(r"_+", "_", token).strip("_")
    return token or "unknown"


def _coordinate_columns(origins_df: pd.DataFrame, city_cfg: dict[str, Any]) -> pd.DataFrame:
    frame = origins_df.copy().reset_index(drop=True)
    metric_crs = city_cfg.get("crs_metric", "EPSG:32629") or "EPSG:32629"

    if {"longitude", "latitude"}.issubset(frame.columns):
        lon = pd.to_numeric(frame["longitude"], errors="coerce")
        lat = pd.to_numeric(frame["latitude"], errors="coerce")
        geo = gpd.GeoDataFrame(frame, geometry=gpd.points_from_xy(lon, lat), crs="EPSG:4326")
        metric = geo.to_crs(metric_crs)
        frame["longitude"] = lon
        frame["latitude"] = lat
        frame["x_metric"] = metric.geometry.x
        frame["y_metric"] = metric.geometry.y
        return frame

    if {"x", "y"}.issubset(frame.columns):
        x = pd.to_numeric(frame["x"], errors="coerce")
        y = pd.to_numeric(frame["y"], errors="coerce")
        looks_like_lon_lat = x.between(-180, 180).all() and y.between(-90, 90).all()
        source_crs = "EPSG:4326" if looks_like_lon_lat else metric_crs
        geo = gpd.GeoDataFrame(frame, geometry=gpd.points_from_xy(x, y), crs=source_crs)
        ll = geo.to_crs("EPSG:4326")
        metric = geo.to_crs(metric_crs)
        frame["longitude"] = ll.geometry.x
        frame["latitude"] = ll.geometry.y
        frame["x_metric"] = metric.geometry.x
        frame["y_metric"] = metric.geometry.y
        return frame

    raise ValueError("Origin metrics must include longitude/latitude or x/y coordinates")


def accessibility_score_from_travel_time(travel_time_min: pd.Series | np.ndarray | float, max_travel_time_min: float = DEFAULT_ACCESS_MAX_MIN) -> pd.Series:
    travel = pd.to_numeric(pd.Series(travel_time_min), errors="coerce")
    max_minutes = max(float(max_travel_time_min), 1.0)
    ratio = (travel.clip(lower=0.0) / max_minutes).clip(upper=1.0)
    return (100.0 * (1.0 - ratio)).clip(lower=0.0, upper=100.0)


def travel_time_from_accessibility_score(score: pd.Series | np.ndarray | float, max_time: float = DEFAULT_ACCESS_MAX_MIN) -> pd.Series:
    numeric = pd.to_numeric(pd.Series(score), errors="coerce")
    clipped = numeric.clip(lower=0.0, upper=100.0)
    return max(float(max_time), 1.0) * (1.0 - clipped / 100.0)


def _normalize_score_scale(score_series: pd.Series) -> tuple[pd.Series, pd.Series]:
    numeric = pd.to_numeric(score_series, errors="coerce")
    if numeric.notna().sum() == 0:
        return numeric, numeric
    if float(numeric.max(skipna=True)) <= 1.5:
        normalized = numeric.clip(lower=0.0, upper=1.0)
        return normalized * 100.0, normalized
    return numeric.clip(lower=0.0, upper=100.0), (numeric / 100.0).clip(lower=0.0, upper=1.0)


def standardize_origin_metrics(origins_df: pd.DataFrame, city_cfg: dict[str, Any]) -> pd.DataFrame:
    if origins_df.empty:
        return pd.DataFrame()

    frame = _coordinate_columns(origins_df, city_cfg)
    frame = _safe_numeric(
        frame,
        [
            "population",
            "population_worldpop",
            "pop_mean_pixel",
            "pop_density_km2",
            "district_id",
            "walk_dist_to_stop_m",
            "nearest_stop_dist_m",
            "walk_time_to_stop_min",
            "in_vehicle_time_min",
            "wait_time_min",
            "travel_time_min",
            "total_travel_time_min",
            "nearest_healthcare_travel_time_min",
            "accessibility_score",
            "normalized_accessibility_score",
            "accessibility_2sfca",
            "score_2sfca",
            "num_facilities_reachable_30min",
            "num_facilities_reachable_60min",
        ],
    )

    frame["origin_id"] = _first_text_series(frame, ["origin_id", "id"], "origin")
    frame["origin_name"] = _first_text_series(frame, ["origin_name", "origin_id"], "Origin")
    frame["commune_name"] = _first_text_series(frame, ["commune", "commune_name", "district", "district_name", "name"], "Commune")
    frame["district_name"] = _first_text_series(frame, ["district", "district_name", "commune_name"], "District")
    frame["commune_id"] = frame.apply(
        lambda r: _slug(f"{_clean_text(r.get('district_name')) or 'district'}_{_clean_text(r.get('commune_name')) or 'commune'}"),
        axis=1,
    )
    frame["district_id"] = frame["commune_id"]

    frame["population"] = _first_numeric_series(frame, ["population", "population_worldpop", "pop_mean_pixel"], default=0.0).fillna(0.0).clip(lower=0.0)
    frame["population_density"] = _first_numeric_series(frame, ["population_density", "pop_density_km2"], default=np.nan)
    frame["distance_to_nearest_stop_m"] = _first_numeric_series(frame, ["nearest_stop_dist_m", "walk_dist_to_stop_m"], default=np.nan)
    frame["nearest_stop_id"] = _first_text_series(frame, ["nearest_stop_id", "chosen_stop_key"], "stop")
    frame["walk_time_to_stop_min"] = _first_numeric_series(frame, ["walk_time_to_stop_min"], default=np.nan)
    frame["in_vehicle_time_min"] = _first_numeric_series(frame, ["in_vehicle_time_min"], default=np.nan)
    frame["wait_time_min"] = _first_numeric_series(frame, ["wait_time_min"], default=DEFAULT_WAIT_TIME_MIN).fillna(DEFAULT_WAIT_TIME_MIN)
    frame["total_travel_time_min"] = _first_numeric_series(frame, ["total_travel_time_min", "nearest_healthcare_travel_time_min", "travel_time_min"], default=np.nan)
    frame["nearest_facility_id"] = _first_text_series(frame, ["nearest_facility_id"], "facility")
    frame["score_2sfca"] = _first_numeric_series(frame, ["score_2sfca", "accessibility_2sfca"], default=np.nan)

    if "accessibility_score" in frame.columns and pd.to_numeric(frame["accessibility_score"], errors="coerce").notna().any():
        score_100, score_01 = _normalize_score_scale(frame["accessibility_score"])
        frame["accessibility_score"] = score_100
        frame["normalized_accessibility_score"] = score_01
    elif "normalized_accessibility_score" in frame.columns and pd.to_numeric(frame["normalized_accessibility_score"], errors="coerce").notna().any():
        normalized = pd.to_numeric(frame["normalized_accessibility_score"], errors="coerce").clip(lower=0.0, upper=1.0)
        frame["normalized_accessibility_score"] = normalized
        frame["accessibility_score"] = normalized * 100.0
    else:
        frame["accessibility_score"] = accessibility_score_from_travel_time(frame["total_travel_time_min"], DEFAULT_ACCESS_MAX_MIN)
        frame["normalized_accessibility_score"] = frame["accessibility_score"] / 100.0

    frame["analysis_unit"] = "origin"
    return frame[
        [
            "origin_id",
            "origin_name",
            "commune_id",
            "commune_name",
            "district_id",
            "district_name",
            "latitude",
            "longitude",
            "x_metric",
            "y_metric",
            "population",
            "population_density",
            "distance_to_nearest_stop_m",
            "nearest_stop_id",
            "walk_time_to_stop_min",
            "nearest_facility_id",
            "in_vehicle_time_min",
            "wait_time_min",
            "total_travel_time_min",
            "accessibility_score",
            "normalized_accessibility_score",
            "score_2sfca",
            "analysis_unit",
        ]
    ].copy()


def load_city_origin_baseline(city_id: str) -> pd.DataFrame:
    city_cfg = load_city_config(city_id)
    origins_df = load_notebook_origin_metrics(city_id)
    return standardize_origin_metrics(origins_df, city_cfg)


def load_city_facilities(city_id: str) -> pd.DataFrame:
    df = load_city_healthcare_df(city_id).copy().reset_index(drop=True)
    df["facility_id"] = (
        df["facility_id"]
        if "facility_id" in df.columns
        else df.index.to_series(index=df.index).map(lambda idx: f"facility-{idx}")
    )
    df["name"] = _first_text_series(df, ["name"], "Healthcare facility")
    df["latitude"] = pd.to_numeric(df["latitude"], errors="coerce")
    df["longitude"] = pd.to_numeric(df["longitude"], errors="coerce")
    df["commune_name"] = _first_text_series(df, ["commune", "commune_name", "district", "district_name", "name"], "Commune")
    df["district_name"] = _first_text_series(df, ["district", "district_name", "commune_name"], "District")
    df["commune_id"] = df.apply(
        lambda r: _slug(f"{_clean_text(r.get('district_name')) or 'district'}_{_clean_text(r.get('commune_name')) or 'commune'}"),
        axis=1,
    )
    return df[["facility_id", "name", "latitude", "longitude", "commune_id", "commune_name", "district_name"]].dropna(
        subset=["latitude", "longitude"]
    )


def _processed_candidate_paths(city_id: str, suffix: str) -> list[Path]:
    city_cfg = load_city_config(city_id)
    paths = get_city_paths(city_id)
    repo_root = paths.processed_casablanca_districts_gpkg.parents[2]
    processed_dir = repo_root / "data" / "processed"
    tokens = {
        city_id,
        str(city_cfg.get("display_name", city_id)).replace(" ", "_"),
        str(city_cfg.get("display_name", city_id)).replace(" ", ""),
        str(city_cfg.get("display_name", city_id)).title().replace(" ", "_"),
        city_id.title(),
    }
    return [processed_dir / f"{token}_{suffix}" for token in tokens]


def _first_existing_path(paths: list[Path]) -> Path:
    for path in paths:
        if path.exists():
            return path
    return paths[0]


def _parse_line_tokens(value: Any) -> set[str]:
    if value is None:
        return set()
    if isinstance(value, list):
        raw_items = value
    else:
        text = str(value).strip()
        if not text:
            return set()
        try:
            parsed = ast.literal_eval(text)
            raw_items = parsed if isinstance(parsed, list) else [parsed]
        except (ValueError, SyntaxError):
            raw_items = [chunk.strip() for chunk in text.split(",")]
    return {re.sub(r"[^a-z0-9]", "", str(item).lower()) for item in raw_items if str(item).strip()}


def _route_aliases(route_id: str) -> set[str]:
    route_text = str(route_id).strip().lower()
    aliases = {re.sub(r"[^a-z0-9]", "", route_text)}
    match = re.search(r"(\d+)$", route_text)
    if match:
        digits = match.group(1)
        aliases.add(f"l{digits.zfill(3)}")
        aliases.add(f"l{int(digits)}")
    return aliases


def _euclidean_m(x1: float, y1: float, x2: np.ndarray, y2: np.ndarray) -> np.ndarray:
    return np.sqrt((x2 - float(x1)) ** 2 + (y2 - float(y1)) ** 2)


def _haversine_m(lat1: float, lon1: float, lat2: np.ndarray, lon2: np.ndarray) -> np.ndarray:
    lat1r = np.radians(float(lat1))
    lon1r = np.radians(float(lon1))
    lat2r = np.radians(lat2)
    lon2r = np.radians(lon2)
    dlat = lat2r - lat1r
    dlon = lon2r - lon1r
    a = np.sin(dlat / 2.0) ** 2 + np.cos(lat1r) * np.cos(lat2r) * np.sin(dlon / 2.0) ** 2
    return 6_371_000.0 * (2.0 * np.arcsin(np.sqrt(np.clip(a, 0.0, 1.0))))


@lru_cache(maxsize=8)
def load_route_geometries_geojson(city_id: str) -> dict[str, Any]:
    vertices_path = _first_existing_path(_processed_candidate_paths(city_id, "Transport_Route_Vertices.csv"))
    if not vertices_path.exists():
        return {"type": "FeatureCollection", "features": []}

    df = pd.read_csv(vertices_path)
    df = _safe_numeric(df, ["x", "y", "vertex_order"])
    features: list[dict[str, Any]] = []
    for route_id, group in df.groupby("route_id", dropna=True):
        ordered = group.sort_values("vertex_order")
        coords = ordered[["x", "y"]].dropna().to_numpy(dtype=float)
        if coords.shape[0] < 2:
            continue
        features.append(
            {
                "type": "Feature",
                "properties": {
                    "route_id": str(route_id),
                    "source": str(ordered["source"].iloc[0]) if "source" in ordered.columns else "",
                },
                "geometry": {"type": "LineString", "coordinates": coords.tolist()},
            }
        )
    return {"type": "FeatureCollection", "features": features}


@lru_cache(maxsize=8)
def _load_stop_graph_lengths(city_id: str) -> tuple[pd.DataFrame, dict[str, list[tuple[str, float]]]]:
    city_stops = load_city_transport_stops_df(city_id).copy().reset_index(drop=True)
    city_stops = _safe_numeric(city_stops, ["cluster_id", "latitude", "longitude"])
    city_stops["stop_id"] = city_stops["cluster_id"].astype("Int64").astype(str)
    city_stops["stop_name"] = _first_text_series(city_stops, ["stop_name"], "Transport stop")

    route_stops_path = _first_existing_path(_processed_candidate_paths(city_id, "Transport_Route_Stops.csv"))
    vertices_path = _first_existing_path(_processed_candidate_paths(city_id, "Transport_Route_Vertices.csv"))
    if not route_stops_path.exists() or not vertices_path.exists():
        stop_df = city_stops[["stop_id", "cluster_id", "stop_name", "latitude", "longitude"]].copy()
        stop_df["x"] = np.nan
        stop_df["y"] = np.nan
        return stop_df, {str(row.stop_id): [] for row in stop_df.itertuples()}

    route_stops = pd.read_csv(route_stops_path)
    route_stops = _safe_numeric(route_stops, ["cluster_id", "latitude", "longitude", "x", "y"])
    route_stops["stop_id"] = route_stops["cluster_id"].astype("Int64").astype(str)
    route_stops["line_tokens"] = route_stops["Lines"].apply(_parse_line_tokens)

    stop_df = city_stops.merge(
        route_stops[["stop_id", "x", "y"]].drop_duplicates("stop_id"),
        on="stop_id",
        how="left",
    )
    stop_df["x"] = pd.to_numeric(stop_df["x"], errors="coerce")
    stop_df["y"] = pd.to_numeric(stop_df["y"], errors="coerce")

    vertices = pd.read_csv(vertices_path)
    vertices = _safe_numeric(vertices, ["vertex_order", "x", "y"])
    edge_lengths: dict[tuple[str, str], float] = {}

    for route_id, group in vertices.groupby("route_id", dropna=True):
        ordered = group.sort_values("vertex_order")
        if len(ordered) < 2:
            continue
        xs = ordered["x"].to_numpy(dtype=float)
        ys = ordered["y"].to_numpy(dtype=float)
        segment_lengths = np.sqrt(np.diff(xs) ** 2 + np.diff(ys) ** 2)
        cumulative = np.concatenate([[0.0], np.cumsum(segment_lengths)])
        aliases = _route_aliases(str(route_id))

        candidate_stops = route_stops[route_stops["line_tokens"].apply(lambda tokens: bool(tokens & aliases))].copy()
        candidate_stops = candidate_stops.dropna(subset=["x", "y"])
        if candidate_stops.empty:
            continue

        positions: list[tuple[str, float]] = []
        for row in candidate_stops.itertuples():
            distances = _euclidean_m(float(row.x), float(row.y), xs, ys)
            nearest_idx = int(np.argmin(distances))
            positions.append((str(row.stop_id), float(cumulative[nearest_idx])))

        if not positions:
            continue
        ordered_positions = (
            pd.DataFrame(positions, columns=["stop_id", "position_m"])
            .groupby("stop_id", as_index=False)["position_m"]
            .min()
            .sort_values("position_m")
        )

        prev_stop: str | None = None
        prev_pos: float | None = None
        for row in ordered_positions.itertuples():
            current_stop = str(row.stop_id)
            current_pos = float(row.position_m)
            if prev_stop is not None and current_stop != prev_stop:
                distance_m = max(10.0, abs(current_pos - float(prev_pos)))
                key = tuple(sorted((prev_stop, current_stop)))
                existing = edge_lengths.get(key)
                edge_lengths[key] = distance_m if existing is None else min(existing, distance_m)
            prev_stop = current_stop
            prev_pos = current_pos

    adjacency: dict[str, list[tuple[str, float]]] = {str(stop_id): [] for stop_id in stop_df["stop_id"].astype(str).tolist()}
    for (a, b), distance_m in edge_lengths.items():
        adjacency.setdefault(a, []).append((b, float(distance_m)))
        adjacency.setdefault(b, []).append((a, float(distance_m)))

    return stop_df[["stop_id", "cluster_id", "stop_name", "latitude", "longitude", "x", "y"]].copy(), adjacency


def load_transport_network(city_id: str, transport_speed_kmh: float = DEFAULT_TRANSPORT_SPEED_KMH) -> tuple[pd.DataFrame, dict[str, list[tuple[str, float]]]]:
    stop_df, adjacency_lengths = _load_stop_graph_lengths(city_id)
    speed_m_per_min = max(float(transport_speed_kmh), 1.0) * 1000.0 / 60.0
    adjacency_time: dict[str, list[tuple[str, float]]] = {}
    for node, edges in adjacency_lengths.items():
        adjacency_time[node] = [(target, float(distance_m) / speed_m_per_min) for target, distance_m in edges]
    return stop_df.copy(), adjacency_time


def _candidate_stop_links(
    latitude: float,
    longitude: float,
    stop_df: pd.DataFrame,
    *,
    walking_speed_mps: float,
    limit: int = DEFAULT_K_NEAREST_STOPS,
    max_distance_m: float = DEFAULT_MAX_CONNECTOR_WALK_M,
) -> list[tuple[str, float, float]]:
    if stop_df.empty:
        return []
    latitudes = pd.to_numeric(stop_df["latitude"], errors="coerce").to_numpy(dtype=float)
    longitudes = pd.to_numeric(stop_df["longitude"], errors="coerce").to_numpy(dtype=float)
    distances = _haversine_m(latitude, longitude, latitudes, longitudes)
    order = np.argsort(distances)
    speed = max(float(walking_speed_mps), 0.1)
    candidates: list[tuple[str, float, float]] = []
    for idx in order:
        dist_m = float(distances[idx])
        if not math.isfinite(dist_m) or dist_m > float(max_distance_m):
            continue
        candidates.append((str(stop_df.iloc[idx]["stop_id"]), dist_m / speed / 60.0, dist_m))
        if len(candidates) >= max(1, int(limit)):
            break
    return candidates


def _seed_facility_dijkstra(
    stop_df: pd.DataFrame,
    adjacency: dict[str, list[tuple[str, float]]],
    facilities_df: pd.DataFrame,
    *,
    walking_speed_mps: float,
    connector_limit: int,
    max_connector_walk_m: float,
) -> tuple[dict[str, float], dict[str, str], dict[str, str]]:
    distances: dict[str, float] = {str(stop_id): math.inf for stop_id in stop_df["stop_id"].astype(str).tolist()}
    nearest_facility_id: dict[str, str] = {}
    nearest_facility_name: dict[str, str] = {}
    heap: list[tuple[float, str, str, str]] = []

    for row in facilities_df.itertuples():
        links = _candidate_stop_links(
            float(row.latitude),
            float(row.longitude),
            stop_df,
            walking_speed_mps=walking_speed_mps,
            limit=connector_limit,
            max_distance_m=max_connector_walk_m,
        )
        for stop_id, walk_time_min, _distance_m in links:
            if walk_time_min < distances.get(stop_id, math.inf):
                distances[stop_id] = walk_time_min
                facility_id = str(row.facility_id)
                facility_name = str(row.name)
                nearest_facility_id[stop_id] = facility_id
                nearest_facility_name[stop_id] = facility_name
                heapq.heappush(heap, (walk_time_min, stop_id, facility_id, facility_name))

    while heap:
        current_cost, node, facility_id, facility_name = heapq.heappop(heap)
        if current_cost > distances.get(node, math.inf) + 1e-9:
            continue
        for neighbor, edge_cost in adjacency.get(node, []):
            next_cost = current_cost + float(edge_cost)
            if next_cost + 1e-9 < distances.get(neighbor, math.inf):
                distances[neighbor] = next_cost
                nearest_facility_id[neighbor] = facility_id
                nearest_facility_name[neighbor] = facility_name
                heapq.heappush(heap, (next_cost, neighbor, facility_id, facility_name))

    return distances, nearest_facility_id, nearest_facility_name


def _scenario_location_rows(scenario: dict[str, Any], key: str) -> list[dict[str, float]]:
    rows = scenario.get(key) or []
    if not isinstance(rows, list):
        raise ValueError(f"{key} must be a list of location objects")
    out: list[dict[str, float]] = []
    for idx, row in enumerate(rows):
        if not isinstance(row, dict):
            raise ValueError(f"{key}[{idx}] must be an object")
        try:
            lat = float(row["latitude"])
            lon = float(row["longitude"])
        except Exception as exc:
            raise ValueError(f"{key}[{idx}] must include numeric latitude and longitude") from exc
        if not (-90.0 <= lat <= 90.0 and -180.0 <= lon <= 180.0):
            raise ValueError(f"{key}[{idx}] has out-of-range latitude/longitude")
        out.append({"latitude": lat, "longitude": lon})
    return out


def _scenario_parameters(city_cfg: dict[str, Any], scenario: dict[str, Any]) -> dict[str, float | int]:
    defaults = {}
    simulation_cfg = city_cfg.get("simulation") if isinstance(city_cfg.get("simulation"), dict) else {}
    if isinstance(simulation_cfg.get("default_parameters"), dict):
        defaults = simulation_cfg["default_parameters"]

    walking_speed_mps = float(scenario.get("walking_speed_mps") or defaults.get("walking_speed_mps") or DEFAULT_WALKING_SPEED_MPS)
    walking_speed_kmh = float(scenario.get("walking_speed_kmh") or defaults.get("walking_speed_kmh") or (walking_speed_mps * 3.6))
    if scenario.get("walking_speed_mps") is None and scenario.get("walking_speed_kmh") is not None:
        walking_speed_mps = max(walking_speed_kmh, 0.1) / 3.6
    waiting_time_min = float(scenario.get("waiting_time_min") or defaults.get("waiting_time_min") or DEFAULT_WAIT_TIME_MIN)
    transport_speed_kmh = float(scenario.get("transport_speed_kmh") or defaults.get("transport_speed_kmh") or DEFAULT_TRANSPORT_SPEED_KMH)
    k_nearest_stops = int(scenario.get("k_nearest_stops") or defaults.get("k_nearest_stops") or DEFAULT_K_NEAREST_STOPS)
    connector_limit = int(
        scenario.get("facility_stop_connector_limit")
        or defaults.get("facility_stop_connector_limit")
        or defaults.get("facility_stop_connectors")
        or DEFAULT_STOP_CONNECTORS
    )
    max_origin_stop_walk_m = float(
        scenario.get("max_origin_stop_walk_m")
        or defaults.get("max_origin_stop_walk_m")
        or DEFAULT_MAX_CONNECTOR_WALK_M
    )
    max_travel_time_min = float(scenario.get("max_travel_time_min") or defaults.get("max_travel_time_min") or DEFAULT_ACCESS_MAX_MIN)

    return {
        "walking_speed_mps": max(walking_speed_mps, 0.1),
        "walking_speed_kmh": max(walking_speed_kmh, 0.1),
        "waiting_time_min": max(waiting_time_min, 0.0),
        "transport_speed_kmh": max(transport_speed_kmh, 1.0),
        "k_nearest_stops": max(k_nearest_stops, 1),
        "facility_stop_connector_limit": max(connector_limit, 1),
        "max_origin_stop_walk_m": max(max_origin_stop_walk_m, 100.0),
        "max_travel_time_min": max(max_travel_time_min, 1.0),
    }


def simulate_origin_accessibility(
    city_id: str,
    scenario: dict[str, Any],
    baseline_df: pd.DataFrame | None = None,
) -> tuple[pd.DataFrame, dict[str, list[dict[str, float | str]]], dict[str, Any]]:
    city_cfg = load_city_config(city_id)
    baseline = load_city_origin_baseline(city_id) if baseline_df is None else baseline_df.copy().reset_index(drop=True)
    if baseline.empty:
        raise ValueError(f"Origin-level demand data is required for city '{city_id}'")

    params = _scenario_parameters(city_cfg, scenario)

    scenario_stop_rows = _scenario_location_rows(scenario, "transport_stop_locations")
    scenario_facility_rows = _scenario_location_rows(scenario, "facility_locations")

    stop_df, adjacency = load_transport_network(city_id, transport_speed_kmh=float(params["transport_speed_kmh"]))

    if scenario_stop_rows:
        scenario_stops: list[dict[str, Any]] = []
        for idx, row in enumerate(scenario_stop_rows):
            lat = float(row["latitude"])
            lon = float(row["longitude"])
            stop_id = f"scenario-stop-{idx + 1}"
            scenario_stops.append(
                {
                    "stop_id": stop_id,
                    "cluster_id": None,
                    "stop_name": f"Scenario stop {idx + 1}",
                    "latitude": lat,
                    "longitude": lon,
                    "x": np.nan,
                    "y": np.nan,
                }
            )
            links = _candidate_stop_links(
                lat,
                lon,
                stop_df,
                walking_speed_mps=float(params["walking_speed_mps"]),
                limit=int(params["facility_stop_connector_limit"]),
                max_distance_m=float(params["max_origin_stop_walk_m"]),
            )
            adjacency.setdefault(stop_id, [])
            for existing_stop_id, _walk_time_min, dist_m in links:
                travel_time_min = dist_m / (float(params["transport_speed_kmh"]) * 1000.0 / 60.0)
                adjacency[stop_id].append((existing_stop_id, float(travel_time_min)))
                adjacency.setdefault(existing_stop_id, []).append((stop_id, float(travel_time_min)))

        stop_df = pd.concat([stop_df, pd.DataFrame(scenario_stops)], ignore_index=True)

    facilities_df = load_city_facilities(city_id)
    if scenario_facility_rows:
        appended = []
        for idx, row in enumerate(scenario_facility_rows):
            appended.append(
                {
                    "facility_id": f"scenario_facility_{idx + 1}",
                    "name": f"Scenario facility {idx + 1}",
                    "latitude": float(row["latitude"]),
                    "longitude": float(row["longitude"]),
                    "commune_id": None,
                    "commune_name": None,
                    "district_name": None,
                }
            )
        facilities_df = pd.concat([facilities_df, pd.DataFrame(appended)], ignore_index=True)

    stop_costs, nearest_facility_by_stop, nearest_facility_name_by_stop = _seed_facility_dijkstra(
        stop_df,
        adjacency,
        facilities_df,
        walking_speed_mps=float(params["walking_speed_mps"]),
        connector_limit=int(params["facility_stop_connector_limit"]),
        max_connector_walk_m=float(params["max_origin_stop_walk_m"]),
    )

    simulated = baseline.copy().reset_index(drop=True)
    simulated["baseline_accessibility_score"] = pd.to_numeric(simulated.get("accessibility_score"), errors="coerce")
    if simulated["baseline_accessibility_score"].max(skipna=True) <= 1.5:
        simulated["baseline_accessibility_score"] = simulated["baseline_accessibility_score"] * 100.0

    for candidate in ["total_travel_time_min", "nearest_healthcare_travel_time_min", "travel_time_min"]:
        if candidate in simulated.columns:
            simulated[candidate] = pd.to_numeric(simulated[candidate], errors="coerce")
    if "total_travel_time_min" in simulated.columns:
        existing_travel = pd.to_numeric(simulated["total_travel_time_min"], errors="coerce")
    elif "nearest_healthcare_travel_time_min" in simulated.columns:
        existing_travel = pd.to_numeric(simulated["nearest_healthcare_travel_time_min"], errors="coerce")
    elif "travel_time_min" in simulated.columns:
        existing_travel = pd.to_numeric(simulated["travel_time_min"], errors="coerce")
    else:
        existing_travel = pd.Series(np.nan, index=simulated.index, dtype=float)

    if existing_travel.isna().all() and simulated["baseline_accessibility_score"].notna().any():
        logger.warning(
            "No baseline travel-time column was found for %s; deriving fallback travel time from accessibility_score as a last resort.",
            city_id,
        )
        existing_travel = travel_time_from_accessibility_score(simulated["baseline_accessibility_score"], float(params["max_travel_time_min"]))

    simulated["before_total_travel_time_min"] = existing_travel
    simulated["before_accessibility_score"] = simulated["baseline_accessibility_score"]

    new_times: list[float] = []
    new_scores: list[float] = []
    nearest_facility_ids: list[str | None] = []
    nearest_facility_names: list[str | None] = []
    nearest_stop_ids: list[str | None] = []
    reachable_30: list[bool] = []
    reachable_60: list[bool] = []

    for row in simulated.itertuples():
        links = _candidate_stop_links(
            float(row.latitude),
            float(row.longitude),
            stop_df,
            walking_speed_mps=float(params["walking_speed_mps"]),
            limit=int(params["k_nearest_stops"]),
            max_distance_m=float(params["max_origin_stop_walk_m"]),
        )
        best_total = math.inf
        best_facility_id: str | None = _clean_text(getattr(row, "nearest_facility_id", None))
        best_facility_name: str | None = None
        best_stop_id: str | None = _clean_text(getattr(row, "nearest_stop_id", None))
        best_stop_distance_m = math.nan

        for stop_id, walk_time_min, distance_m in links:
            stop_cost = stop_costs.get(stop_id, math.inf)
            if not math.isfinite(stop_cost):
                continue
            total = float(walk_time_min) + float(params["waiting_time_min"]) + float(stop_cost)
            if total < best_total:
                best_total = total
                best_facility_id = nearest_facility_by_stop.get(stop_id, best_facility_id)
                best_facility_name = nearest_facility_name_by_stop.get(stop_id, best_facility_name)
                best_stop_id = stop_id
                best_stop_distance_m = distance_m

        if not math.isfinite(best_total):
            fallback_time = float(existing_travel.iloc[row.Index]) if row.Index < len(existing_travel) else math.nan
            best_total = fallback_time

        new_times.append(best_total)
        score_value = accessibility_score_from_travel_time([best_total], float(params["max_travel_time_min"]))
        new_scores.append(float(score_value.fillna(0.0).iloc[0]))
        nearest_facility_ids.append(best_facility_id)
        nearest_facility_names.append(best_facility_name)
        nearest_stop_ids.append(best_stop_id)
        reachable_30.append(bool(math.isfinite(best_total) and best_total <= DEFAULT_COVERAGE_THRESHOLDS[0]))
        reachable_60.append(bool(math.isfinite(best_total) and best_total <= DEFAULT_COVERAGE_THRESHOLDS[1]))

        if math.isfinite(best_stop_distance_m):
            simulated.at[row.Index, "distance_to_nearest_stop_m"] = best_stop_distance_m
            simulated.at[row.Index, "walk_time_to_stop_min"] = best_stop_distance_m / max(float(params["walking_speed_mps"]), 0.1) / 60.0

    simulated["total_travel_time_min"] = pd.to_numeric(pd.Series(new_times), errors="coerce")
    simulated["travel_time_min"] = simulated["total_travel_time_min"]
    simulated["nearest_healthcare_travel_time_min"] = simulated["total_travel_time_min"]
    simulated["accessibility_score"] = pd.to_numeric(pd.Series(new_scores), errors="coerce").fillna(0.0).clip(lower=0.0, upper=100.0)
    simulated["normalized_accessibility_score"] = simulated["accessibility_score"] / 100.0
    simulated["score_2sfca"] = simulated["accessibility_score"]
    simulated["nearest_facility_id"] = nearest_facility_ids
    simulated["nearest_facility_name"] = nearest_facility_names
    simulated["nearest_stop_id"] = nearest_stop_ids
    simulated["wait_time_min"] = float(params["waiting_time_min"])
    simulated["reachable_30"] = reachable_30
    simulated["reachable_60"] = reachable_60
    simulated["analysis_unit"] = "origin"

    scenario_entities = {
        "added_facilities": [{"latitude": float(item["latitude"]), "longitude": float(item["longitude"]), "source": "user"} for item in scenario_facility_rows],
        "added_transport_stops": [{"latitude": float(item["latitude"]), "longitude": float(item["longitude"]), "source": "user"} for item in scenario_stop_rows],
        "auto_placed_facilities": [],
    }
    context = {
        "routes": load_route_geometries_geojson(city_id),
        "facility_lookup": {
            str(row.facility_id): {
                "facility_id": str(row.facility_id),
                "name": str(row.name),
                "latitude": float(row.latitude),
                "longitude": float(row.longitude),
                "commune_id": row.commune_id,
                "commune_name": row.commune_name,
                "district_name": row.district_name,
            }
            for row in facilities_df.itertuples()
        },
        "facilities": facilities_df.to_dict(orient="records"),
        "parameters": params,
    }
    return simulated, scenario_entities, context
