import pandas as pd

from app.services.preprocessors import preprocess_districts


def _poly(x0=0.0, y0=0.0, s=1.0):
    return f"POLYGON (({x0} {y0}, {x0+s} {y0}, {x0+s} {y0+s}, {x0} {y0+s}, {x0} {y0}))"


def test_preprocess_districts_with_district_commune_geometry_only():
    df = pd.DataFrame(
        {
            "district": ["Ain Chock", "Anfa"],
            "commune": ["Ain Chock", "Anfa"],
            "geometry": [_poly(0, 0), _poly(2, 2)],
        }
    )
    out = preprocess_districts(df)
    assert "district_id" in out.columns
    assert "district_name" in out.columns
    assert out["district_name"].dtype.name == "string"
    assert out["district_id"].dtype.name == "string"
    assert not out.columns.duplicated().any()


def test_preprocess_districts_with_existing_district_name():
    df = pd.DataFrame(
        {
            "district_name": ["Ben M'sik", "Sidi Bernoussi"],
            "geometry": [_poly(0, 0), _poly(3, 3)],
        }
    )
    out = preprocess_districts(df)
    assert out["district_name"].tolist() == ["Ben M'sik", "Sidi Bernoussi"]
    assert out["district_id"].str.len().gt(0).all()


def test_preprocess_districts_with_duplicate_district_name_columns():
    df = pd.DataFrame(
        [["Name 1", "Shadow 1", _poly(0, 0)], ["Name 2", "Shadow 2", _poly(4, 4)]],
        columns=["district_name", "district_name", "geometry"],
    )
    out = preprocess_districts(df)
    assert "district_name" in out.columns
    assert out["district_name"].dtype.name == "string"
    assert out["district_id"].dtype.name == "string"
    assert out["district_name"].tolist() == ["Name 1", "Name 2"]


def test_preprocess_districts_never_returns_duplicate_columns():
    df = pd.DataFrame(
        [["A", "A-dup", "Commune A", _poly(0, 0)]],
        columns=["district_name", "district_name", "commune", "geometry"],
    )
    out = preprocess_districts(df)
    assert not out.columns.duplicated().any()


def test_preprocess_districts_returns_series_string_columns():
    df = pd.DataFrame(
        {
            "district": ["Hay Hassani"],
            "geometry": [_poly(0, 0)],
        }
    )
    out = preprocess_districts(df)
    assert isinstance(out["district_id"], pd.Series)
    assert isinstance(out["district_name"], pd.Series)
    assert out["district_id"].dtype.name == "string"
    assert out["district_name"].dtype.name == "string"
