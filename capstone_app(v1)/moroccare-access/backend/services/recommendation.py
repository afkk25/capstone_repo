from __future__ import annotations

from typing import Any

import pandas as pd

from utils.metrics import gini_coefficient


def rank_underserved_areas(rows: pd.DataFrame) -> list[dict[str, Any]]:
    if rows is None or rows.empty:
        return []
    frame = rows.copy()
    if "commune_name" not in frame.columns:
        frame["commune_name"] = frame.get("district_name", "Unknown")
    if "district_name" not in frame.columns:
        frame["district_name"] = frame["commune_name"]
    if "population" not in frame.columns:
        frame["population"] = 0.0
    frame["accessibility_score"] = pd.to_numeric(frame.get("accessibility_score"), errors="coerce").fillna(0.0)
    frame["population"] = pd.to_numeric(frame.get("population"), errors="coerce").fillna(0.0).clip(lower=0.0)

    grouped = (
        frame.groupby(["commune_name", "district_name"], dropna=False)
        .apply(
            lambda g: pd.Series(
                {
                    "commune_name": str(g["commune_name"].iloc[0]),
                    "district_name": str(g["district_name"].iloc[0]),
                    "population": float(g["population"].sum()),
                    "avg_accessibility_score": float((g["accessibility_score"] * g["population"]).sum() / max(g["population"].sum(), 1.0)),
                    "underserved_population": float(g.loc[g["accessibility_score"] < 50.0, "population"].sum()),
                }
            )
        )
        .reset_index(drop=True)
        .sort_values(["avg_accessibility_score", "underserved_population"], ascending=[True, False])
    )
    return grouped.to_dict(orient="records")


def recommend_best_intervention(simulation_results: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not simulation_results:
        return []

    ranked: list[dict[str, Any]] = []
    for item in simulation_results:
        scenario_name = str(item.get("scenario", item.get("scenario_type", "unknown")))
        baseline_df = pd.DataFrame(item.get("baseline_rows", []))
        simulated_df = pd.DataFrame(item.get("simulated_rows", []))
        if baseline_df.empty or simulated_df.empty:
            continue

        base_scores = pd.to_numeric(baseline_df.get("accessibility_score"), errors="coerce").fillna(0.0)
        sim_scores = pd.to_numeric(simulated_df.get("accessibility_score"), errors="coerce").fillna(0.0)
        base_pop = pd.to_numeric(baseline_df.get("population"), errors="coerce").fillna(0.0).clip(lower=0.0)
        sim_pop = pd.to_numeric(simulated_df.get("population"), errors="coerce").fillna(0.0).clip(lower=0.0)

        merged = baseline_df.merge(simulated_df, on="origin_id", how="inner", suffixes=("_before", "_after"))
        before = pd.to_numeric(merged.get("accessibility_score_before"), errors="coerce").fillna(0.0)
        after = pd.to_numeric(merged.get("accessibility_score_after"), errors="coerce").fillna(0.0)
        pop = pd.to_numeric(merged.get("population_after", merged.get("population_before", 0.0)), errors="coerce").fillna(0.0).clip(lower=0.0)

        commune_improvement = float(((after - before) * pop).sum() / max(pop.sum(), 1.0))
        inequality_reduction = float(gini_coefficient(base_scores) - gini_coefficient(sim_scores))
        improved_population = float(pop[after > before + 0.5].sum())
        total_population = float(sim_pop.sum()) if float(sim_pop.sum()) > 0 else float(base_pop.sum())
        population_impact_share = improved_population / max(total_population, 1.0)

        composite = 0.5 * commune_improvement + 0.3 * inequality_reduction + 0.2 * population_impact_share
        ranked.append(
            {
                "scenario": scenario_name,
                "commune_improvement": commune_improvement,
                "inequality_reduction": inequality_reduction,
                "population_impact": improved_population,
                "population_impact_share": population_impact_share,
                "score": composite,
                "explanation": (
                    f"{scenario_name}: commune improvement {commune_improvement:.2f} points, "
                    f"inequality reduction {inequality_reduction:.3f}, "
                    f"population impact share {population_impact_share:.3f}."
                ),
            }
        )

    ranked.sort(key=lambda x: x["score"], reverse=True)
    for idx, row in enumerate(ranked[:3], start=1):
        row["rank"] = idx
    return ranked[:3]
