from typing import Any

import networkx as nx
import numpy as np
import pandas as pd
from pyproj import Transformer

from app.services.city_store import city_dir


MOROCCO_METRIC_CRS = "EPSG:32629"
WGS84_CRS = "EPSG:4326"

WALKING_SPEED_M_PER_MIN = 60
TRANSIT_SPEED_M_PER_MIN = 333
WAIT_TIME_MIN = 10
MAX_FACILITY_LINK_M = 1000
MAX_TRANSFER_LINK_M = 150


def looks_like_lonlat(x: pd.Series, y: pd.Series) -> bool:
    x_valid = pd.to_numeric(x, errors="coerce").dropna()
    y_valid = pd.to_numeric(y, errors="coerce").dropna()

    if x_valid.empty or y_valid.empty:
        return False

    return x_valid.between(-180, 180).all() and y_valid.between(-90, 90).all()


def add_metric_xy(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()

    if {"x_metric", "y_metric"}.issubset(out.columns):
        out["x_metric"] = pd.to_numeric(out["x_metric"], errors="coerce")
        out["y_metric"] = pd.to_numeric(out["y_metric"], errors="coerce")
        return out

    if {"x", "y"}.issubset(out.columns):
        x = pd.to_numeric(out["x"], errors="coerce")
        y = pd.to_numeric(out["y"], errors="coerce")

        if looks_like_lonlat(x, y):
            transformer = Transformer.from_crs(
                WGS84_CRS,
                MOROCCO_METRIC_CRS,
                always_xy=True,
            )
            x_metric, y_metric = transformer.transform(x.to_numpy(), y.to_numpy())
            out["x_metric"] = x_metric
            out["y_metric"] = y_metric
            out["longitude"] = x
            out["latitude"] = y
        else:
            out["x_metric"] = x
            out["y_metric"] = y

            transformer = Transformer.from_crs(
                MOROCCO_METRIC_CRS,
                WGS84_CRS,
                always_xy=True,
            )
            lon, lat = transformer.transform(x.to_numpy(), y.to_numpy())
            out["longitude"] = lon
            out["latitude"] = lat

        return out

    if {"longitude", "latitude"}.issubset(out.columns):
        lon = pd.to_numeric(out["longitude"], errors="coerce")
        lat = pd.to_numeric(out["latitude"], errors="coerce")

        transformer = Transformer.from_crs(
            WGS84_CRS,
            MOROCCO_METRIC_CRS,
            always_xy=True,
        )
        x_metric, y_metric = transformer.transform(lon.to_numpy(), lat.to_numpy())

        out["x_metric"] = x_metric
        out["y_metric"] = y_metric
        out["longitude"] = lon
        out["latitude"] = lat

        return out

    return out


def euclidean_distance_m(x1, y1, x2, y2):
    return np.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2)


def required_network_files_exist(city_id: str) -> bool:
    folder = city_dir(city_id)

    required = [
        "origins.csv",
        "healthcare.csv",
        "transport_stops.csv",
        "route_vertices.csv",
    ]

    return all((folder / filename).exists() for filename in required)


def load_network_inputs(city_id: str) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    folder = city_dir(city_id)

    stops = pd.read_csv(folder / "transport_stops.csv")
    facilities = pd.read_csv(folder / "healthcare.csv")
    vertices = pd.read_csv(folder / "route_vertices.csv")

    stops = add_metric_xy(stops)
    facilities = add_metric_xy(facilities)
    vertices = add_metric_xy(vertices)

    stops = stops.dropna(subset=["x_metric", "y_metric"]).copy()
    facilities = facilities.dropna(subset=["x_metric", "y_metric"]).copy()
    vertices = vertices.dropna(subset=["x_metric", "y_metric"]).copy()

    return stops, facilities, vertices


def build_transport_graph(
    stops: pd.DataFrame,
    facilities: pd.DataFrame,
    vertices: pd.DataFrame,
) -> tuple[nx.Graph, dict[str, str], list[str]]:
    graph = nx.Graph()
    warnings: list[str] = []

    if "route_id" not in vertices.columns:
        warnings.append("route_vertices.csv missing route_id. Using all vertices as one route.")
        vertices["route_id"] = "route"

    if "vertex_order" not in vertices.columns:
        warnings.append("route_vertices.csv missing vertex_order. Using file order.")
        vertices["vertex_order"] = np.arange(len(vertices))

    vertices = vertices.sort_values(["route_id", "vertex_order"]).copy()

    # Route vertices
    for idx, row in vertices.iterrows():
        node_id = f"route_{row['route_id']}_v_{idx}"
        graph.add_node(
            node_id,
            kind="route_vertex",
            x=float(row["x_metric"]),
            y=float(row["y_metric"]),
        )

    # Transit edges between consecutive vertices in each route
    for route_id, group in vertices.groupby("route_id"):
        previous_node = None
        previous_row = None

        for idx, row in group.iterrows():
            current_node = f"route_{row['route_id']}_v_{idx}"

            if previous_node is not None:
                distance = euclidean_distance_m(
                    float(previous_row["x_metric"]),
                    float(previous_row["y_metric"]),
                    float(row["x_metric"]),
                    float(row["y_metric"]),
                )

                graph.add_edge(
                    previous_node,
                    current_node,
                    weight=float(distance / TRANSIT_SPEED_M_PER_MIN),
                    edge_type="transit",
                )

            previous_node = current_node
            previous_row = row

    vertex_nodes = [
        node for node, data in graph.nodes(data=True)
        if data.get("kind") == "route_vertex"
    ]

    vertex_xy = np.array([
        [graph.nodes[node]["x"], graph.nodes[node]["y"]]
        for node in vertex_nodes
    ])

    # Stops connected to nearest route vertex
    stop_node_by_key: dict[str, str] = {}

    for idx, row in stops.iterrows():
        stop_key = str(row.get("stop_key", row.get("cluster_id", f"stop_{idx}")))
        stop_node = f"stop_{stop_key}"

        stop_x = float(row["x_metric"])
        stop_y = float(row["y_metric"])

        graph.add_node(
            stop_node,
            kind="stop",
            x=stop_x,
            y=stop_y,
        )

        stop_node_by_key[stop_key] = stop_node

        if len(vertex_xy) > 0:
            distances = np.sqrt(
                (vertex_xy[:, 0] - stop_x) ** 2
                + (vertex_xy[:, 1] - stop_y) ** 2
            )

            nearest_index = int(np.argmin(distances))
            nearest_node = vertex_nodes[nearest_index]
            nearest_distance = float(distances[nearest_index])

            graph.add_edge(
                stop_node,
                nearest_node,
                weight=nearest_distance / WALKING_SPEED_M_PER_MIN,
                edge_type="stop_to_route",
            )

    # Walking transfers between nearby stops
    stop_nodes = [
        node for node, data in graph.nodes(data=True)
        if data.get("kind") == "stop"
    ]

    for i in range(len(stop_nodes)):
        node_i = stop_nodes[i]
        xi = graph.nodes[node_i]["x"]
        yi = graph.nodes[node_i]["y"]

        for j in range(i + 1, len(stop_nodes)):
            node_j = stop_nodes[j]
            xj = graph.nodes[node_j]["x"]
            yj = graph.nodes[node_j]["y"]

            distance = euclidean_distance_m(xi, yi, xj, yj)

            if distance <= MAX_TRANSFER_LINK_M:
                graph.add_edge(
                    node_i,
                    node_j,
                    weight=distance / WALKING_SPEED_M_PER_MIN,
                    edge_type="transfer_walk",
                )

    # Facilities connected to nearby/nearest stops
    facility_nodes: list[str] = []

    stop_xy = np.array([
        [graph.nodes[node]["x"], graph.nodes[node]["y"]]
        for node in stop_nodes
    ])

    for idx, row in facilities.iterrows():
        facility_id = str(row.get("facility_id", f"facility_{idx}"))
        facility_node = f"facility_{facility_id}"

        facility_x = float(row["x_metric"])
        facility_y = float(row["y_metric"])

        graph.add_node(
            facility_node,
            kind="facility",
            x=facility_x,
            y=facility_y,
        )

        facility_nodes.append(facility_node)

        if len(stop_xy) == 0:
            continue

        distances = np.sqrt(
            (stop_xy[:, 0] - facility_x) ** 2
            + (stop_xy[:, 1] - facility_y) ** 2
        )

        nearby_indices = np.where(distances <= MAX_FACILITY_LINK_M)[0]

        if len(nearby_indices) == 0:
            nearby_indices = [int(np.argmin(distances))]

        for stop_index in nearby_indices:
            stop_node = stop_nodes[int(stop_index)]
            distance = float(distances[int(stop_index)])

            graph.add_edge(
                facility_node,
                stop_node,
                weight=distance / WALKING_SPEED_M_PER_MIN,
                edge_type="facility_walk",
            )

    return graph, stop_node_by_key, warnings


def compute_network_travel_times(
    origins: pd.DataFrame,
    graph: nx.Graph,
    stop_node_by_key: dict[str, str],
    k_nearest_stops: int = 5,
) -> pd.Series:
    result = pd.Series(np.nan, index=origins.index, dtype="float64")

    stop_nodes = list(stop_node_by_key.values())

    if not stop_nodes:
        return result

    facility_nodes = [
        node for node, data in graph.nodes(data=True)
        if data.get("kind") == "facility"
    ]

    if not facility_nodes:
        return result

    stop_xy = np.array([
        [graph.nodes[node]["x"], graph.nodes[node]["y"]]
        for node in stop_nodes
    ])

    valid_origins = origins[
        origins["x_metric"].notna()
        & origins["y_metric"].notna()
    ]

    for origin_idx, origin in valid_origins.iterrows():
        ox = float(origin["x_metric"])
        oy = float(origin["y_metric"])

        distances = np.sqrt(
            (stop_xy[:, 0] - ox) ** 2
            + (stop_xy[:, 1] - oy) ** 2
        )

        nearest_stop_indices = np.argsort(distances)[:k_nearest_stops]

        best_time = np.inf

        for stop_index in nearest_stop_indices:
            stop_node = stop_nodes[int(stop_index)]
            walk_to_stop = float(distances[int(stop_index)] / WALKING_SPEED_M_PER_MIN)

            try:
                lengths = nx.single_source_dijkstra_path_length(
                    graph,
                    stop_node,
                    weight="weight",
                )
            except Exception:
                continue

            facility_times = [
                lengths[node] for node in facility_nodes
                if node in lengths
            ]

            if not facility_times:
                continue

            candidate_time = walk_to_stop + WAIT_TIME_MIN + min(facility_times)
            best_time = min(best_time, candidate_time)

        if np.isfinite(best_time):
            result.loc[origin_idx] = best_time

    return result


def compute_automatic_network_travel_time(city_id: str, origins: pd.DataFrame) -> tuple[pd.Series, list[str]]:
    """
    Build a simplified transport network from uploaded files and compute
    origin-to-nearest-healthcare travel time.

    Requires:
    - transport_stops.csv
    - route_vertices.csv
    - healthcare.csv
    """
    warnings: list[str] = []

    if not required_network_files_exist(city_id):
        return (
            pd.Series(np.nan, index=origins.index, dtype="float64"),
            ["Network files are incomplete. Falling back to nearest-facility distance."],
        )

    stops, facilities, vertices = load_network_inputs(city_id)

    if stops.empty or facilities.empty or vertices.empty:
        return (
            pd.Series(np.nan, index=origins.index, dtype="float64"),
            ["Network files were found but contain no valid coordinates. Falling back to nearest-facility distance."],
        )

    graph, stop_node_by_key, graph_warnings = build_transport_graph(
        stops=stops,
        facilities=facilities,
        vertices=vertices,
    )

    warnings.extend(graph_warnings)

    travel_time = compute_network_travel_times(
        origins=origins,
        graph=graph,
        stop_node_by_key=stop_node_by_key,
    )

    if travel_time.notna().any():
        warnings.append(
            "Baseline travel time was automatically estimated using a simplified uploaded transport network."
        )

    return travel_time, warnings