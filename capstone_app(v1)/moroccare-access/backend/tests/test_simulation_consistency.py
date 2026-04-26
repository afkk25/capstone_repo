from __future__ import annotations

import geopandas as gpd
import pandas as pd
from fastapi.testclient import TestClient
from pathlib import Path
from shapely.geometry import Polygon

from main import app
from services.city_simulation import normalize_simulation_payload
from services.districts import assign_zones_to_points, district_geojson_with_metrics
from services.origin_accessibility import accessibility_score_from_travel_time, load_city_origin_baseline, simulate_origin_accessibility

client = TestClient(app)


def test_accessibility_score_scale():
    values = accessibility_score_from_travel_time([0, 22.5, 45, 60], 45).tolist()
    assert values[0] == 100.0
    assert values[1] == 50.0
    assert values[2] == 0.0
    assert values[3] == 0.0


def test_no_facility_origins():
    baseline = load_city_origin_baseline("casablanca")
    simulated, _, _ = simulate_origin_accessibility(
        "casablanca",
        {"facility_locations": [{"latitude": 33.55, "longitude": -7.60}]},
        baseline_df=baseline,
    )
    assert len(simulated) == len(baseline)


def test_simulation_accepts_frontend_payload():
    city_cfg = {"simulation": {"default_parameters": {}}}
    normalized = normalize_simulation_payload(
        city_cfg,
        {"scenario_type": "add_facility", "location": {"latitude": 33.5, "longitude": -7.6}, "parameters": {}},
    )
    assert normalized["facility_locations"] == [{"latitude": 33.5, "longitude": -7.6}]
    assert normalized["transport_stop_locations"] == []


def test_simulation_accepts_old_payload():
    city_cfg = {"simulation": {"default_parameters": {}}}
    normalized = normalize_simulation_payload(city_cfg, {"facility_locations": [{"latitude": 33.5, "longitude": -7.6}]})
    assert normalized["facility_locations"] == [{"latitude": 33.5, "longitude": -7.6}]


def test_commune_zone_output(monkeypatch):
    zones = gpd.GeoDataFrame(
        {"district": ["Ain Chock"], "commune": ["Sidi Maarouf"]},
        geometry=[Polygon([(-7.7, 33.5), (-7.5, 33.5), (-7.5, 33.7), (-7.7, 33.7)])],
        crs="EPSG:4326",
    )

    def _fake_load_city_districts(_city_id: str):
        from services.districts import normalize_zone_gdf

        return normalize_zone_gdf(zones, source_path=Path("zones.gpkg"), city_id="casablanca"), []

    monkeypatch.setattr("services.districts.load_city_districts", _fake_load_city_districts)
    rows = pd.DataFrame([{"latitude": 33.6, "longitude": -7.6}])
    enriched, _ = assign_zones_to_points("casablanca", rows)
    assert "commune_id" in enriched.columns
    assert "commune_name" in enriched.columns
    assert "district_name" in enriched.columns


def test_district_endpoint_no_crash(monkeypatch):
    zones = gpd.GeoDataFrame(
        {"commune_id": ["1"], "commune_name": ["Sidi Maarouf"], "district_name": ["Ain Chock"]},
        geometry=[Polygon([(-7.7, 33.5), (-7.5, 33.5), (-7.5, 33.7), (-7.7, 33.7)])],
        crs="EPSG:4326",
    )

    def _fake_load_city_districts(_city_id: str):
        return zones, []

    monkeypatch.setattr("services.districts.load_city_districts", _fake_load_city_districts)
    geojson, _ = district_geojson_with_metrics("casablanca", summaries=[{"commune_id": 1, "scenario_score": 55.0}])
    assert geojson["type"] == "FeatureCollection"
    assert isinstance(geojson.get("features"), list)


def test_add_facility_improves_or_not_worse():
    baseline = load_city_origin_baseline("casablanca")
    baseline_only, _, _ = simulate_origin_accessibility("casablanca", {}, baseline_df=baseline)
    with_facility, _, _ = simulate_origin_accessibility(
        "casablanca",
        {"facility_locations": [{"latitude": 33.55, "longitude": -7.60}]},
        baseline_df=baseline,
    )
    b = pd.to_numeric(baseline_only["total_travel_time_min"], errors="coerce")
    s = pd.to_numeric(with_facility["total_travel_time_min"], errors="coerce")
    delta = (s - b).fillna(0.0)
    assert (delta <= 1e-6).all()


def test_add_stop_payload():
    city_cfg = {"simulation": {"default_parameters": {}}}
    normalized = normalize_simulation_payload(
        city_cfg,
        {"scenario_type": "add_stop", "location": {"latitude": 33.5, "longitude": -7.6}},
    )
    assert normalized["transport_stop_locations"] == [{"latitude": 33.5, "longitude": -7.6}]
    assert normalized["facility_locations"] == []
