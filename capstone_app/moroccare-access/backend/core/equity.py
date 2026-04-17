from __future__ import annotations

import numpy as np
import pandas as pd


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
        }

    df = features_df.copy().reset_index(drop=True)
    df["baseline_score"] = np.clip(scores, 0, 1)

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

    df["baseline_rank"] = 1.0 - df["baseline_score"].rank(pct=True, ascending=True)
    df["supply_rank"] = 1.0 - df["healthcare_density_1km"].rank(pct=True, ascending=True)
    inv_transport = 1.0 / df["distance_to_nearest_stop_m"].clip(lower=1e-6)
    df["transport_rank"] = 1.0 - inv_transport.rank(pct=True, ascending=True)
    df["vulnerability_score"] = df["baseline_rank"] * 0.5 + df["supply_rank"] * 0.3 + df["transport_rank"] * 0.2

    priority_df = df.sort_values("vulnerability_score", ascending=False).reset_index(drop=True)
    priority_table: list[dict] = []
    for idx, row in priority_df.iterrows():
        lever, action = _dominant_lever(row)
        priority_table.append(
            {
                "priority_rank": int(idx + 1),
                "facility": str(row["facility"]),
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
    }
