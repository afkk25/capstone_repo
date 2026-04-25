from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd

from utils.metrics import gini_coefficient, safe_mean

ACCESS_MAX_MIN = 45.0


def _score_threshold(scores: pd.Series) -> float:
    series = pd.to_numeric(scores, errors="coerce").dropna()
    if series.empty:
        return 0.5
    return 50.0 if float(series.max()) > 1.5 else 0.5


def _score_to_minutes(scores: pd.Series) -> pd.Series:
    """
    Convert accessibility score into a coarse travel-time proxy.
    Supports both [0,1] and [0,100] score scales.
    Higher score => lower time.
    """
    numeric = pd.to_numeric(scores, errors="coerce").fillna(0.0)
    if _score_threshold(numeric) >= 50.0:
        clipped = numeric.clip(lower=0.0, upper=100.0)
        return (1.0 - (clipped / 100.0)) * 60.0
    clipped = numeric.clip(lower=0.0, upper=1.0)
    return (1.0 - clipped) * 60.0


def compute_summary_metrics(data: pd.DataFrame | list[dict[str, Any]]) -> dict[str, float]:
    """Compute high-level planning metrics from facility-level rows."""
    df = pd.DataFrame(data).copy() if not isinstance(data, pd.DataFrame) else data.copy()
    if df.empty:
        return {
            "avg_travel_time": 0.0,
            "pct_above_45min": 0.0,
            "underserved_population": 0.0,
            "avg_accessibility_score": 0.0,
        }

    score_col = "accessibility_score" if "accessibility_score" in df.columns else "baseline_score"
    if score_col not in df.columns:
        df[score_col] = 0.0
    df[score_col] = pd.to_numeric(df[score_col], errors="coerce").fillna(0.0)

    if "travel_time_min" not in df.columns:
        df["travel_time_min"] = _score_to_minutes(df[score_col])
    else:
        df["travel_time_min"] = pd.to_numeric(df["travel_time_min"], errors="coerce").fillna(0.0)

    if "population" not in df.columns:
        df["population"] = 1.0
    df["population"] = pd.to_numeric(df["population"], errors="coerce").fillna(0.0).clip(lower=0.0)

    underserved_mask = df[score_col] < _score_threshold(df[score_col])
    return {
        "avg_travel_time": safe_mean(df["travel_time_min"]),
        "pct_above_45min": float((df["travel_time_min"] > ACCESS_MAX_MIN).mean() * 100.0),
        "underserved_population": float(df.loc[underserved_mask, "population"].sum()),
        "avg_accessibility_score": safe_mean(df[score_col]),
    }


def rank_underserved_districts(data: pd.DataFrame | list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Rank districts from worst to best accessibility."""
    df = pd.DataFrame(data).copy() if not isinstance(data, pd.DataFrame) else data.copy()
    if df.empty:
        return []

    if "analysis_unit" in df.columns and (df["analysis_unit"].astype(str) == "facility_proxy").all():
        district_col = None
    else:
        district_col = "district_name" if "district_name" in df.columns else "urban_ring"
    if district_col not in df.columns:
        district_col = None

    score_col = "accessibility_score" if "accessibility_score" in df.columns else "baseline_score"
    if score_col not in df.columns:
        df[score_col] = 0.0
    df[score_col] = pd.to_numeric(df[score_col], errors="coerce").fillna(0.0)

    pop_col = "population" if "population" in df.columns else None
    if pop_col is None:
        df["population"] = 1.0
        pop_col = "population"
    df[pop_col] = pd.to_numeric(df[pop_col], errors="coerce").fillna(0.0).clip(lower=0.0)

    if district_col is None:
        threshold = _score_threshold(df[score_col])
        rows = [
            {
                "district": "all",
                "avg_accessibility_score": safe_mean(df[score_col]),
                "underserved_pct": float((df[score_col] < threshold).mean() * 100.0),
                "population": float(df[pop_col].sum()),
                "rank": 1,
            }
        ]
        return rows

    threshold = _score_threshold(df[score_col])

    def _weighted_mean(values: pd.Series, weights: pd.Series) -> float:
        numeric_values = pd.to_numeric(values, errors="coerce").to_numpy(dtype=float)
        numeric_weights = pd.to_numeric(weights, errors="coerce").fillna(0.0).clip(lower=0.0).to_numpy(dtype=float)
        mask = np.isfinite(numeric_values) & np.isfinite(numeric_weights) & (numeric_weights > 0)
        if mask.sum() == 0:
            return safe_mean(pd.Series(numeric_values))
        return float(np.average(numeric_values[mask], weights=numeric_weights[mask]))

    grouped = (
        df.groupby(district_col, dropna=False)
        .apply(
            lambda g: pd.Series(
                {
                    "avg_accessibility_score": _weighted_mean(g[score_col], g[pop_col]),
                    "underserved_pct": float(
                        (
                            pd.to_numeric(g.loc[g[score_col] < threshold, pop_col], errors="coerce").fillna(0.0).sum()
                            / max(pd.to_numeric(g[pop_col], errors="coerce").fillna(0.0).sum(), 1e-9)
                        )
                        * 100.0
                    ),
                    "population": float(g[pop_col].sum()),
                }
            )
        )
        .reset_index()
        .rename(columns={district_col: "district"})
    )

    grouped = grouped.sort_values(["avg_accessibility_score", "underserved_pct"], ascending=[True, False]).reset_index(drop=True)
    grouped["rank"] = np.arange(1, len(grouped) + 1)
    return grouped.to_dict(orient="records")


def compare_scenarios(baseline: pd.DataFrame, simulated: pd.DataFrame) -> dict[str, float]:
    """Compare baseline and simulated outputs with deltas and inequality change."""
    base = baseline.copy()
    sim = simulated.copy()

    base_score_col = "accessibility_score" if "accessibility_score" in base.columns else "baseline_score"
    sim_score_col = "accessibility_score" if "accessibility_score" in sim.columns else "simulated_score"
    if base_score_col not in base.columns:
        base[base_score_col] = 0.0
    if sim_score_col not in sim.columns:
        sim[sim_score_col] = 0.0

    base_scores = pd.to_numeric(base[base_score_col], errors="coerce").fillna(0.0)
    sim_scores = pd.to_numeric(sim[sim_score_col], errors="coerce").fillna(0.0)

    if "travel_time_min" in base.columns:
        base_travel = pd.to_numeric(base["travel_time_min"], errors="coerce").fillna(_score_to_minutes(base_scores))
    else:
        base_travel = _score_to_minutes(base_scores)
    if "travel_time_min" in sim.columns:
        sim_travel = pd.to_numeric(sim["travel_time_min"], errors="coerce").fillna(_score_to_minutes(sim_scores))
    else:
        sim_travel = _score_to_minutes(sim_scores)

    base_mean_score = safe_mean(base_scores)
    sim_mean_score = safe_mean(sim_scores)
    base_mean_time = safe_mean(base_travel)
    sim_mean_time = safe_mean(sim_travel)

    delta_access = sim_mean_score - base_mean_score
    delta_travel = sim_mean_time - base_mean_time
    inequality_change = gini_coefficient(base_scores) - gini_coefficient(sim_scores)
    improvement_pct = 0.0 if base_mean_score <= 0 else float((delta_access / base_mean_score) * 100.0)

    return {
        "delta_travel_time": float(delta_travel),
        "delta_accessibility": float(delta_access),
        "improvement_percentage": float(improvement_pct),
        "inequality_change": float(inequality_change),
    }
