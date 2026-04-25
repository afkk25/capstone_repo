from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from threading import Lock
from typing import Any

import geopandas as gpd
import networkx as nx
import pandas as pd


@dataclass
class CityReadiness:
    baseline_ready: bool
    simulation_ready: bool
    missing_files: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


@dataclass
class CityFiles:
    origins: Path | None = None
    facilities: Path | None = None
    stops: Path | None = None
    route_stops: Path | None = None
    route_vertices: Path | None = None
    districts: Path | None = None
    district_summary: Path | None = None


@dataclass
class GraphArtifacts:
    graph: nx.Graph
    stop_nodes: dict[str, str]
    facility_nodes: dict[str, str]
    route_nodes: list[str]
    stop_points_metric: pd.DataFrame


@dataclass
class CityBundle:
    city_id: str
    city_name: str
    city_path: Path
    files: CityFiles
    readiness: CityReadiness
    origins: gpd.GeoDataFrame | None = None
    facilities: gpd.GeoDataFrame | None = None
    stops: gpd.GeoDataFrame | None = None
    route_stops: gpd.GeoDataFrame | None = None
    route_vertices: gpd.GeoDataFrame | None = None
    districts: gpd.GeoDataFrame | None = None
    zones: gpd.GeoDataFrame | None = None
    district_summary: pd.DataFrame | None = None
    commune_summary: pd.DataFrame | None = None
    baseline_origins: gpd.GeoDataFrame | None = None
    graph_artifacts: GraphArtifacts | None = None
    load_warnings: list[str] = field(default_factory=list)
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class CacheEntry:
    signature: str
    bundle: CityBundle
    lock: Lock
