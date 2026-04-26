from __future__ import annotations

import math
from typing import Any

import numpy as np
import pandas as pd


def _safe_number(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, (np.integer,)):
        return int(value)
    if isinstance(value, (np.floating, float)):
        f = float(value)
        if math.isfinite(f):
            return f
        return None
    if isinstance(value, (pd.Timestamp,)):
        return value.isoformat()
    if pd.isna(value):
        return None
    return value


def json_safe(data: Any) -> Any:
    if isinstance(data, dict):
        return {str(k): json_safe(v) for k, v in data.items()}
    if isinstance(data, (list, tuple, set)):
        return [json_safe(v) for v in data]
    if isinstance(data, pd.DataFrame):
        return [json_safe(row) for row in data.to_dict(orient="records")]
    return _safe_number(data)


def to_records(df: pd.DataFrame, drop_geometry: bool = True) -> list[dict[str, Any]]:
    frame = df.copy()
    if drop_geometry and "geometry" in frame.columns:
        frame = frame.drop(columns=["geometry"])
    return json_safe(frame.to_dict(orient="records"))
