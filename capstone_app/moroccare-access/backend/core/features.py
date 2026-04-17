from __future__ import annotations

from math import pi

import geopandas as gpd
import numpy as np
import pandas as pd
from shapely.geometry import Point

METRIC_CRS = "EPSG:32629"


def _classify_ring(distance_km: float, ring_radii_km: list[float]) -> str:
    if distance_km <= ring_radii_km[0]:
        return "Inner"
    if distance_km <= ring_radii_km[1]:
        return "Middle"
    return "Outer"


def _radius_counts(points_gdf: gpd.GeoDataFrame, target_gdf: gpd.GeoDataFrame, radius_m: float, id_col: str) -> pd.Series:
    if points_gdf.empty or target_gdf.empty:
        return pd.Series(0, index=points_gdf[id_col].to_list(), dtype=float)
    buffers = points_gdf[[id_col, "geometry"]].copy()
    buffers["geometry"] = buffers.geometry.buffer(radius_m)
    joined = gpd.sjoin(target_gdf[[id_col, "geometry"]], buffers, how="inner", predicate="within")
    counts = joined.groupby(f"{id_col}_right").size()
    return points_gdf[id_col].map(counts).fillna(0).astype(float)


def compute_features(health_gdf: gpd.GeoDataFrame, stops_gdf: gpd.GeoDataFrame, city_config: dict) -> pd.DataFrame:
    if health_gdf.empty:
        return pd.DataFrame()

    health = health_gdf.copy()
    stops = stops_gdf.copy()
    health = health.to_crs(METRIC_CRS)
    stops = stops.to_crs(METRIC_CRS)

    health = health.reset_index(drop=True)
    health["facility_id"] = health.index.astype(int)
    health["facility"] = health["name"].astype(str)

    center_point = gpd.GeoSeries([Point(city_config["center_lon"], city_config["center_lat"])], crs="EPSG:4326").to_crs(METRIC_CRS).iloc[0]
    health["distance_to_city_center_km"] = health.geometry.distance(center_point) / 1000.0
    health["urban_ring"] = health["distance_to_city_center_km"].apply(
        lambda d: _classify_ring(float(d), city_config["urban_ring_radii_km"])
    )

    if stops.empty:
        health["distance_to_nearest_stop_m"] = 5000.0
    else:
        nearest = gpd.sjoin_nearest(
            health[["facility_id", "geometry"]],
            stops[["geometry"]],
            how="left",
            distance_col="distance_to_nearest_stop_m",
        )
        health["distance_to_nearest_stop_m"] = nearest.sort_values("facility_id")["distance_to_nearest_stop_m"].to_numpy(dtype=float)

    area_500m = pi * (0.5**2)
    health["stop_density"] = _radius_counts(health, stops.assign(facility_id=np.arange(len(stops))), 500.0, "facility_id") / area_500m
    health["stop_density_1km"] = _radius_counts(health, stops.assign(facility_id=np.arange(len(stops))), 1000.0, "facility_id")

    health_points = health[["facility_id", "geometry"]].copy()
    within_1km = _radius_counts(health, health_points, 1000.0, "facility_id")
    health["num_healthcare_facilities"] = within_1km
    health["healthcare_density_1km"] = health["num_healthcare_facilities"] / (pi * (1.0**2))

    health["population"] = 1000.0
    health["population_density"] = 500.0
    health["local_edge_count_500m"] = 10
    health["local_edge_length_500m"] = 2000.0
    health["nearest_node_degree"] = 3.0
    health["distance_to_nearest_node_m"] = 50.0
    health["interaction_stop_pop_density"] = health["stop_density"] * health["population_density"]
    health["interaction_fac_pop"] = health["num_healthcare_facilities"] * health["population"]
    health["interaction_built_stop"] = health["local_edge_length_500m"] * health["stop_density"]
    health["neighbor_accessibility_mean"] = 0.5

    health_ll = health.to_crs("EPSG:4326")
    health["latitude"] = health_ll.geometry.y
    health["longitude"] = health_ll.geometry.x

    return health[
        [
            "facility",
            "name",
            "latitude",
            "longitude",
            "distance_to_nearest_stop_m",
            "stop_density",
            "stop_density_1km",
            "population",
            "population_density",
            "num_healthcare_facilities",
            "healthcare_density_1km",
            "distance_to_city_center_km",
            "urban_ring",
            "local_edge_count_500m",
            "local_edge_length_500m",
            "nearest_node_degree",
            "distance_to_nearest_node_m",
            "interaction_stop_pop_density",
            "interaction_fac_pop",
            "interaction_built_stop",
            "neighbor_accessibility_mean",
        ]
    ].copy()
