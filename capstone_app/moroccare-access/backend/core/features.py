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
    joined = gpd.sjoin(target_gdf[["geometry"]], buffers, how="inner", predicate="within")
    group_col = f"{id_col}_right" if f"{id_col}_right" in joined.columns else id_col
    counts = joined.groupby(group_col).size()
    return points_gdf[id_col].map(counts).fillna(0).astype(float)


def _series_from_candidates(df: pd.DataFrame, candidates: list[str], default: float = np.nan) -> pd.Series:
    for col in candidates:
        if col in df.columns:
            return pd.to_numeric(df[col], errors="coerce")
    return pd.Series(default, index=df.index, dtype=float)


def _text_series_from_candidates(df: pd.DataFrame, candidates: list[str], default_prefix: str) -> pd.Series:
    for col in candidates:
        if col in df.columns:
            raw = df[col].astype(str).str.strip()
            valid = raw.where(raw.ne(""), None)
            fallback = pd.Series([f"{default_prefix} {i + 1}" for i in range(len(df))], index=df.index, dtype="object")
            return valid.fillna(fallback).astype(str)
    return pd.Series([f"{default_prefix} {i + 1}" for i in range(len(df))], index=df.index, dtype="object")


def _origin_points_to_metric_gdf(origins_df: pd.DataFrame, metric_crs: str) -> gpd.GeoDataFrame:
    origin_ids = _text_series_from_candidates(origins_df, ["origin_id", "id"], default_prefix="origin")
    if {"x", "y"}.issubset(origins_df.columns):
        x = pd.to_numeric(origins_df["x"], errors="coerce")
        y = pd.to_numeric(origins_df["y"], errors="coerce")
        gdf = gpd.GeoDataFrame(
            origins_df.copy(),
            geometry=gpd.points_from_xy(x, y),
            crs=metric_crs,
        )
    elif {"longitude", "latitude"}.issubset(origins_df.columns):
        lon = pd.to_numeric(origins_df["longitude"], errors="coerce")
        lat = pd.to_numeric(origins_df["latitude"], errors="coerce")
        gdf = gpd.GeoDataFrame(
            origins_df.copy(),
            geometry=gpd.points_from_xy(lon, lat),
            crs="EPSG:4326",
        ).to_crs(metric_crs)
    else:
        raise ValueError("Origin data must include either x/y or latitude/longitude columns")
    gdf["origin_id"] = origin_ids
    gdf = gdf[gdf.geometry.notna()].copy().reset_index(drop=True)
    return gdf


def _enrich_spatial_features(
    points: gpd.GeoDataFrame,
    facilities: gpd.GeoDataFrame,
    stops: gpd.GeoDataFrame,
    city_config: dict,
    id_col: str,
) -> gpd.GeoDataFrame:
    metric_crs = city_config.get("crs_metric", METRIC_CRS) or METRIC_CRS
    points = points.to_crs(metric_crs)
    facilities = facilities.to_crs(metric_crs)
    stops = stops.to_crs(metric_crs)

    center_point = gpd.GeoSeries([Point(city_config["center_lon"], city_config["center_lat"])], crs="EPSG:4326").to_crs(metric_crs).iloc[0]
    points["distance_to_city_center_km"] = points.geometry.distance(center_point) / 1000.0
    points["urban_ring"] = points["distance_to_city_center_km"].apply(lambda d: _classify_ring(float(d), city_config["urban_ring_radii_km"]))

    if stops.empty:
        points["distance_to_nearest_stop_m"] = np.nan
    else:
        nearest = gpd.sjoin_nearest(
            points[[id_col, "geometry"]],
            stops[["geometry"]],
            how="left",
            distance_col="distance_to_nearest_stop_m",
        )
        points["distance_to_nearest_stop_m"] = nearest.sort_values(id_col)["distance_to_nearest_stop_m"].to_numpy(dtype=float)

    area_500m = pi * (0.5**2)
    points["stop_density"] = _radius_counts(points, stops.assign(point_id=np.arange(len(stops))), 500.0, id_col) / area_500m
    points["stop_density_1km"] = _radius_counts(points, stops.assign(point_id=np.arange(len(stops))), 1000.0, id_col)

    points["num_healthcare_facilities"] = _radius_counts(points, facilities.assign(point_id=np.arange(len(facilities))), 1000.0, id_col)
    points["healthcare_density_1km"] = points["num_healthcare_facilities"] / (pi * (1.0**2))
    return points


def _finalize_common_features(df: pd.DataFrame) -> pd.DataFrame:
    pop = pd.to_numeric(df.get("population"), errors="coerce")
    pop_density = pd.to_numeric(df.get("population_density"), errors="coerce")
    df["population"] = pop
    df["population_density"] = pop_density
    df["interaction_stop_pop_density"] = df["stop_density"] * df["population_density"].fillna(0.0)
    df["interaction_fac_pop"] = df["num_healthcare_facilities"] * df["population"].fillna(0.0)
    return df


def compute_origin_features(
    origins_df: pd.DataFrame,
    facilities_gdf: gpd.GeoDataFrame,
    stops_gdf: gpd.GeoDataFrame,
    city_config: dict,
) -> pd.DataFrame:
    if origins_df.empty:
        return pd.DataFrame()

    metric_crs = city_config.get("crs_metric", METRIC_CRS) or METRIC_CRS
    origins_metric = _origin_points_to_metric_gdf(origins_df, metric_crs)
    origins_metric = origins_metric.reset_index(drop=True)

    origins_metric = _enrich_spatial_features(
        points=origins_metric,
        facilities=facilities_gdf.copy(),
        stops=stops_gdf.copy(),
        city_config=city_config,
        id_col="origin_id",
    )

    origins_metric["population"] = _series_from_candidates(
        origins_metric,
        ["population", "population_worldpop", "pop_mean_pixel"],
        default=np.nan,
    ).clip(lower=0.0)
    origins_metric["population_density"] = _series_from_candidates(
        origins_metric,
        ["population_density", "pop_density_km2"],
        default=np.nan,
    ).clip(lower=0.0)
    needs_density = origins_metric["population_density"].isna() & ("area_km2" in origins_metric.columns)
    if needs_density.any():
        area = pd.to_numeric(origins_metric.get("area_km2"), errors="coerce").replace(0, np.nan)
        origins_metric.loc[needs_density, "population_density"] = (
            origins_metric.loc[needs_density, "population"] / area.loc[needs_density]
        )

    origins_metric["district_name"] = _text_series_from_candidates(
        origins_metric,
        ["district_name", "district", "commune"],
        default_prefix="Area",
    )
    origins_metric["district_id"] = _series_from_candidates(origins_metric, ["district_id"], default=np.nan)
    origins_metric["origin_name"] = _text_series_from_candidates(origins_metric, ["origin_name", "origin_id"], default_prefix="Origin")

    origins_metric = _finalize_common_features(origins_metric)

    if "accessibility_score" in origins_metric.columns:
        origins_metric["accessibility_score"] = pd.to_numeric(origins_metric["accessibility_score"], errors="coerce")
    else:
        origins_metric["accessibility_score"] = np.nan
    if "score_2sfca" in origins_metric.columns:
        origins_metric["score_2sfca"] = pd.to_numeric(origins_metric["score_2sfca"], errors="coerce")
    else:
        origins_metric["score_2sfca"] = np.nan

    origin_ll = origins_metric.to_crs("EPSG:4326")
    origins_metric["latitude"] = origin_ll.geometry.y
    origins_metric["longitude"] = origin_ll.geometry.x
    origins_metric["analysis_unit"] = "origin"

    return origins_metric[
        [
            "origin_id",
            "origin_name",
            "district_id",
            "district_name",
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
            "interaction_stop_pop_density",
            "interaction_fac_pop",
            "analysis_unit",
            "accessibility_score",
            "score_2sfca",
        ]
    ].copy()


def compute_facility_proxy_features(
    health_gdf: gpd.GeoDataFrame,
    stops_gdf: gpd.GeoDataFrame,
    city_config: dict,
) -> pd.DataFrame:
    if health_gdf.empty:
        return pd.DataFrame()

    facilities = health_gdf.copy().reset_index(drop=True)
    facilities["origin_id"] = facilities.index.astype(str)
    facilities["origin_name"] = facilities["name"].astype(str)
    facilities["district_name"] = np.nan
    facilities["district_id"] = np.nan

    facilities = _enrich_spatial_features(
        points=facilities,
        facilities=health_gdf.copy(),
        stops=stops_gdf.copy(),
        city_config=city_config,
        id_col="origin_id",
    )
    facilities["population"] = _series_from_candidates(facilities, ["population"], default=np.nan).clip(lower=0.0)
    facilities["population_density"] = _series_from_candidates(facilities, ["population_density"], default=np.nan).clip(lower=0.0)
    facilities = _finalize_common_features(facilities)

    facilities_ll = facilities.to_crs("EPSG:4326")
    facilities["latitude"] = facilities_ll.geometry.y
    facilities["longitude"] = facilities_ll.geometry.x
    facilities["analysis_unit"] = "facility_proxy"
    facilities["accessibility_score"] = np.nan
    facilities["score_2sfca"] = np.nan

    return facilities[
        [
            "origin_id",
            "origin_name",
            "district_id",
            "district_name",
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
            "interaction_stop_pop_density",
            "interaction_fac_pop",
            "analysis_unit",
            "accessibility_score",
            "score_2sfca",
        ]
    ].copy()


def compute_features(health_gdf: gpd.GeoDataFrame, stops_gdf: gpd.GeoDataFrame, city_config: dict) -> pd.DataFrame:
    """
    Backward-compatible wrapper.
    Produces facility-proxy rows when origin demand points are unavailable.
    """
    return compute_facility_proxy_features(health_gdf, stops_gdf, city_config)
