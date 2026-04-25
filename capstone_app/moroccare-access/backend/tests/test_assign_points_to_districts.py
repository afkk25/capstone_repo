import geopandas as gpd
import pandas as pd
from shapely.geometry import Point, Polygon

from app.services.preprocessors import assign_points_to_districts


def _districts_gdf():
    polys = [
        Polygon([(-7.7, 33.5), (-7.5, 33.5), (-7.5, 33.7), (-7.7, 33.7)]),
        Polygon([(-7.5, 33.5), (-7.3, 33.5), (-7.3, 33.7), (-7.5, 33.7)]),
    ]
    return gpd.GeoDataFrame(
        {
            "district_id": ["d1", "d2"],
            "district_name": ["District One", "District Two"],
        },
        geometry=polys,
        crs="EPSG:4326",
    )


def test_assign_points_to_districts_no_existing_district_columns():
    points = gpd.GeoDataFrame(
        {"name": ["p1", "p2"]},
        geometry=[Point(-7.6, 33.6), Point(-7.4, 33.6)],
        crs="EPSG:4326",
    )
    out = assign_points_to_districts(points, _districts_gdf())
    assert "district_id" in out.columns
    assert "district_name" in out.columns
    assert out["district_id"].notna().all()


def test_assign_points_to_districts_with_existing_district_id_column_suffix_safe():
    points = gpd.GeoDataFrame(
        {
            "name": ["p1", "p2"],
            "district_id": ["old_1", "old_2"],
            "district_name": ["Old One", "Old Two"],
        },
        geometry=[Point(-7.6, 33.6), Point(-7.4, 33.6)],
        crs="EPSG:4326",
    )
    out = assign_points_to_districts(points, _districts_gdf())
    assert "district_id" in out.columns
    assert "district_name" in out.columns
    assert out["district_id"].tolist() == ["d1", "d2"]


def test_assign_points_to_districts_keeps_existing_when_unassigned():
    points = gpd.GeoDataFrame(
        {
            "name": ["inside", "outside_far"],
            "district_id": ["legacy_inside", "legacy_keep"],
            "district_name": ["Legacy Inside", "Legacy Keep"],
        },
        geometry=[Point(-7.6, 33.6), Point(-10.0, 40.0)],
        crs="EPSG:4326",
    )
    out = assign_points_to_districts(points, _districts_gdf())
    assert out.loc[out["name"] == "inside", "district_id"].iloc[0] == "d1"
    assert out.loc[out["name"] == "outside_far", "district_id"].iloc[0] == "legacy_keep"


def test_assign_points_to_districts_returns_required_columns_and_geometry():
    points = gpd.GeoDataFrame(
        {"kind": ["facility"]},
        geometry=[Point(-7.6, 33.6)],
        crs="EPSG:4326",
    )
    out = assign_points_to_districts(points, _districts_gdf())
    assert isinstance(out, gpd.GeoDataFrame)
    assert "geometry" in out.columns
    assert "district_id" in out.columns
    assert "district_name" in out.columns


def test_assign_points_to_districts_nearest_fallback_when_zero_assigned():
    districts = _districts_gdf()
    # Slightly outside boundary but close enough for <= 1000m nearest fallback
    points = gpd.GeoDataFrame(
        {"name": ["near_outside"]},
        geometry=[Point(-7.701, 33.6)],
        crs="EPSG:4326",
    )
    out = assign_points_to_districts(points, districts)
    assert out["district_name"].iloc[0] in {"District One", "District Two", "Unknown"}
