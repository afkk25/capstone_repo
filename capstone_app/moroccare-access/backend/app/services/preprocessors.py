from __future__ import annotations

import logging
import unicodedata

import geopandas as gpd
import numpy as np
import pandas as pd
from shapely import wkt
from shapely.geometry import Point

from app.services.schema_detection import normalize_df_columns

logger = logging.getLogger("moroccare")

CRS_WEB = "EPSG:4326"
CRS_METRIC = "EPSG:32629"


def _prepare_frame(df: pd.DataFrame) -> tuple[pd.DataFrame, list[str]]:
    frame = normalize_df_columns(df)
    frame.columns = [str(c).strip() for c in frame.columns]
    duplicates = frame.columns[frame.columns.duplicated()].tolist()
    frame = frame.loc[:, ~frame.columns.duplicated()].copy()
    return frame, duplicates


def get_first_column_as_series(df: pd.DataFrame, names: list[str], default=None) -> pd.Series:
    for name in names:
        if name in df.columns:
            col = df.loc[:, df.columns == name]
            if isinstance(col, pd.DataFrame):
                if col.shape[1] == 0:
                    break
                return col.iloc[:, 0].reindex(df.index)
            return col.reindex(df.index)
    if isinstance(default, pd.Series):
        return default.reindex(df.index)
    return pd.Series([default] * len(df), index=df.index)


def get_series(df: pd.DataFrame, column_name: str, default=None) -> pd.Series:
    if column_name in df.columns:
        value = df.loc[:, df.columns == column_name]
        if isinstance(value, pd.DataFrame):
            if value.shape[1] == 0:
                return pd.Series([default] * len(df), index=df.index)
            value = value.iloc[:, 0]
        return value.reindex(df.index)
    return pd.Series([default] * len(df), index=df.index)


def infer_crs_from_columns(df: pd.DataFrame) -> str:
    cols = set(df.columns)
    if {"longitude", "latitude"}.issubset(cols):
        return CRS_WEB
    if {"x", "y"}.issubset(cols):
        sx = pd.to_numeric(df["x"], errors="coerce")
        sy = pd.to_numeric(df["y"], errors="coerce")
        if sx.dropna().between(-180, 180).mean() > 0.95 and sy.dropna().between(-90, 90).mean() > 0.95:
            return CRS_WEB
    return CRS_METRIC


def safe_point_from_lonlat(lon: float, lat: float) -> Point | None:
    try:
        if not np.isfinite(float(lon)) or not np.isfinite(float(lat)):
            return None
        if lon < -180 or lon > 180 or lat < -90 or lat > 90:
            return None
        return Point(float(lon), float(lat))
    except Exception:
        return None


def to_metric(gdf: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    if gdf.crs is None:
        gdf = gdf.set_crs(CRS_WEB, allow_override=True)
    return gdf.to_crs(CRS_METRIC)


def to_web(gdf: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    if gdf.crs is None:
        gdf = gdf.set_crs(CRS_WEB, allow_override=True)
    return gdf.to_crs(CRS_WEB)


def _as_string(series: pd.Series) -> pd.Series:
    return series.astype(str).str.strip()


def _slugify_series(series: pd.Series) -> pd.Series:
    s = series.astype("string").fillna("")
    try:
        s = s.str.normalize("NFKD")
    except Exception:
        s = s.map(lambda v: unicodedata.normalize("NFKD", str(v)))
    s = s.str.lower().str.replace(r"[^a-z0-9]+", "_", regex=True).str.strip("_")
    return s.astype("string")


def ensure_geometry(df: pd.DataFrame, kind: str) -> gpd.GeoDataFrame:
    frame, _ = _prepare_frame(df)
    if "geometry" in frame.columns:
        geometry_series = get_first_column_as_series(frame, ["geometry"])
        if geometry_series.dtype == object:
            def _parse(v):
                if isinstance(v, Point):
                    return v
                if isinstance(v, str):
                    text = v.strip()
                    if text.upper().startswith("POINT") or text.upper().startswith("POLYGON") or text.upper().startswith("MULTI"):
                        try:
                            return wkt.loads(text)
                        except Exception:
                            return None
                return None

            geom = geometry_series.map(_parse)
            frame = frame.drop(columns=["geometry"])
            gdf = gpd.GeoDataFrame(frame, geometry=geom)
        else:
            frame = frame.copy()
            frame["geometry"] = geometry_series
            gdf = gpd.GeoDataFrame(frame, geometry="geometry")
        if gdf.crs is None:
            gdf = gdf.set_crs(infer_crs_from_columns(df), allow_override=True)
        return gdf

    if {"longitude", "latitude"}.issubset(frame.columns):
        geom = [safe_point_from_lonlat(lon, lat) for lon, lat in zip(frame["longitude"], frame["latitude"])]
        gdf = gpd.GeoDataFrame(frame, geometry=geom, crs=CRS_WEB)
        return gdf

    if {"x", "y"}.issubset(frame.columns):
        crs = infer_crs_from_columns(frame)
        geom = gpd.points_from_xy(pd.to_numeric(frame["x"], errors="coerce"), pd.to_numeric(frame["y"], errors="coerce"))
        return gpd.GeoDataFrame(frame, geometry=geom, crs=crs)

    raise ValueError(f"Cannot build geometry for {kind}")


def preprocess_origins(df: pd.DataFrame) -> gpd.GeoDataFrame:
    frame, _ = _prepare_frame(df)

    origin_id = get_series(frame, "origin_id", default=pd.NA).astype("string").str.strip().replace("", pd.NA)
    generated_origin_id = pd.Series([f"origin_{i+1}" for i in range(len(frame))], index=frame.index, dtype="string")
    frame["origin_id"] = origin_id.fillna(generated_origin_id)
    frame["population"] = pd.to_numeric(get_series(frame, "population", default=0), errors="coerce")

    gdf = ensure_geometry(frame, "origins")
    metric = to_metric(gdf)
    gdf["x"] = metric.geometry.x
    gdf["y"] = metric.geometry.y

    gdf["district_id"] = _as_string(get_series(gdf, "district_id", default=""))
    gdf["district_name"] = _as_string(get_series(gdf, "district_name", default=""))

    numeric_cols = [
        "total_travel_time_min",
        "accessibility_score",
        "walk_time_to_stop_min",
        "score_2sfca",
        "tt_slow",
        "tt_base",
        "tt_fast",
    ]
    for col in numeric_cols:
        gdf[col] = pd.to_numeric(get_series(gdf, col, default=np.nan), errors="coerce")

    gdf["is_access_threshold"] = get_series(gdf, "is_access_threshold", default=False).astype(str).str.lower().isin(["1", "true", "yes"])
    gdf["is_unreachable"] = get_series(gdf, "is_unreachable", default=False).astype(str).str.lower().isin(["1", "true", "yes"])

    return gdf


def preprocess_facilities(df: pd.DataFrame, districts: gpd.GeoDataFrame | None = None) -> gpd.GeoDataFrame:
    frame, _ = _prepare_frame(df)
    facility_id = get_series(frame, "facility_id", default=pd.NA).astype("string").str.strip().replace("", pd.NA)
    generated_ids = pd.Series([f"facility_{i+1}" for i in range(len(frame))], index=frame.index, dtype="string")
    frame["facility_id"] = facility_id.fillna(generated_ids)

    name = get_series(frame, "name", default=pd.NA).astype("string").str.strip().replace("", pd.NA)
    frame["name"] = name.fillna(frame["facility_id"]).astype("string")

    frame["latitude"] = pd.to_numeric(get_series(frame, "latitude", default=np.nan), errors="coerce")
    frame["longitude"] = pd.to_numeric(get_series(frame, "longitude", default=np.nan), errors="coerce")
    capacity = get_series(frame, "capacity", default=1)
    frame["capacity"] = pd.to_numeric(capacity, errors="coerce").fillna(1)
    frame["type"] = get_series(frame, "type", default="healthcare").astype("string").fillna("healthcare").replace("", "healthcare")
    frame["amenity"] = get_series(frame, "amenity", default=pd.NA).astype("string")
    frame["district_id"] = get_series(frame, "district_id", default=pd.NA).astype("string")
    frame["district_name"] = get_series(frame, "district_name", default=pd.NA).astype("string")

    gdf = ensure_geometry(frame, "facilities")
    metric = to_metric(gdf)
    gdf["x"] = metric.geometry.x
    gdf["y"] = metric.geometry.y

    if districts is not None:
        gdf = assign_points_to_districts(gdf, districts)

    return gdf


def preprocess_stops(df: pd.DataFrame) -> gpd.GeoDataFrame:
    frame, _ = _prepare_frame(df)
    if "stop_key" not in frame.columns:
        if "cluster_id" in frame.columns:
            frame["stop_key"] = frame["cluster_id"].astype(str)
        else:
            frame["stop_key"] = [f"stop_{i+1}" for i in range(len(frame))]
    frame["stop_key"] = _as_string(get_series(frame, "stop_key", default=pd.NA).astype("string").fillna(""))

    if "stop_name" not in frame.columns:
        frame["stop_name"] = frame["stop_key"].map(lambda x: f"Stop {x}")
    stop_name = get_series(frame, "stop_name", default=pd.NA).astype("string")
    stop_name = stop_name.fillna(frame["stop_key"])
    stop_name = stop_name.mask(stop_name.str.strip() == "", frame["stop_key"])
    frame["stop_name"] = stop_name
    frame["mode"] = get_series(frame, "mode", default=pd.NA).astype("string")
    frame["Lines"] = get_series(frame, "Lines", default=pd.NA).astype("string")
    frame["district_id"] = get_series(frame, "district_id", default=pd.NA).astype("string")
    frame["district_name"] = get_series(frame, "district_name", default=pd.NA).astype("string")

    gdf = ensure_geometry(frame, "stops")
    metric = to_metric(gdf)
    gdf["x"] = metric.geometry.x
    gdf["y"] = metric.geometry.y
    return gdf


def preprocess_route_stops(df: pd.DataFrame) -> gpd.GeoDataFrame:
    frame, _ = _prepare_frame(df)
    frame["stop_key"] = get_series(frame, "stop_key", default=pd.NA).astype("string").fillna("").astype(str)
    frame["x"] = pd.to_numeric(get_series(frame, "x", default=np.nan), errors="coerce")
    frame["y"] = pd.to_numeric(get_series(frame, "y", default=np.nan), errors="coerce")
    frame["mode"] = get_series(frame, "mode", default=pd.NA).astype("string")
    frame["Lines"] = get_series(frame, "Lines", default=pd.NA).astype("string")
    frame["stop_name"] = get_series(frame, "stop_name", default=pd.NA).astype("string")
    frame["cluster_id"] = get_series(frame, "cluster_id", default=pd.NA)

    gdf = gpd.GeoDataFrame(frame, geometry=gpd.points_from_xy(frame["x"], frame["y"]), crs=CRS_METRIC)
    web = to_web(gdf)
    gdf["longitude"] = web.geometry.x
    gdf["latitude"] = web.geometry.y
    return gdf


def preprocess_route_vertices(df: pd.DataFrame) -> gpd.GeoDataFrame:
    frame, _ = _prepare_frame(df)
    frame["route_id"] = get_series(frame, "route_id", default="route").astype("string").fillna("route").astype(str)
    frame["vertex_order"] = pd.to_numeric(get_series(frame, "vertex_order", default=np.nan), errors="coerce")
    frame["x"] = pd.to_numeric(get_series(frame, "x", default=np.nan), errors="coerce")
    frame["y"] = pd.to_numeric(get_series(frame, "y", default=np.nan), errors="coerce")
    frame["source"] = get_series(frame, "source", default=pd.NA).astype("string")
    frame["mode"] = get_series(frame, "mode", default=pd.NA).astype("string")
    frame = frame.sort_values(["route_id", "vertex_order"], kind="mergesort")

    return gpd.GeoDataFrame(frame, geometry=gpd.points_from_xy(frame["x"], frame["y"]), crs=CRS_METRIC)


def preprocess_districts(df: pd.DataFrame) -> gpd.GeoDataFrame:
    logger.info("preprocess_districts raw columns=%s", list(df.columns))
    frame, duplicates = _prepare_frame(df)
    if duplicates:
        logger.warning("preprocess_districts duplicate columns found=%s", duplicates)

    geometry_series = get_first_column_as_series(frame, ["geometry"])
    if geometry_series.isna().all():
        raise ValueError("Districts must include geometry")

    geometry = []
    for val in geometry_series:
        if isinstance(val, str):
            geometry.append(wkt.loads(val))
        else:
            geometry.append(val)

    district_series = get_first_column_as_series(frame, ["district", "district_name"], default=pd.NA).astype("string")
    commune_series = get_first_column_as_series(frame, ["commune", "commune_name"], default=pd.NA).astype("string")
    commune_name = commune_series.fillna(get_first_column_as_series(frame, ["commune_name"], default=pd.NA).astype("string"))
    commune_name = commune_name.fillna(district_series).fillna("Unknown Commune").astype("string").str.strip()
    commune_name = commune_name.mask(commune_name == "", "Unknown Commune")

    district_name = district_series.fillna(commune_name).astype("string").str.strip()
    district_name = district_name.mask(district_name == "", commune_name)

    commune_id_existing = get_first_column_as_series(frame, ["commune_id"], default=pd.NA).astype("string").str.strip().replace("", pd.NA)
    commune_id_generated = _slugify_series(district_name.fillna("") + "_" + commune_name.fillna("")).replace("", pd.NA)
    commune_id_fallback = pd.Series([f"commune_{i+1}" for i in range(len(frame))], index=frame.index, dtype="string")
    commune_id = commune_id_existing.fillna(commune_id_generated).fillna(commune_id_fallback).astype("string")

    commune_type = get_first_column_as_series(frame, ["commune_type_encoded"], default=pd.NA)

    base = pd.DataFrame(
        {
            "commune_id": commune_id,
            "commune_name": commune_name,
            "district_name": district_name,
            "commune": commune_series,
        },
        index=frame.index,
    )
    # Compatibility aliases for existing frontend/backend usage
    base["district_id"] = base["commune_id"]
    if "commune_type_encoded" in frame.columns:
        base["commune_type_encoded"] = commune_type

    excluded = {
        "geometry",
        "commune_id",
        "commune_name",
        "district_id",
        "district_name",
        "district",
        "commune",
        "commune_type_encoded",
    }
    extras = frame[[c for c in frame.columns if c not in excluded]].copy()
    out = pd.concat([base, extras], axis=1)
    out = out.loc[:, ~out.columns.duplicated()].copy()

    gdf = gpd.GeoDataFrame(out, geometry=geometry, crs=CRS_WEB)
    logger.info("preprocess_districts final columns=%s", list(gdf.columns))
    logger.info(
        "preprocess_districts sample ids=%s names=%s",
        gdf["commune_id"].head(5).tolist(),
        gdf["commune_name"].head(5).tolist(),
    )
    return gdf


def assign_points_to_zones(points: gpd.GeoDataFrame, zones: gpd.GeoDataFrame, max_nearest_m: float = 1000.0) -> gpd.GeoDataFrame:
    if points.empty or zones.empty:
        return points

    points_gdf = points.copy()
    if not isinstance(points_gdf, gpd.GeoDataFrame):
        if "geometry" not in points_gdf.columns:
            raise ValueError("Points must include geometry")
        points_gdf = gpd.GeoDataFrame(points_gdf, geometry="geometry")
    if points_gdf.crs is None:
        points_gdf = points_gdf.set_crs(CRS_WEB, allow_override=True)

    zones_gdf = zones.copy()
    if not isinstance(zones_gdf, gpd.GeoDataFrame):
        if "geometry" not in zones_gdf.columns:
            raise ValueError("Zones must include geometry")
        zones_gdf = gpd.GeoDataFrame(zones_gdf, geometry="geometry")
    if zones_gdf.crs is None:
        zones_gdf = zones_gdf.set_crs(CRS_WEB, allow_override=True)

    if "commune_id" not in zones_gdf.columns:
        zones_gdf["commune_id"] = get_series(zones_gdf, "district_id", default=pd.NA).astype("string")
    if "commune_name" not in zones_gdf.columns:
        zones_gdf["commune_name"] = get_series(zones_gdf, "commune", default=pd.NA).astype("string")
    if "district_name" not in zones_gdf.columns:
        zones_gdf["district_name"] = get_series(zones_gdf, "district", default=pd.NA).astype("string")

    zones_gdf["commune_id"] = get_series(zones_gdf, "commune_id", default=pd.NA).astype("string")
    zones_gdf["commune_name"] = get_series(zones_gdf, "commune_name", default=pd.NA).astype("string")
    zones_gdf["district_name"] = get_series(zones_gdf, "district_name", default=pd.NA).astype("string")

    target_crs = zones_gdf.crs
    points_join = points_gdf.to_crs(target_crs)
    existing_commune_id = get_series(points_join, "commune_id", default=pd.NA).astype("string")
    existing_commune_name = get_series(points_join, "commune_name", default=pd.NA).astype("string")
    existing_district_name = get_series(points_join, "district_name", default=pd.NA).astype("string")
    zone_join = zones_gdf[["commune_id", "commune_name", "district_name", "geometry"]].copy().rename(
        columns={
            "commune_id": "_commune_id_join",
            "commune_name": "_commune_name_join",
            "district_name": "_district_name_join",
        }
    )

    logger.info("assign_points_to_zones point type=%s", str(get_series(points_join, "type", default="points").iloc[0]) if len(points_join) else "points")
    logger.info("assign_points_to_zones points columns before join=%s", list(points_join.columns))
    logger.info("assign_points_to_zones zone_join columns before join=%s", list(zone_join.columns))

    joined = gpd.sjoin(points_join, zone_join, how="left", predicate="within")
    logger.info("assign_points_to_zones joined columns after sjoin=%s", list(joined.columns))

    assign_series = get_series(joined, "_commune_id_join", default=pd.NA)
    assigned = int(assign_series.notna().sum())
    unassigned = len(joined) - assigned
    logger.info("Zone assignment: assigned=%s unassigned=%s", assigned, unassigned)

    if assigned == 0 and len(joined) > 0:
        try:
            points_m = points_join.to_crs(CRS_METRIC)
            zones_m = zone_join.to_crs(CRS_METRIC)
            nearest = gpd.sjoin_nearest(
                points_m,
                zones_m,
                how="left",
                distance_col="_nearest_distance_m",
            )
            nearest_ok = nearest[get_series(nearest, "_nearest_distance_m", default=np.inf) <= 1000.0]
            joined.loc[nearest_ok.index, "_commune_id_join"] = get_series(nearest_ok, "_commune_id_join", default=pd.NA)
            joined.loc[nearest_ok.index, "_commune_name_join"] = get_series(nearest_ok, "_commune_name_join", default=pd.NA)
            joined.loc[nearest_ok.index, "_district_name_join"] = get_series(nearest_ok, "_district_name_join", default=pd.NA)
            assigned = int(get_series(joined, "_commune_id_join", default=pd.NA).notna().sum())
            unassigned = len(joined) - assigned
            logger.info("Zone assignment after nearest fallback: assigned=%s unassigned=%s", assigned, unassigned)
        except Exception:
            logger.exception("Nearest fallback zone assignment failed")

    join_commune_id = get_series(joined, "_commune_id_join", default=pd.NA).astype("string")
    join_commune_name = get_series(joined, "_commune_name_join", default=pd.NA).astype("string")
    join_district_name = get_series(joined, "_district_name_join", default=pd.NA).astype("string")

    final_commune_id = join_commune_id.fillna(existing_commune_id.reindex(joined.index))
    final_commune_name = join_commune_name.fillna(existing_commune_name.reindex(joined.index)).fillna("Unknown")
    final_district_name = join_district_name.fillna(existing_district_name.reindex(joined.index)).fillna(final_commune_name)

    out = joined.drop(
        columns=[
            c
            for c in [
                "index_right",
                "_commune_id_join",
                "_commune_name_join",
                "_district_name_join",
                "_nearest_distance_m",
            ]
            if c in joined.columns
        ],
        errors="ignore",
    ).copy()
    out["commune_id"] = final_commune_id
    out["commune_name"] = final_commune_name
    out["district_name"] = final_district_name
    out["district_id"] = final_commune_id  # compatibility
    out = out.loc[:, ~out.columns.duplicated()].copy()
    if not isinstance(out, gpd.GeoDataFrame):
        out = gpd.GeoDataFrame(out, geometry="geometry", crs=points_join.crs)

    return out.to_crs(points_gdf.crs if points_gdf.crs is not None else CRS_WEB)


def assign_points_to_districts(points: gpd.GeoDataFrame, districts: gpd.GeoDataFrame, max_nearest_m: float = 1000.0) -> gpd.GeoDataFrame:
    return assign_points_to_zones(points, districts, max_nearest_m=max_nearest_m)
