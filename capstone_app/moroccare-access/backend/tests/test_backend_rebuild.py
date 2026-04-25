import math

from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def _has_bad_numbers(obj):
    if isinstance(obj, dict):
        return any(_has_bad_numbers(v) for v in obj.values())
    if isinstance(obj, list):
        return any(_has_bad_numbers(v) for v in obj)
    if isinstance(obj, float):
        return math.isnan(obj) or math.isinf(obj)
    return False


def test_city_list_contains_casablanca():
    r = client.get("/api/cities")
    assert r.status_code == 200
    rows = r.json()
    ids = {row.get("city_id") or row.get("id") for row in rows}
    assert "casablanca" in ids


def test_baseline_population_positive():
    r = client.get("/api/cities/casablanca/baseline")
    assert r.status_code == 200
    body = r.json()
    assert body["kpis"]["population"] > 0


def test_baseline_facility_count_expected():
    r = client.get("/api/cities/casablanca/baseline")
    assert r.status_code == 200
    body = r.json()
    assert body["kpis"]["facility_count"] == 83


def test_districts_geojson_valid():
    r = client.get("/api/cities/casablanca/districts")
    assert r.status_code == 200
    body = r.json()
    assert body["type"] == "FeatureCollection"
    assert isinstance(body.get("features", []), list)
    assert len(body.get("features", [])) > 0
    assert body.get("analysis_unit") == "commune"


def test_communes_alias_geojson_valid():
    r = client.get("/api/cities/casablanca/communes")
    assert r.status_code == 200
    body = r.json()
    assert body["type"] == "FeatureCollection"
    assert body.get("analysis_unit") == "commune"


def test_ranking_has_rows():
    r = client.get("/api/cities/casablanca/ranking")
    assert r.status_code == 200
    body = r.json()
    rows = body.get("ranking") or body.get("rows") or []
    assert len(rows) > 0


def test_facilities_are_destinations_only_shape():
    r = client.get("/api/cities/casablanca/facilities")
    assert r.status_code == 200
    body = r.json()
    assert body["type"] == "FeatureCollection"
    assert len(body.get("features", [])) == 83
    for feat in body.get("features", [])[:10]:
        props = feat.get("properties", {})
        assert "facility_id" in props
        assert "origin_id" not in props


def test_stops_geojson_valid():
    r = client.get("/api/cities/casablanca/stops")
    assert r.status_code == 200
    body = r.json()
    assert body["type"] == "FeatureCollection"
    assert len(body.get("features", [])) > 0


def test_simulate_add_facility_returns_summary():
    payload = {
        "scenario_type": "add_facility",
        "location": {"latitude": 33.57, "longitude": -7.61},
        "parameters": {"walking_speed_kmh": 3.6, "transit_speed_kmh": 20, "wait_time_min": 10, "score_threshold_min": 45},
    }
    r = client.post("/api/cities/casablanca/simulate", json=payload)
    assert r.status_code == 200
    body = r.json()
    assert "summary" in body
    assert body["summary"]["total_population"] >= 0
    assert body.get("analysis_unit") == "commune"


def test_simulate_add_stop_returns_summary():
    payload = {
        "scenario_type": "add_stop",
        "location": {"latitude": 33.57, "longitude": -7.61},
        "parameters": {"mode": "bus"},
    }
    r = client.post("/api/cities/casablanca/simulate", json=payload)
    assert r.status_code == 200
    body = r.json()
    assert "summary" in body
    assert body["summary"]["total_population"] >= 0


def test_missing_city_returns_incomplete_status_not_crash():
    r = client.get("/api/cities/no_such_city/status")
    assert r.status_code == 200
    body = r.json()
    assert body["baseline_ready"] is False
    assert body["simulation_ready"] is False


def test_no_nan_or_infinity_in_baseline_json():
    r = client.get("/api/cities/casablanca/baseline")
    assert r.status_code == 200
    assert r.json().get("analysis_unit") == "commune"
    assert not _has_bad_numbers(r.json())
