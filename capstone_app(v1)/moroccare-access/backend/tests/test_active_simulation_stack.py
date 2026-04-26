from __future__ import annotations

from pathlib import Path

import geopandas as gpd
import pandas as pd
from fastapi.testclient import TestClient
from shapely.geometry import Point

from app.core.schemas import CityBundle, CityFiles, CityReadiness
from app.services.aggregation import compute_kpis
from app.services.preprocessors import preprocess_origins
from app.services.simulation_engine import run_city_scenario
from main import app
from services.notebook_bridge import loaders as nb_loaders

client = TestClient(app)


def _mini_bundle() -> CityBundle:
    origins = gpd.GeoDataFrame(
        {
            "origin_id": ["o1", "o2"],
            "population": [100.0, 200.0],
            "commune_id": ["c1", "c1"],
            "commune_name": ["Commune 1", "Commune 1"],
            "district_name": ["District 1", "District 1"],
            "total_travel_time_min": [50.0, 40.0],
            "accessibility_score": [0.0, 10.0],
        },
        geometry=[Point(-7.60, 33.60), Point(-7.61, 33.61)],
        crs="EPSG:4326",
    )
    facilities = gpd.GeoDataFrame(
        {"facility_id": ["f1"], "name": ["Facility 1"]},
        geometry=[Point(-7.62, 33.62)],
        crs="EPSG:4326",
    )
    stops = gpd.GeoDataFrame(
        {"stop_key": ["s1"], "stop_name": ["Stop 1"]},
        geometry=[Point(-7.60, 33.60)],
        crs="EPSG:4326",
    )
    return CityBundle(
        city_id="testcity",
        city_name="Testcity",
        city_path=Path("."),
        files=CityFiles(),
        readiness=CityReadiness(baseline_ready=True, simulation_ready=True, missing_files=[], warnings=[]),
        origins=origins,
        baseline_origins=origins.copy(),
        facilities=facilities,
        stops=stops,
        route_stops=stops.copy(),
        route_vertices=gpd.GeoDataFrame({"route_id": ["r1"], "vertex_order": [0], "x": [0.0], "y": [0.0]}, geometry=[Point(0, 0)], crs="EPSG:32629"),
        zones=gpd.GeoDataFrame({"commune_id": ["c1"], "commune_name": ["Commune 1"], "district_name": ["District 1"]}, geometry=[Point(-7.6, 33.6)], crs="EPSG:4326"),
        districts=gpd.GeoDataFrame({"commune_id": ["c1"], "commune_name": ["Commune 1"], "district_name": ["District 1"]}, geometry=[Point(-7.6, 33.6)], crs="EPSG:4326"),
    )


def test_active_simulation_route_imports_app_service():
    content = Path("backend/app/api/simulation.py").read_text(encoding="utf-8")
    assert "from app.services.simulation_engine import run_city_scenario" in content
    assert "from services.city_simulation import run_city_scenario" not in content


def test_simulation_uses_bundle_origins_and_not_notebook_loader(monkeypatch):
    monkeypatch.setattr("app.services.simulation_engine.get_city_bundle", lambda _city_id: _mini_bundle())
    monkeypatch.setattr(
        "app.services.simulation_engine.build_transport_graph",
        lambda _bundle, _params=None: object(),
    )

    def _fake_compute_origin_accessibility(bundle, _art, _params=None):
        rows = bundle.origins.copy()
        rows["total_travel_time_min"] = [40.0, 30.0]
        rows["accessibility_score"] = [11.0, 33.0]
        rows["nearest_facility_id"] = "f1"
        return rows.drop(columns=["geometry"])

    monkeypatch.setattr("app.services.simulation_engine.compute_origin_accessibility", _fake_compute_origin_accessibility)
    monkeypatch.setattr(
        "services.notebook_bridge.loaders.load_notebook_origin_metrics",
        lambda _city_id: (_ for _ in ()).throw(RuntimeError("should not be called")),
    )

    out = run_city_scenario("testcity", {"scenario_type": "add_facility", "location": {"latitude": 33.5, "longitude": -7.6}})
    assert out["analysis_unit"] == "commune"
    assert out["scenario_type"] == "add_facility"
    assert len(out["origin_metrics_sample"]) == 2


def test_city_folder_origin_metrics_without_city_id_is_accepted(monkeypatch, tmp_path):
    city_root = tmp_path / "casablanca"
    city_root.mkdir(parents=True, exist_ok=True)
    local_origins = city_root / "origin_accessibility_metrics.csv"
    local_origins.write_text("origin_id,latitude,longitude,population\n1,33.5,-7.6,100\n", encoding="utf-8")

    paths = nb_loaders.CityPaths(
        city_id="casablanca",
        root=city_root,
        config=city_root / "config.json",
        healthcare_csv=city_root / "healthcare.csv",
        transport_stops_csv=city_root / "transport_stops.csv",
        features_csv=city_root / "features.csv",
        model_pkl=city_root / "model.pkl",
        feature_names_json=city_root / "feature_names.json",
        interim_origin_metrics_csv=local_origins,
        interim_worldpop_origins_csv=city_root / "worldpop_origins.csv",
        interim_worldpop_origin_points_csv=city_root / "worldpop_origin_points.csv",
        processed_casablanca_districts_gpkg=city_root / "Casablanca_Districts.gpkg",
        processed_districts_with_worldpop_gpkg=city_root / "districts_with_worldpop.gpkg",
        processed_districts_with_worldpop_csv=city_root / "districts_with_worldpop.csv",
        final_district_summary_gpkg=city_root / "district_accessibility_summary.gpkg",
        final_district_summary_csv=city_root / "district_accessibility_summary.csv",
        final_modeling_results_dir=city_root / "modeling_results",
        final_cls_test_clean_csv=city_root / "cls_test_clean.csv",
        final_cls_cv_clean_csv=city_root / "cls_cv_clean.csv",
        final_feature_importance_csv=city_root / "classification_clean_feature_importance.csv",
        processed_cls_test_clean_csv=city_root / "processed_cls_test_clean.csv",
        processed_cls_cv_clean_csv=city_root / "processed_cls_cv_clean.csv",
        processed_feature_importance_csv=city_root / "processed_classification_clean_feature_importance.csv",
    )

    monkeypatch.setattr(nb_loaders, "get_city_paths", lambda _city_id: paths)
    monkeypatch.setattr(nb_loaders, "load_city_config", lambda _city_id: {"feature_flags": {"allow_unscoped_origin_metrics": False}})
    out = nb_loaders.load_notebook_origin_metrics("casablanca")
    assert len(out) == 1


def test_repo_level_unscoped_origin_metrics_is_rejected_without_flag(monkeypatch, tmp_path):
    city_root = tmp_path / "casablanca"
    city_root.mkdir(parents=True, exist_ok=True)
    shared = tmp_path / "origin_accessibility_metrics.csv"
    shared.write_text("origin_id,latitude,longitude,population\n1,33.5,-7.6,100\n", encoding="utf-8")

    paths = nb_loaders.CityPaths(
        city_id="casablanca",
        root=city_root,
        config=city_root / "config.json",
        healthcare_csv=city_root / "healthcare.csv",
        transport_stops_csv=city_root / "transport_stops.csv",
        features_csv=city_root / "features.csv",
        model_pkl=city_root / "model.pkl",
        feature_names_json=city_root / "feature_names.json",
        interim_origin_metrics_csv=shared,
        interim_worldpop_origins_csv=city_root / "worldpop_origins.csv",
        interim_worldpop_origin_points_csv=city_root / "worldpop_origin_points.csv",
        processed_casablanca_districts_gpkg=city_root / "Casablanca_Districts.gpkg",
        processed_districts_with_worldpop_gpkg=city_root / "districts_with_worldpop.gpkg",
        processed_districts_with_worldpop_csv=city_root / "districts_with_worldpop.csv",
        final_district_summary_gpkg=city_root / "district_accessibility_summary.gpkg",
        final_district_summary_csv=city_root / "district_accessibility_summary.csv",
        final_modeling_results_dir=city_root / "modeling_results",
        final_cls_test_clean_csv=city_root / "cls_test_clean.csv",
        final_cls_cv_clean_csv=city_root / "cls_cv_clean.csv",
        final_feature_importance_csv=city_root / "classification_clean_feature_importance.csv",
        processed_cls_test_clean_csv=city_root / "processed_cls_test_clean.csv",
        processed_cls_cv_clean_csv=city_root / "processed_cls_cv_clean.csv",
        processed_feature_importance_csv=city_root / "processed_classification_clean_feature_importance.csv",
    )

    monkeypatch.setattr(nb_loaders, "get_city_paths", lambda _city_id: paths)
    monkeypatch.setattr(nb_loaders, "load_city_config", lambda _city_id: {"feature_flags": {"allow_unscoped_origin_metrics": False}})

    try:
        nb_loaders.load_notebook_origin_metrics("casablanca")
        assert False, "Expected CityDataNotFoundError"
    except nb_loaders.CityDataNotFoundError:
        pass


def test_missing_origins_means_incomplete_not_facility_proxy():
    from app.services.validators import validate_readiness

    readiness = validate_readiness(
        CityFiles(
            origins=None,
            facilities=Path("healthcare.csv"),
            stops=Path("stops.csv"),
            route_stops=Path("route_stops.csv"),
            route_vertices=Path("route_vertices.csv"),
            districts=Path("districts.csv"),
        )
    )
    assert readiness.baseline_ready is False
    assert readiness.simulation_ready is False
    assert "origins" in readiness.missing_files


def test_post_simulate_add_facility_returns_200():
    payload = {"scenario_type": "add_facility", "location": {"latitude": 33.55, "longitude": -7.60}}
    r = client.post("/api/cities/casablanca/simulate", json=payload)
    assert r.status_code == 200
    body = r.json()
    assert body["analysis_unit"] == "commune"
    assert body["scenario_type"] == "add_facility"
    assert isinstance(body.get("origins"), list)
    assert isinstance(body.get("simulated_rows"), list)
    assert isinstance(body.get("baseline_rows"), list)


def test_post_simulate_add_stop_returns_200():
    payload = {"scenario_type": "add_stop", "location": {"latitude": 33.55, "longitude": -7.60}}
    r = client.post("/api/cities/casablanca/simulate", json=payload)
    assert r.status_code == 200
    body = r.json()
    assert body["analysis_unit"] == "commune"
    assert body["scenario_type"] == "add_stop"


def test_accessibility_score_scale_formula():
    score = lambda t: 100.0 * (1.0 - min(float(t) / 45.0, 1.0))
    assert score(0) == 100.0
    assert score(22.5) == 50.0
    assert score(45) == 0.0
    assert score(60) == 0.0


def test_simulation_clamps_non_worsening(monkeypatch):
    monkeypatch.setattr("app.services.simulation_engine.get_city_bundle", lambda _city_id: _mini_bundle())
    monkeypatch.setattr("app.services.simulation_engine.build_transport_graph", lambda _bundle, _params=None: object())

    def _worse_compute(bundle, _art, _params=None):
        rows = bundle.origins.copy().drop(columns=["geometry"])
        rows["total_travel_time_min"] = [80.0, 70.0]  # intentionally worse than baseline
        rows["accessibility_score"] = [0.0, 1.0]
        rows["nearest_facility_id"] = "f1"
        return rows

    monkeypatch.setattr("app.services.simulation_engine.compute_origin_accessibility", _worse_compute)
    out = run_city_scenario("testcity", {"scenario_type": "add_facility", "location": {"latitude": 33.5, "longitude": -7.6}})
    assert out["summary"]["average_travel_time_reduction_min"] >= 0


def test_preprocess_origins_derives_0_100_score_from_travel_time():
    raw = pd.DataFrame(
        {
            "origin_id": ["o1", "o2", "o3", "o4"],
            "longitude": [-7.60, -7.60, -7.60, -7.60],
            "latitude": [33.60, 33.60, 33.60, 33.60],
            "population": [10, 10, 10, 10],
            "total_travel_time_min": [0.0, 22.5, 45.0, 60.0],
        }
    )
    out = preprocess_origins(raw)
    scores = out["accessibility_score"].round(6).tolist()
    assert scores == [100.0, 50.0, 0.0, 0.0]


def test_compute_kpis_percentages_are_0_to_100_not_ratio():
    origins = pd.DataFrame(
        {
            "population": [100.0, 100.0],
            "total_travel_time_min": [10.0, 70.0],  # 50% within 60
            "accessibility_score": [80.0, 40.0],  # 50% below 50
        }
    )
    kpis = compute_kpis(origins=origins, facilities=pd.DataFrame([{"facility_id": "f1"}]), stops=pd.DataFrame([{"stop_key": "s1"}]), facilities_near_transit=1)
    assert kpis["pct_population_within_60_min"] == 50.0
    assert kpis["coverage_gap_pct"] == 50.0
