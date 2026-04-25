from __future__ import annotations

import ast
import heapq
import math
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

import geopandas as gpd
import numpy as np
import pandas as pd

from core.config import city_dir, load_city_config
from services.notebook_bridge.loaders import (
    CityDataNotFoundError,
    get_city_paths,
    load_city_healthcare_df,
    load_city_transport_stops_df,
    load_notebook_origin_metrics,
)

DEFAULT_ACCESS_MAX_MIN = 60.0
DEFAULT_WALKING_SPEED_MPS = 1.0
DEFAULT_WAIT_TIME_MIN = 10.0
DEFAULT_TRANSPORT_SPEED_KMH = 20.0
DEFAULT_K_NEAREST_STOPS = 3
DEFAULT_STOP_CONNECTORS = 2
DEFAULT_MAX_CONNECTOR_WALK_M = 1_500.0


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


def _first_text_series(df: pd.DataFrame, candidates: list[str], fallback_prefix: str) -> pd.Series:
    for col in candidates:
        if col in df.columns:
            raw = df[col].astype(str).str.strip()
            valid = raw.where(~raw.str.lower().isin({"", "nan", "none", "null"}), None)
            fallback = pd.Series([f"{fallback_prefix} {idx + 1}" for idx in range(len(df))], index=df.index, dtype="object")
            return valid.fillna(fallback).astype(str)
    return pd.Series([f"{fallback_prefix} {idx + 1}" for idx in range(len(df))], index=df.index, dtype="object")


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
    travel = pd.Series(travel_time_min, dtype=float)
    max_minutes = max(float(max_travel_time_min), 1.0)
    return (1.0 - (travel.clip(lower=0.0) / max_minutes)).clip(lower=0.0, upper=1.0)


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
            "total_travel_time_min",
            "nearest_healthcare_travel_time_min",
            "accessibility_score",
            "accessibility_2sfca",
            "score_2sfca",
            "num_facilities_reachable_30min",
            "num_facilities_reachable_60min",
        ],
    )

    frame["origin_id"] = _first_text_series(frame, ["origin_id", "id"], "origin")
    frame["origin_name"] = _first_text_series(frame, ["origin_name", "origin_id"], "Origin")
    frame["district_name"] = _first_text_series(frame, ["district_name", "district", "commune"], "Area")
    frame["district_id"] = _first_numeric_series(frame, ["district_id"], default=np.nan)
    frame["population"] = _first_numeric_series(frame, ["population", "population_worldpop", "pop_mean_pixel"], default=0.0).fillna(0.0).clip(lower=0.0)
    frame["population_density"] = _first_numeric_series(frame, ["population_density", "pop_density_km2"], default=np.nan)
    frame["distance_to_nearest_stop_m"] = _first_numeric_series(frame, ["nearest_stop_dist_m", "walk_dist_to_stop_m"], default=np.nan)
    frame["nearest_stop_id"] = _first_text_series(frame, ["nearest_stop_id", "chosen_stop_key"], "stop")
    frame["walk_time_to_stop_min"] = _first_numeric_series(frame, ["walk_time_to_stop_min"], default=np.nan)
    frame["in_vehicle_time_min"] = _first_numeric_series(frame, ["in_vehicle_time_min"], default=np.nan)
    frame["wait_time_min"] = _first_numeric_series(frame, ["wait_time_min"], default=DEFAULT_WAIT_TIME_MIN).fillna(DEFAULT_WAIT_TIME_MIN)
    frame["travel_time_min"] = _first_numeric_series(frame, ["total_travel_time_min", "nearest_healthcare_travel_time_min"], default=np.nan)
    frame["nearest_facility_id"] = _first_text_series(frame, ["nearest_facility_id"], "facility")
    frame["score_2sfca"] = _first_numeric_series(frame, ["score_2sfca", "accessibility_2sfca"], default=np.nan)

    if "accessibility_score" in frame.columns and pd.to_numeric(frame["accessibility_score"], errors="coerce").notna().any():
        frame["accessibility_score"] = pd.to_numeric(frame["accessibility_score"], errors="coerce")
    else:
        frame["accessibility_score"] = accessibility_score_from_travel_time(frame["travel_time_min"], DEFAULT_ACCESS_MAX_MIN)

    frame["analysis_unit"] = "origin"
    return frame[
        [
            "origin_id",
            "origin_name",
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
            "travel_time_min",
            "accessibility_score",
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
        df.get("facility_id")
        if "facility_id" in df.columns
        else df.index.to_series(index=df.index).map(lambda idx: f"facility-{idx}")
    )
    df["name"] = _first_text_series(df, ["name"], "Healthcare facility")
    df["latitude"] = pd.to_numeric(df["latitude"], errors="coerce")
    df["longitude"] = pd.to_numeric(df["longitude"], errors="coerce")
    return df[["facility_id", "name", "latitude", "longitude"]].dropna(subset=["latitude", "longitude"]).copy()


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
                "properties": {"route_id": str(route_id), "source": str(ordered["source"].iloc[0]) if "source" in ordered.columns else ""},
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
        if not math.isfinite(dist_m):
            continue
        if dist_m > max_distance_m and len(candidates) >= limit:
            break
        candidates.append((str(stop_df.iloc[idx]["stop_id"]), dist_m / speed / 60.0, dist_m))
        if len(candidates) >= limit:
            break
    return candidates


def _seed_facility_dijkstra(
    stop_df: pd.DataFrame,
    adjacency: dict[str, list[tuple[str, float]]],
    facilities_df: pd.DataFrame,
    *,
    walking_speed_mps: float,
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
            limit=DEFAULT_STOP_CONNECTORS,
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


def simulate_origin_accessibility(city_id: str, scenario: dict[str, Any], baseline_df: pd.DataFrame | None = None) -> tuple[pd.DataFrame, dict[str, list[dict[str, float | str]]], dict[str, Any]]:
    city_cfg = load_city_config(city_id)
    baseline = load_city_origin_baseline(city_id) if baseline_df is None else baseline_df.copy().reset_index(drop=True)
    if baseline.empty:
        raise ValueError(f"Origin-level demand data is required for city '{city_id}'")

    walking_speed_mps = float(scenario.get("walking_speed_mps", DEFAULT_WALKING_SPEED_MPS) or DEFAULT_WALKING_SPEED_MPS)
    waiting_time_min = float(scenario.get("waiting_time_min", DEFAULT_WAIT_TIME_MIN) or DEFAULT_WAIT_TIME_MIN)
    transport_speed_kmh = float(scenario.get("transport_speed_kmh", DEFAULT_TRANSPORT_SPEED_KMH) or DEFAULT_TRANSPORT_SPEED_KMH)
    access_max_min = float(scenario.get("max_travel_time_min", DEFAULT_ACCESS_MAX_MIN) or DEFAULT_ACCESS_MAX_MIN)

    stop_df, adjacency = load_transport_network(city_id, transport_speed_kmh=transport_speed_kmh)
    scenario_stop_rows = scenario.get("transport_stop_locations") or []
    if not isinstance(scenario_stop_rows, list):
        raise ValueError("transport_stop_locations must be a list")
    if scenario_stop_rows:
        scenario_stops = []
        for idx, row in enumerate(scenario_stop_rows):
            lat = float(row["latitude"])
            lon = float(row["longitude"])
            stop_id = f"scenario-stop-{idx}"
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
                walking_speed_mps=walking_speed_mps,
                limit=DEFAULT_STOP_CONNECTORS,
                max_distance_m=2_000.0,
            )
            adjacency.setdefault(stop_id, [])
            for existing_stop_id, _walk_time_min, dist_m in links:
                travel_time_min = dist_m / max(transport_speed_kmh, 1.0) / 1000.0 * 60.0
                adjacency[stop_id].append((existing_stop_id, travel_time_min))
                adjacency.setdefault(existing_stop_id, []).append((stop_id, travel_time_min))
        stop_df = pd.concat([stop_df, pd.DataFrame(scenario_stops)], ignore_index=True)

    facilities_df = load_city_facilities(city_id)
    scenario_facility_rows = scenario.get("facility_locations") or []
    if not isinstance(scenario_facility_rows, list):
        raise ValueError("facility_locations must be a list")
    if scenario_facility_rows:
        appended = []
        start_idx = len(facilities_df)
        for idx, row in enumerate(scenario_facility_rows):
            appended.append(
                {
                    "facility_id": f"scenario-facility-{start_idx + idx}",
                    "name": f"Scenario facility {idx + 1}",
                    "latitude": float(row["latitude"]),
                    "longitude": float(row["longitude"]),
                }
            )
        facilities_df = pd.concat([facilities_df, pd.DataFrame(appended)], ignore_index=True)

    stop_costs, nearest_facility_by_stop, nearest_facility_name_by_stop = _seed_facility_dijkstra(
        stop_df,
        adjacency,
        facilities_df,
        walking_speed_mps=walking_speed_mps,
    )

    simulated = baseline.copy().reset_index(drop=True)
    simulated["baseline_score"] = pd.to_numeric(simulated["accessibility_score"], errors="coerce").fillna(0.0)
    if "travel_time_min" not in simulated.columns:
        simulated["travel_time_min"] = accessibility_score_from_travel_time(
            pd.to_numeric(simulated["accessibility_score"], errors="coerce").fillna(0.0),
            access_max_min,
        )
    else:
        simulated["travel_time_min"] = pd.to_numeric(simulated["travel_time_min"], errors="coerce")
    simulated["before_travel_time_min"] = pd.to_numeric(simulated["travel_time_min"], errors="coerce")
    if "nearest_stop_id" not in simulated.columns:
        simulated["nearest_stop_id"] = ""
    if "nearest_facility_id" not in simulated.columns:
        simulated["nearest_facility_id"] = ""
    if "wait_time_min" not in simulated.columns:
        simulated["wait_time_min"] = waiting_time_min
    new_times: list[float] = []
    new_scores: list[float] = []
    nearest_facility_ids: list[str] = []
    nearest_facility_names: list[str] = []
    nearest_stop_ids: list[str] = []

    for row in simulated.itertuples():
        links = _candidate_stop_links(
            float(row.latitude),
            float(row.longitude),
            stop_df,
            walking_speed_mps=walking_speed_mps,
            limit=DEFAULT_K_NEAREST_STOPS,
        )
        best_total = math.inf
        best_facility_id = str(getattr(row, "nearest_facility_id", ""))
        best_facility_name = ""
        best_stop_id = str(getattr(row, "nearest_stop_id", ""))
        best_stop_distance_m = math.nan
        for stop_id, walk_time_min, distance_m in links:
            stop_cost = stop_costs.get(stop_id, math.inf)
            if not math.isfinite(stop_cost):
                continue
            total = float(walk_time_min) + waiting_time_min + float(stop_cost)
            if total < best_total:
                best_total = total
                best_facility_id = nearest_facility_by_stop.get(stop_id, best_facility_id)
                best_facility_name = nearest_facility_name_by_stop.get(stop_id, best_facility_name)
                best_stop_id = stop_id
                best_stop_distance_m = distance_m

        if not math.isfinite(best_total):
            fallback_time = float(getattr(row, "travel_time_min", np.nan))
            best_total = fallback_time if math.isfinite(fallback_time) else access_max_min

        new_times.append(best_total)
        new_scores.append(float(accessibility_score_from_travel_time([best_total], access_max_min).iloc[0]))
        nearest_facility_ids.append(best_facility_id)
        nearest_facility_names.append(best_facility_name)
        nearest_stop_ids.append(best_stop_id)
        if math.isfinite(best_stop_distance_m):
            simulated.at[row.Index, "distance_to_nearest_stop_m"] = best_stop_distance_m
            simulated.at[row.Index, "walk_time_to_stop_min"] = best_stop_distance_m / max(walking_speed_mps, 0.1) / 60.0

    simulated["travel_time_min"] = new_times
    simulated["accessibility_score"] = new_scores
    simulated["score_2sfca"] = simulated["accessibility_score"]
    simulated["nearest_facility_id"] = nearest_facility_ids
    simulated["nearest_facility_name"] = nearest_facility_names
    simulated["nearest_stop_id"] = nearest_stop_ids
    simulated["wait_time_min"] = waiting_time_min
    simulated["analysis_unit"] = "origin"

    scenario_entities = {
        "added_facilities": [
            {"latitude": float(item["latitude"]), "longitude": float(item["longitude"]), "source": "user"} for item in scenario_facility_rows
        ],
        "added_transport_stops": [
            {"latitude": float(item["latitude"]), "longitude": float(item["longitude"]), "source": "user"} for item in scenario_stop_rows
        ],
        "auto_placed_facilities": [],
    }
    context = {
        "routes": load_route_geometries_geojson(city_id),
        "facility_lookup": {
            str(row.facility_id): {"facility_id": str(row.facility_id), "name": str(row.name), "latitude": float(row.latitude), "longitude": float(row.longitude)}
            for row in facilities_df.itertuples()
        },
    }
    return simulated, scenario_entities, context
