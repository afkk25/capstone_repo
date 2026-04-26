from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd

from core.equity import compute_equity
from core.modeling import load_model, predict
from core.simulation import apply_intervention
from routers.cities import _load_city_geo, ensure_baseline_data
from services.analytics import compare_scenarios, compute_summary_metrics, rank_underserved_districts
from services.notebook_bridge.loaders import (
    CityDataNotFoundError,
    load_notebook_district_summary,
    load_notebook_origin_metrics,
)

DEFAULT_MAX_TIME_MIN = 45.0


def _safe_numeric(df: pd.DataFrame, cols: list[str]) -> pd.DataFrame:
    out = df.copy()
    for c in cols:
        if c in out.columns:
            out[c] = pd.to_numeric(out[c], errors="coerce")
    return out


def _build_facility_rows_from_baseline(city_id: str) -> pd.DataFrame:
    """
    Build facility-level baseline rows from existing backend artifacts.
    This mirrors existing app behavior and keeps notebook-bridge outputs compatible.
    """
    features_df, scores = ensure_baseline_data(city_id)
    rows = features_df.copy().reset_index(drop=True)
    rows["accessibility_score"] = pd.Series(scores).astype(float).to_numpy()
    if "population" not in rows.columns:
        rows["population"] = 1.0
    return rows


def load_city_analysis_inputs(city_id: str) -> dict[str, pd.DataFrame]:
    """
    Load notebook-compatible analysis inputs with graceful fallback:
    - preferred: notebook interim/final outputs
    - fallback: backend baseline facility artifact
    """
    origins_df: pd.DataFrame | None = None
    district_df: pd.DataFrame | None = None

    try:
        origins_df = load_notebook_origin_metrics(city_id)
    except CityDataNotFoundError:
        origins_df = None

    try:
        district_df = load_notebook_district_summary(city_id)
    except CityDataNotFoundError:
        district_df = None

    baseline_df = _build_facility_rows_from_baseline(city_id)
    return {
        "origins": origins_df if origins_df is not None else pd.DataFrame(),
        "districts": district_df if district_df is not None else pd.DataFrame(),
        "baseline": baseline_df,
    }


def get_baseline_metrics(city_id: str) -> dict[str, Any]:
    """
    Return baseline summary metrics aligned with notebook outputs.
    Uses origin-level notebook data when available, otherwise facility-level fallback.
    """
    inputs = load_city_analysis_inputs(city_id)
    origin_df = inputs["origins"]
    source_df = origin_df if not origin_df.empty else inputs["baseline"]

    source_df = _safe_numeric(
        source_df,
        [
            "total_travel_time_min",
            "accessibility_score",
            "population",
            "walk_time_to_stop_min",
            "score_2sfca",
        ],
    )

    if "travel_time_min" not in source_df.columns and "total_travel_time_min" in source_df.columns:
        source_df = source_df.rename(columns={"total_travel_time_min": "travel_time_min"})

    summary = compute_summary_metrics(source_df)
    return {"city_id": city_id, "summary": summary}


def get_district_analysis(city_id: str) -> dict[str, Any]:
    """
    Return district-level analysis table.
    If notebook district summary exists, use it directly to preserve methodology.
    Otherwise, derive ranking from baseline rows.
    """
    inputs = load_city_analysis_inputs(city_id)
    district_df = inputs["districts"].copy()
    if not district_df.empty:
        district_df = _safe_numeric(
            district_df,
            [
                "population_raster",
                "origin_count",
                "avg_walk_time_to_stop_min_pw",
                "avg_total_travel_time_min_pw",
                "pop_weighted_accessibility_score",
                "pop_weighted_score_2sfca",
                "pct_pop_access_30min",
                "pct_pop_score_below_50",
            ],
        )
        if "rank" not in district_df.columns and "pop_weighted_accessibility_score" in district_df.columns:
            district_df = district_df.sort_values("pop_weighted_accessibility_score", ascending=True).reset_index(drop=True)
            district_df["rank"] = np.arange(1, len(district_df) + 1)
        return {"city_id": city_id, "rows": district_df.to_dict(orient="records")}

    ranking = rank_underserved_districts(inputs["baseline"])
    return {"city_id": city_id, "rows": ranking}


def get_equity_metrics(city_id: str) -> dict[str, Any]:
    """
    Compute equity metrics from baseline facility data using existing backend equity logic.
    """
    rows = _build_facility_rows_from_baseline(city_id)
    scores = pd.to_numeric(rows["accessibility_score"], errors="coerce").fillna(0.0).to_numpy(dtype=float)
    equity = compute_equity(rows, scores)
    return {"city_id": city_id, "equity": equity}


def get_accessibility_distribution(city_id: str, bins: int = 20) -> dict[str, Any]:
    """
    Build accessibility-score distribution bins suitable for frontend histogram charts.
    """
    inputs = load_city_analysis_inputs(city_id)
    source_df = inputs["origins"] if not inputs["origins"].empty else inputs["baseline"]
    if source_df.empty or "accessibility_score" not in source_df.columns:
        return {"city_id": city_id, "bins": [], "total_count": 0}

    scores = pd.to_numeric(source_df["accessibility_score"], errors="coerce").dropna().clip(lower=0.0)
    if scores.empty:
        return {"city_id": city_id, "bins": [], "total_count": 0}

    hist, edges = np.histogram(scores.to_numpy(dtype=float), bins=bins)
    out_bins = []
    for idx, count in enumerate(hist):
        out_bins.append(
            {
                "bin_left": float(edges[idx]),
                "bin_right": float(edges[idx + 1]),
                "count": int(count),
            }
        )
    return {"city_id": city_id, "bins": out_bins, "total_count": int(scores.shape[0])}


def compare_baseline_and_simulation(city_id: str, simulation_payload: dict[str, Any]) -> dict[str, Any]:
    """
    Compare baseline and simulated outcomes using notebook-compatible scenario parameters.
    """
    features_df, baseline_scores = ensure_baseline_data(city_id)
    _, healthcare_gdf, _ = _load_city_geo(city_id)
    model, feature_names, _ = load_model(city_id)

    scenario = {
        "stop_density_multiplier": float(simulation_payload.get("stop_density_multiplier", 1.0)),
        "reduce_nearest_stop_distance_pct": float(simulation_payload.get("reduce_nearest_stop_distance_pct", 0.0)),
        "add_facilities": int(simulation_payload.get("add_facilities", 0)),
        "facility_locations": simulation_payload.get("facility_locations", []),
        "transport_stop_locations": simulation_payload.get("transport_stop_locations", []),
        "existing_facility_locations": [
            {"latitude": float(row["latitude"]), "longitude": float(row["longitude"])}
            for _, row in healthcare_gdf.reset_index(drop=True).iterrows()
        ],
    }
    simulated_df, _ = apply_intervention(features_df, scenario, baseline_scores)
    simulated_scores = predict(model, simulated_df, feature_names)

    baseline_rows = features_df.copy().reset_index(drop=True)
    simulated_rows = simulated_df.copy().reset_index(drop=True)
    baseline_rows["accessibility_score"] = pd.Series(baseline_scores).astype(float).to_numpy()
    simulated_rows["accessibility_score"] = pd.Series(simulated_scores).astype(float).to_numpy()

    comparison = compare_scenarios(baseline_rows, simulated_rows)
    ranking_before = rank_underserved_districts(baseline_rows)
    ranking_after = rank_underserved_districts(simulated_rows)

    before_map = {row["district"]: row["avg_accessibility_score"] for row in ranking_before}
    after_map = {row["district"]: row["avg_accessibility_score"] for row in ranking_after}
    districts_improved = sum(1 for d, score in before_map.items() if d in after_map and after_map[d] > score)

    base_summary = compute_summary_metrics(baseline_rows)
    sim_summary = compute_summary_metrics(simulated_rows)
    population_affected = float(max(0.0, base_summary["underserved_population"] - sim_summary["underserved_population"]))

    return {
        "city_id": city_id,
        "scenario": scenario,
        "comparison": comparison,
        "districts_improved": int(districts_improved),
        "districts_total": int(len(before_map)),
        "population_affected": population_affected,
        "ranking_before": ranking_before,
        "ranking_after": ranking_after,
    }

