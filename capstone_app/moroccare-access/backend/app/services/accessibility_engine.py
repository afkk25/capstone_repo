from __future__ import annotations

import logging
from typing import Any

import networkx as nx
import numpy as np
import pandas as pd

from app.core.config import get_defaults
from app.core.schemas import GraphArtifacts
from app.services.preprocessors import to_metric

logger = logging.getLogger("moroccare")

try:
    from sklearn.neighbors import BallTree
except Exception:  # pragma: no cover
    BallTree = None


INF_TIME = 1e9


def _k_nearest(points_a: np.ndarray, points_b: np.ndarray, k: int) -> tuple[np.ndarray, np.ndarray]:
    if len(points_b) == 0:
        return np.empty((len(points_a), 0), dtype=int), np.empty((len(points_a), 0), dtype=float)
    k = max(1, min(k, len(points_b)))
    if BallTree is not None:
        tree = BallTree(points_b, metric="euclidean")
        d, idx = tree.query(points_a, k=k)
        return idx, d
    idxs, dists = [], []
    for p in points_a:
        ds = np.sqrt(((points_b - p) ** 2).sum(axis=1))
        order = np.argsort(ds)[:k]
        idxs.append(order)
        dists.append(ds[order])
    return np.array(idxs), np.array(dists)


def _walk_minutes(distance_m: float, walking_speed_kmh: float) -> float:
    return float(distance_m / (max(walking_speed_kmh, 0.1) * 1000.0 / 60.0))


def _precompute_stop_facility_times(art: GraphArtifacts) -> pd.DataFrame:
    G = art.graph
    stop_node_values = list(art.stop_nodes.values())
    stop_rows = []

    per_facility_lengths: dict[str, dict[str, float]] = {}
    for fid, fnode in art.facility_nodes.items():
        per_facility_lengths[fid] = nx.single_source_dijkstra_path_length(G, fnode, weight="weight")

    for stop_key, stop_node in art.stop_nodes.items():
        best = INF_TIME
        nearest_fid = None
        cnt30 = 0
        cnt60 = 0
        for fid, lengths in per_facility_lengths.items():
            t = lengths.get(stop_node)
            if t is None:
                continue
            if t < best:
                best = float(t)
                nearest_fid = fid
            if t <= 30:
                cnt30 += 1
            if t <= 60:
                cnt60 += 1
        stop_rows.append(
            {
                "stop_key": str(stop_key),
                "network_time_min": None if best >= INF_TIME else float(best),
                "nearest_facility_id": nearest_fid,
                "num_facilities_reachable_30min": int(cnt30),
                "num_facilities_reachable_60min": int(cnt60),
            }
        )
    return pd.DataFrame(stop_rows)


def compute_origin_accessibility(bundle: Any, art: GraphArtifacts, params: dict | None = None) -> pd.DataFrame:
    defaults = get_defaults()
    params = params or {}
    walking_speed_kmh = float(params.get("walking_speed_kmh", defaults.walking_speed_kmh))
    wait_time_min = float(params.get("wait_time_min", defaults.wait_time_min))
    k_nearest = int(params.get("k_nearest_origin_stops", defaults.k_nearest_origin_stops))
    score_threshold = float(params.get("score_threshold_min", defaults.score_threshold_min))

    origins = to_metric(bundle.origins)
    stops = to_metric(bundle.stops)

    stop_stats = _precompute_stop_facility_times(art)
    stop_stats = stop_stats.set_index("stop_key")

    stop_points = stops[["x", "y"]].to_numpy(dtype=float)
    origin_points = origins[["x", "y"]].to_numpy(dtype=float)
    idx, dist = _k_nearest(origin_points, stop_points, k=k_nearest)

    rows = []
    for oi, origin in enumerate(origins.itertuples()):
        best_total = INF_TIME
        best_stop = None
        best_facility = None
        count30 = 0
        count60 = 0

        for j in range(idx.shape[1]):
            stop_idx = int(idx[oi][j])
            stop_key = str(stops.iloc[stop_idx]["stop_key"])
            if stop_key not in stop_stats.index:
                continue
            net = stop_stats.loc[stop_key]["network_time_min"]
            if pd.isna(net):
                continue
            walk = _walk_minutes(float(dist[oi][j]), walking_speed_kmh)
            total = float(walk + wait_time_min + float(net))
            if total < best_total:
                best_total = total
                best_stop = stop_key
                best_facility = stop_stats.loc[stop_key]["nearest_facility_id"]
            count30 = max(count30, int(stop_stats.loc[stop_key]["num_facilities_reachable_30min"]))
            count60 = max(count60, int(stop_stats.loc[stop_key]["num_facilities_reachable_60min"]))

        unreachable = best_total >= INF_TIME
        if unreachable:
            accessibility_score = 0.0
            total_min = None
        else:
            total_min = float(best_total)
            accessibility_score = float(100.0 * (1.0 - min(total_min / max(score_threshold, 1.0), 1.0)))

        rows.append(
            {
                "origin_id": str(origin.origin_id),
                "x": float(origin.x),
                "y": float(origin.y),
                "population": float(getattr(origin, "population", 0) or 0),
                "district_id": getattr(origin, "district_id", None),
                "district_name": getattr(origin, "district_name", None),
                "chosen_stop_key": best_stop,
                "walk_dist_to_stop_m": None if best_stop is None else float(dist[oi][0]),
                "walk_time_to_stop_min": None if best_stop is None else _walk_minutes(float(dist[oi][0]), walking_speed_kmh),
                "nearest_facility_id": best_facility,
                "total_travel_time_min": total_min,
                "accessibility_score": accessibility_score,
                "num_facilities_reachable_30min": count30,
                "num_facilities_reachable_60min": count60,
                "is_unreachable": bool(unreachable),
            }
        )

    result = pd.DataFrame(rows)
    logger.info("Computed origin accessibility for %s origins", len(result))
    return result


def approximate_accessibility_without_graph(bundle: Any, params: dict | None = None) -> tuple[pd.DataFrame, list[str]]:
    defaults = get_defaults()
    params = params or {}
    walking_speed_kmh = float(params.get("walking_speed_kmh", defaults.walking_speed_kmh))
    score_threshold = float(params.get("score_threshold_min", defaults.score_threshold_min))

    origins = to_metric(bundle.origins)
    facilities = to_metric(bundle.facilities)

    fp = facilities[["x", "y"]].to_numpy(dtype=float)
    op = origins[["x", "y"]].to_numpy(dtype=float)

    warnings = ["Simulation used approximate Euclidean fallback because graph inputs were unavailable."]
    rows = []
    for i, origin in enumerate(origins.itertuples()):
        d = np.sqrt(((fp - op[i]) ** 2).sum(axis=1)) if len(fp) else np.array([INF_TIME])
        idx = int(np.argmin(d)) if len(d) else 0
        dist = float(d[idx])
        travel = _walk_minutes(dist, walking_speed_kmh)
        score = float(100.0 * (1.0 - min(travel / max(score_threshold, 1.0), 1.0)))
        rows.append(
            {
                "origin_id": str(origin.origin_id),
                "population": float(getattr(origin, "population", 0) or 0),
                "district_id": getattr(origin, "district_id", None),
                "district_name": getattr(origin, "district_name", None),
                "nearest_facility_id": str(facilities.iloc[idx]["facility_id"]) if len(facilities) else None,
                "total_travel_time_min": travel,
                "accessibility_score": score,
                "is_unreachable": False,
                "num_facilities_reachable_30min": int((d <= walking_speed_kmh * 500).sum()) if len(d) else 0,
                "num_facilities_reachable_60min": int((d <= walking_speed_kmh * 1000).sum()) if len(d) else 0,
            }
        )
    return pd.DataFrame(rows), warnings
