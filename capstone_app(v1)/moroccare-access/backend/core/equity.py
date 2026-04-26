from __future__ import annotations

import numpy as np
import pandas as pd


def compute_gini(scores: list[float]) -> float:
    """Compute Gini coefficient from a list of scores. 0 = perfect equality."""
    n = len(scores)
    if n == 0:
        return 0.0
    total = float(sum(scores))
    if total == 0.0:
        return 0.0
    sorted_scores = sorted(scores)
    cumulative = sum((i + 1) * s for i, s in enumerate(sorted_scores))
    return float((2 * cumulative) / (n * total) - (n + 1) / n)


def _dominant_lever(row: pd.Series) -> tuple[str, str]:
    if row["transport_rank"] <= row["supply_rank"] and row["transport_rank"] <= row["baseline_rank"]:
        return "transport", "Improve stop density and first/last-mile connectivity."
    if row["supply_rank"] <= row["transport_rank"] and row["supply_rank"] <= row["baseline_rank"]:
        return "supply", "Increase nearby healthcare capacity and facility coverage."
    return "baseline", "Deploy combined social and infrastructure support."


def compute_equity(features_df: pd.DataFrame, scores: np.ndarray) -> dict:
    if features_df.empty:
        return {
            "ring_summary": {ring: {"mean": 0.0, "median": 0.0, "count": 0} for ring in ["Inner", "Middle", "Outer"]},
            "threshold_25": 0.0,
            "below_threshold_by_ring": {ring: 0.0 for ring in ["Inner", "Middle", "Outer"]},
            "vulnerability_scores": [],
            "priority_table": [],
            "population_available": False,
            "gini_coefficient": 0.0,
            "dominant_lever": "Deploy combined social and infrastructure support.",
            "weighted_ring_summary": None,
            "weighted_inequality": None,
        }

    df = features_df.copy().reset_index(drop=True)
    df["baseline_score"] = np.clip(scores, 0, 1)
    score_list = [float(x) for x in df["baseline_score"].to_list()]
    population_available = "population" in df.columns
    if population_available:
        pop_series = pd.to_numeric(df["population"], errors="coerce").fillna(0.0).clip(lower=0.0)
        if float(pop_series.sum()) <= 0.0:
            population_available = False
    else:
        pop_series = pd.Series([0.0] * len(df), index=df.index, dtype=float)

    ring_summary: dict[str, dict] = {}
    threshold_25 = float(np.percentile(df["baseline_score"], 25))
    below_threshold_by_ring: dict[str, float] = {}

    for ring in ["Inner", "Middle", "Outer"]:
        ring_df = df[df["urban_ring"] == ring]
        if ring_df.empty:
            ring_summary[ring] = {"mean": 0.0, "median": 0.0, "count": 0}
            below_threshold_by_ring[ring] = 0.0
        else:
            ring_summary[ring] = {
                "mean": float(ring_df["baseline_score"].mean()),
                "median": float(ring_df["baseline_score"].median()),
                "count": int(len(ring_df)),
            }
            below_threshold_by_ring[ring] = float((ring_df["baseline_score"] < threshold_25).mean() * 100.0)

    weighted_ring_summary: dict[str, dict] | None = None
    if population_available:
        weighted_ring_summary = {}
        for ring in ["Inner", "Middle", "Outer"]:
            ring_df = df[df["urban_ring"] == ring]
            if ring_df.empty:
                weighted_ring_summary[ring] = {"weighted_mean": 0.0, "population_sum": 0.0}
                continue
            ring_pop = pd.to_numeric(ring_df.get("population", 0.0), errors="coerce").fillna(0.0).clip(lower=0.0)
            pop_sum = float(ring_pop.sum())
            if pop_sum <= 0.0:
                weighted_ring_summary[ring] = {"weighted_mean": 0.0, "population_sum": 0.0}
                continue
            weighted_mean = float((ring_df["baseline_score"] * ring_pop).sum() / pop_sum)
            weighted_ring_summary[ring] = {"weighted_mean": weighted_mean, "population_sum": pop_sum}

    if "healthcare_density_1km" not in df.columns:
        df["healthcare_density_1km"] = 0.0
    if "distance_to_nearest_stop_m" not in df.columns:
        df["distance_to_nearest_stop_m"] = 0.0
    if "urban_ring" not in df.columns:
        df["urban_ring"] = "Unknown"

    df["baseline_rank"] = 1.0 - df["baseline_score"].rank(pct=True, ascending=True)
    df["supply_rank"] = 1.0 - pd.to_numeric(df["healthcare_density_1km"], errors="coerce").fillna(0.0).rank(pct=True, ascending=True)
    inv_transport = 1.0 / pd.to_numeric(df["distance_to_nearest_stop_m"], errors="coerce").fillna(0.0).clip(lower=1e-6)
    df["transport_rank"] = 1.0 - inv_transport.rank(pct=True, ascending=True)
    df["vulnerability_score"] = df["baseline_rank"] * 0.5 + df["supply_rank"] * 0.3 + df["transport_rank"] * 0.2

    if population_available:
        df["population_weighted_vulnerability"] = df["vulnerability_score"] * pop_series
        weighted_inequality = float((df["population_weighted_vulnerability"]).sum() / float(pop_series.sum()))
    else:
        df["population_weighted_vulnerability"] = None
        weighted_inequality = None

    priority_df = df.sort_values("vulnerability_score", ascending=False).reset_index(drop=True)
    priority_table: list[dict] = []
    dominant_lever = "Deploy combined social and infrastructure support."
    label_col = "origin_name" if "origin_name" in priority_df.columns else ("facility" if "facility" in priority_df.columns else None)
    for idx, row in priority_df.iterrows():
        lever, action = _dominant_lever(row)
        if idx == 0:
            dominant_lever = action
        label = str(row[label_col]) if label_col else f"row_{idx + 1}"
        priority_table.append(
            {
                "priority_rank": int(idx + 1),
                "facility": label,
                "urban_ring": str(row["urban_ring"]),
                "baseline_score": float(row["baseline_score"]),
                "vulnerability_score": float(row["vulnerability_score"]),
                "dominant_lever": lever,
                "recommended_action": action,
            }
        )

    return {
        "ring_summary": ring_summary,
        "threshold_25": threshold_25,
        "below_threshold_by_ring": below_threshold_by_ring,
        "vulnerability_scores": [float(x) for x in df["vulnerability_score"].to_list()],
        "priority_table": priority_table,
        "population_available": population_available,
        "gini_coefficient": compute_gini(score_list),
        "dominant_lever": dominant_lever,
        "weighted_ring_summary": weighted_ring_summary if population_available else None,
        "weighted_inequality": weighted_inequality,
    }
