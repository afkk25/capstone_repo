from typing import Any

import numpy as np
import pandas as pd

from app.services.city_store import city_dir, read_city_metadata, get_city_status
from app.services.origin_metrics import prepare_origin_metrics

def safe_number(value):
    if value is None:
        return None
    try:
        number = float(value)
        if not np.isfinite(number):
            return None
        return number
    except Exception:
        return None


def weighted_mean(values: pd.Series, weights: pd.Series) -> float | None:
    values = pd.to_numeric(values, errors="coerce")
    weights = pd.to_numeric(weights, errors="coerce").fillna(0)

    mask = values.notna() & weights.notna() & (weights > 0)

    if not mask.any():
        return None

    total_weight = weights[mask].sum()
    if total_weight <= 0:
        return None

    return float((values[mask] * weights[mask]).sum() / total_weight)


def weighted_share(mask: pd.Series, weights: pd.Series) -> float | None:
    weights = pd.to_numeric(weights, errors="coerce").fillna(0)
    mask = pd.Series(mask, index=weights.index).fillna(False).astype(bool)

    valid = weights > 0
    if not valid.any():
        return None

    total_weight = weights[valid].sum()
    if total_weight <= 0:
        return None

    selected_weight = weights[valid & mask].sum()
    return float(selected_weight / total_weight * 100)


def first_existing_column(df: pd.DataFrame, candidates: list[str]) -> str | None:
    for col in candidates:
        if col in df.columns:
            return col
    return None


def normalize_score_to_100(score: pd.Series) -> pd.Series:
    score = pd.to_numeric(score, errors="coerce")

    if score.notna().any() and score.max(skipna=True) <= 1.5:
        return score * 100

    return score


def compute_baseline(city_id: str) -> dict[str, Any]:
    folder = city_dir(city_id)
    metadata = read_city_metadata(city_id)
    status = get_city_status(city_id)

    if not status["baseline_ready"]:
        return {
            "city_id": metadata["city_id"],
            "city_name": metadata["city_name"],
            "analysis_unit": "commune",
            "readiness": status,
            "kpis": {},
            "message": "Baseline package is incomplete.",
        }

    origins_raw = pd.read_csv(folder / "origins.csv")
    healthcare = pd.read_csv(folder / "healthcare.csv")
    stops = pd.read_csv(folder / "transport_stops.csv")

    metrics = prepare_origin_metrics(city_id, origins_raw)
    origins = metrics.origins

    population = origins["population"]
    total_population = float(population.sum())

    travel_time = origins["baseline_time_min"]
    score = origins["baseline_score"]

    avg_time = weighted_mean(travel_time, population)
    avg_score = weighted_mean(score, population)

    within_60 = weighted_share(travel_time <= 60, population)
    within_30 = weighted_share(travel_time <= 30, population)
    coverage_gap = weighted_share(score < 50, population)

    return {
        "city_id": metadata["city_id"],
        "city_name": metadata["city_name"],
        "analysis_unit": "commune",
        "readiness": status,
        "kpis": {
            "population": safe_number(total_population),
            "facility_count": int(len(healthcare)),
            "transport_stop_count": int(len(stops)),
            "average_access_time_min": safe_number(avg_time),
            "average_accessibility_score": safe_number(avg_score),
            "pct_population_within_30_min": safe_number(within_30),
            "pct_population_within_60_min": safe_number(within_60),
            "coverage_gap_pct": safe_number(coverage_gap),
        },
        "warnings": metrics.warnings,
        "debug_columns_used": {
            "travel_time_col": metrics.travel_time_col,
            "score_col": metrics.score_col,
        },
    }