from __future__ import annotations

from typing import Any

import pandas as pd

from services.analytics import compute_summary_metrics, rank_underserved_districts
from utils.metrics import gini_coefficient


def _district_improvement_score(baseline_df: pd.DataFrame, simulated_df: pd.DataFrame) -> float:
    base_rank = rank_underserved_districts(baseline_df)
    sim_rank = rank_underserved_districts(simulated_df)
    if not base_rank or not sim_rank:
        return 0.0

    base_map = {r["district"]: r for r in base_rank}
    sim_map = {r["district"]: r for r in sim_rank}
    common = [d for d in base_map.keys() if d in sim_map]
    if not common:
        return 0.0

    # Improvement in worst districts: baseline underserved% - simulated underserved%
    diffs = [float(base_map[d]["underserved_pct"] - sim_map[d]["underserved_pct"]) for d in common]
    return float(sum(diffs) / len(diffs))


def recommend_best_intervention(simulation_results: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """
    Rank interventions by district improvement, inequality reduction, and population impact.
    Returns top 3 recommendations with short explanation text.
    """
    if not simulation_results:
        return []

    ranked: list[dict[str, Any]] = []
    for item in simulation_results:
        scenario_name = str(item.get("scenario", "unknown"))
        baseline_df = pd.DataFrame(item.get("baseline_rows", []))
        simulated_df = pd.DataFrame(item.get("simulated_rows", []))
        if baseline_df.empty or simulated_df.empty:
            continue

        base_summary = compute_summary_metrics(baseline_df)
        sim_summary = compute_summary_metrics(simulated_df)

        base_scores = pd.to_numeric(
            baseline_df["accessibility_score"] if "accessibility_score" in baseline_df.columns else baseline_df.get("baseline_score", 0.0),
            errors="coerce",
        ).fillna(0.0)
        sim_scores = pd.to_numeric(
            simulated_df["accessibility_score"] if "accessibility_score" in simulated_df.columns else simulated_df.get("simulated_score", 0.0),
            errors="coerce",
        ).fillna(0.0)

        district_gain = _district_improvement_score(baseline_df, simulated_df)
        inequality_gain = gini_coefficient(base_scores) - gini_coefficient(sim_scores)
        pop_impact = max(0.0, base_summary["underserved_population"] - sim_summary["underserved_population"])

        composite = district_gain * 0.5 + inequality_gain * 0.3 + pop_impact * 0.2
        explanation = (
            f"{scenario_name}: underserved districts improved by {district_gain:.2f} pts, "
            f"inequality change {inequality_gain:.3f}, underserved population reduced by {pop_impact:.1f}."
        )
        ranked.append(
            {
                "scenario": scenario_name,
                "district_improvement": float(district_gain),
                "inequality_reduction": float(inequality_gain),
                "population_impact": float(pop_impact),
                "score": float(composite),
                "explanation": explanation,
            }
        )

    ranked.sort(key=lambda x: x["score"], reverse=True)
    top3 = ranked[:3]
    for idx, row in enumerate(top3, start=1):
        row["rank"] = idx
    return top3
