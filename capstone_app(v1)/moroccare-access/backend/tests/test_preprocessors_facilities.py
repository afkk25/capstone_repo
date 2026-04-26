import pandas as pd

from app.services.preprocessors import preprocess_facilities


def test_preprocess_facilities_without_capacity():
    df = pd.DataFrame(
        {
            "name": ["Clinic A", "Clinic B"],
            "latitude": [33.58, 33.59],
            "longitude": [-7.61, -7.62],
        }
    )
    out = preprocess_facilities(df)
    assert "capacity" in out.columns
    assert isinstance(out["capacity"], pd.Series)
    assert out["capacity"].fillna(0).eq(1).all()


def test_preprocess_facilities_with_capacity():
    df = pd.DataFrame(
        {
            "name": ["Clinic A", "Clinic B"],
            "latitude": [33.58, 33.59],
            "longitude": [-7.61, -7.62],
            "capacity": [3, 5],
        }
    )
    out = preprocess_facilities(df)
    assert out["capacity"].tolist() == [3, 5]


def test_preprocess_facilities_with_duplicate_capacity_column():
    df = pd.DataFrame(
        [["Clinic A", 33.58, -7.61, 2, 99], ["Clinic B", 33.59, -7.62, 4, 100]],
        columns=["name", "latitude", "longitude", "capacity", "capacity"],
    )
    out = preprocess_facilities(df)
    assert "capacity" in out.columns
    assert out["capacity"].tolist() == [2, 4]


def test_preprocess_facilities_with_minimum_columns():
    df = pd.DataFrame(
        {
            "name": ["Clinic A"],
            "latitude": [33.58],
            "longitude": [-7.61],
        }
    )
    out = preprocess_facilities(df)
    assert len(out) == 1
    assert out["facility_id"].tolist() == ["facility_1"]
    assert out["type"].tolist() == ["healthcare"]
    assert out["capacity"].tolist() == [1.0]


def test_preprocess_facilities_never_crashes_capacity_series():
    df = pd.DataFrame(
        {
            "name": ["Clinic A", "Clinic B"],
            "latitude": [33.58, 33.59],
            "longitude": [-7.61, -7.62],
        }
    )
    out = preprocess_facilities(df)
    assert isinstance(out["capacity"], pd.Series)
    assert out["capacity"].notna().all()
