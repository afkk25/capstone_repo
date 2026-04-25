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


def _walk_minutes(distance_m: float, walking_speed_kmh: float) -> float:
    m_per_min = max(walking_speed_kmh, 0.1) * 1000.0 / 60.0
    return float(distance_m / m_per_min)


def _transit_minutes(distance_m: float, transit_speed_kmh: float) -> float:
    m_per_min = max(transit_speed_kmh, 0.1) * 1000.0 / 60.0
    return float(distance_m / m_per_min)


def _nearest_indices(points_a: np.ndarray, points_b: np.ndarray, k: int = 1) -> tuple[np.ndarray, np.ndarray]:
    if len(points_b) == 0:
        return np.array([], dtype=int), np.array([], dtype=float)
    if BallTree is not None:
        tree = BallTree(points_b, metric="euclidean")
        d, idx = tree.query(points_a, k=k)
        return idx, d
    idxs = []
    dists = []
    for p in points_a:
        ds = np.sqrt(((points_b - p) ** 2).sum(axis=1))
        order = np.argsort(ds)[:k]
        idxs.append(order)
        dists.append(ds[order])
    return np.array(idxs), np.array(dists)


def build_transport_graph(bundle: Any, params: dict | None = None) -> GraphArtifacts:
    defaults = get_defaults()
    params = params or {}
    walking_speed_kmh = float(params.get("walking_speed_kmh", defaults.walking_speed_kmh))
    transit_speed_kmh = float(params.get("transit_speed_kmh", defaults.transit_speed_kmh))
    transfer_radius_m = float(params.get("transfer_radius_m", defaults.transfer_radius_m))
    facility_stop_radius_m = float(params.get("facility_stop_radius_m", defaults.facility_stop_radius_m))

    if bundle.route_vertices is None or bundle.route_vertices.empty:
        raise ValueError("Route vertices are required for graph build")
    if bundle.stops is None or bundle.stops.empty:
        raise ValueError("Stops are required for graph build")
    if bundle.facilities is None or bundle.facilities.empty:
        raise ValueError("Facilities are required for graph build")

    rv = to_metric(bundle.route_vertices)
    stops = to_metric(bundle.stops)
    facilities = to_metric(bundle.facilities)

    G = nx.Graph()
    route_nodes: list[str] = []

    for route_id, grp in rv.sort_values(["route_id", "vertex_order"]).groupby("route_id"):
        rows = list(grp.itertuples())
        for row in rows:
            node = f"route_{route_id}_{int(row.vertex_order)}"
            route_nodes.append(node)
            G.add_node(node, kind="route", x=float(row.x), y=float(row.y))
        for a, b in zip(rows[:-1], rows[1:]):
            na = f"route_{route_id}_{int(a.vertex_order)}"
            nb = f"route_{route_id}_{int(b.vertex_order)}"
            dist = float(np.hypot(b.x - a.x, b.y - a.y))
            G.add_edge(na, nb, weight=_transit_minutes(dist, transit_speed_kmh), edge_kind="route")

    route_points = rv[["x", "y"]].to_numpy(dtype=float)
    route_node_names = [f"route_{r.route_id}_{int(r.vertex_order)}" for r in rv.itertuples()]

    stop_nodes: dict[str, str] = {}
    stop_points = stops[["x", "y"]].to_numpy(dtype=float)
    idx, dist = _nearest_indices(stop_points, route_points, k=1)
    for i, row in enumerate(stops.itertuples()):
        stop_key = str(row.stop_key)
        node = f"stop_{stop_key}"
        stop_nodes[stop_key] = node
        G.add_node(node, kind="stop", x=float(row.x), y=float(row.y), stop_key=stop_key)
        if len(route_points) > 0:
            route_node = route_node_names[int(idx[i][0])]
            walk_m = float(dist[i][0])
            G.add_edge(node, route_node, weight=_walk_minutes(walk_m, walking_speed_kmh), edge_kind="stop_route")

    if len(stop_points) > 0 and BallTree is not None:
        tree = BallTree(stop_points, metric="euclidean")
        neighbors = tree.query_radius(stop_points, r=transfer_radius_m)
        for i, arr in enumerate(neighbors):
            for j in arr:
                if int(j) <= i:
                    continue
                d = float(np.hypot(*(stop_points[int(j)] - stop_points[i])))
                if d <= transfer_radius_m:
                    a = stops.iloc[i]["stop_key"]
                    b = stops.iloc[int(j)]["stop_key"]
                    G.add_edge(f"stop_{a}", f"stop_{b}", weight=_walk_minutes(d, walking_speed_kmh), edge_kind="transfer")

    facility_nodes: dict[str, str] = {}
    for row in facilities.itertuples():
        fid = str(row.facility_id)
        fnode = f"facility_{fid}"
        facility_nodes[fid] = fnode
        G.add_node(fnode, kind="facility", x=float(row.x), y=float(row.y), facility_id=fid)

        if len(stop_points) == 0:
            continue
        d = np.sqrt(((stop_points - np.array([row.x, row.y])) ** 2).sum(axis=1))
        nearby = np.where(d <= facility_stop_radius_m)[0]
        connect = nearby if len(nearby) > 0 else np.array([int(np.argmin(d))])
        for idx_stop in connect:
            sk = str(stops.iloc[int(idx_stop)]["stop_key"])
            G.add_edge(fnode, f"stop_{sk}", weight=_walk_minutes(float(d[int(idx_stop)]), walking_speed_kmh), edge_kind="facility_stop")

    logger.info(
        "Graph built: nodes=%s edges=%s stops=%s facilities=%s routes=%s",
        G.number_of_nodes(),
        G.number_of_edges(),
        len(stop_nodes),
        len(facility_nodes),
        len(route_nodes),
    )

    return GraphArtifacts(
        graph=G,
        stop_nodes=stop_nodes,
        facility_nodes=facility_nodes,
        route_nodes=route_nodes,
        stop_points_metric=stops[["stop_key", "x", "y"]].copy(),
    )
