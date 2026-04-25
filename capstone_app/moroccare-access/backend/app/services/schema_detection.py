from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import pandas as pd


@dataclass(frozen=True)
class DetectionResult:
    file_type: str | None
    required_columns: list[str]
    found_columns: list[str]
    missing_columns: list[str]
    warnings: list[str]


REQUIREMENTS = {
    "origins": ["origin_id", "x", "y", "population"],
    "facilities": ["name", "latitude", "longitude"],
    "stops": ["latitude", "longitude"],
    "route_stops": ["stop_key", "x", "y"],
    "route_vertices": ["route_id", "vertex_order", "x", "y"],
    "districts": ["geometry"],
    "district_summary": ["district_id", "district_name", "population_raster", "origin_count"],
}


ALIASES = {
    "district": "district_name",
    "commune": "district_name",
    "accessibility_2sfca": "score_2sfca",
    "nearest_stop_id": "chosen_stop_key",
    "lines": "Lines",
}


def normalize_columns(columns: list[str]) -> list[str]:
    normalized = []
    for c in columns:
        key = c.strip()
        low = key.lower()
        mapped = ALIASES.get(low, key)
        normalized.append(mapped)
    return normalized


def normalize_df_columns(df: pd.DataFrame) -> pd.DataFrame:
    cols = []
    for c in df.columns:
        key = c.strip()
        low = key.lower()
        mapped = ALIASES.get(low, key)
        cols.append(mapped)
    df = df.copy()
    df.columns = cols
    return df


def detect_dataframe_type(df: pd.DataFrame, filename: str = "") -> DetectionResult:
    if df is None or df.empty:
        return DetectionResult(None, [], [], [], ["empty file"])
    frame = normalize_df_columns(df)
    cols = set(frame.columns)

    def score(req: list[str]) -> int:
        return sum(1 for c in req if c in cols)

    best_type = None
    best_score = -1
    for ft, req in REQUIREMENTS.items():
        s = score(req)
        if s > best_score:
            best_score = s
            best_type = ft

    req = REQUIREMENTS.get(best_type or "", [])
    found = [c for c in req if c in cols]
    missing = [c for c in req if c not in cols]
    warnings: list[str] = []

    lower = Path(filename).name.lower()
    if "district" in lower and best_type != "districts":
        warnings.append("filename suggests district layer but schema differs")
    if len(found) == 0:
        best_type = None

    return DetectionResult(best_type, req, found, missing, warnings)


def read_for_detection(path: Path) -> pd.DataFrame:
    suffix = path.suffix.lower()
    if suffix == ".csv":
        return pd.read_csv(path, nrows=2000)
    if suffix in {".geojson", ".json"}:
        return pd.read_json(path)
    raise ValueError(f"Unsupported file type for detection: {path.name}")
