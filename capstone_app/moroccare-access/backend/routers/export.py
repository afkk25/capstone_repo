from __future__ import annotations

import io

import pandas as pd
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from reportlab.lib import colors

from core.equity import compute_equity
from core.modeling import load_model, predict
from core.simulation import apply_intervention
from routers.cities import ensure_baseline_data
from services.analytics import compare_scenarios, compute_summary_metrics
from services.cache import clear_city_cache
from services.recommendation import recommend_best_intervention

router = APIRouter(tags=["export"], prefix="/api")

SCENARIOS = {
    "baseline": {},
    "transport_plus": {"stop_density_multiplier": 1.2},
    "walkability_plus": {"reduce_nearest_stop_distance_pct": 0.15},
    "facility_plus": {"add_facilities": 1},
    "combined": {
        "stop_density_multiplier": 1.2,
        "reduce_nearest_stop_distance_pct": 0.15,
        "add_facilities": 1,
    },
}


@router.get("/cities/{city_id}/export")
def export_city(city_id: str, format: str = Query(...)):
    clear_city_cache(city_id)
    fmt = format.lower()
    if fmt not in {"pdf", "excel"}:
        raise HTTPException(status_code=400, detail="format must be 'pdf' or 'excel'")

    try:
        baseline_df, baseline_scores = ensure_baseline_data(city_id)
        model, feature_names, _ = load_model(city_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"City '{city_id}' not found")

    equity = compute_equity(baseline_df, baseline_scores)
    ring_summary_df = pd.DataFrame(
        [{"ring": k, **v} for k, v in equity["ring_summary"].items()],
        columns=["ring", "mean", "median", "count"],
    )
    priority_df = pd.DataFrame(equity["priority_table"]).head(10)

    scenario_rows = []
    baseline_mean = float(pd.Series(baseline_scores).mean()) if len(baseline_scores) else 0.0
    for name, scenario in SCENARIOS.items():
        if name == "baseline":
            score_mean = baseline_mean
        else:
            simulated_df = apply_intervention(baseline_df, scenario)
            simulated_scores = predict(model, simulated_df, feature_names)
            score_mean = float(pd.Series(simulated_scores).mean()) if len(simulated_scores) else 0.0
        scenario_rows.append(
            {
                "scenario": name,
                "mean_accessibility": score_mean,
                "delta_vs_baseline": score_mean - baseline_mean,
            }
        )
    scenario_df = pd.DataFrame(scenario_rows)

    # Build baseline/simulation summary and recommendations once for both PDF/Excel exports.
    baseline_rows = baseline_df.copy().reset_index(drop=True)
    baseline_rows["accessibility_score"] = pd.Series(baseline_scores).astype(float).to_numpy()
    baseline_summary = compute_summary_metrics(baseline_rows)

    combined_df = apply_intervention(
        baseline_df,
        {"stop_density_multiplier": 1.2, "reduce_nearest_stop_distance_pct": 0.15, "add_facilities": 1},
    )
    combined_scores = predict(model, combined_df, feature_names)
    combined_rows = combined_df.copy().reset_index(drop=True)
    combined_rows["accessibility_score"] = pd.Series(combined_scores).astype(float).to_numpy()
    comparison_summary = compare_scenarios(baseline_rows, combined_rows)

    rec_input = [
        {
            "scenario": row["scenario"],
            "baseline_rows": baseline_rows.to_dict(orient="records"),
            "simulated_rows": (
                baseline_rows.to_dict(orient="records")
                if row["scenario"] == "baseline"
                else apply_intervention(baseline_df, SCENARIOS[row["scenario"]])
                .assign(
                    accessibility_score=lambda df: predict(model, df, feature_names)
                )
                .to_dict(orient="records")
            ),
        }
        for row in scenario_rows
    ]
    recommendations = recommend_best_intervention(rec_input)
    recommendations_df = pd.DataFrame(recommendations)

    if fmt == "excel":
        output = io.BytesIO()
        with pd.ExcelWriter(output, engine="openpyxl") as writer:
            pd.DataFrame([{"city_id": city_id, "facilities_count": int(len(baseline_df))}]).to_excel(
                writer, index=False, sheet_name="city_summary"
            )
            pd.DataFrame([baseline_summary]).to_excel(writer, index=False, sheet_name="baseline_summary")
            pd.DataFrame([comparison_summary]).to_excel(writer, index=False, sheet_name="simulation_summary")
            ring_summary_df.to_excel(writer, index=False, sheet_name="equity")
            priority_df.to_excel(writer, index=False, sheet_name="priority_top10")
            scenario_df.to_excel(writer, index=False, sheet_name="scenario_comparison")
            recommendations_df.to_excel(writer, index=False, sheet_name="recommendations")
        output.seek(0)
        return StreamingResponse(
            output,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f'attachment; filename="{city_id}_planning_report.xlsx"'},
        )

    output = io.BytesIO()
    c = canvas.Canvas(output, pagesize=A4)
    _, height = A4
    y = height - 40
    c.setFont("Helvetica-Bold", 16)
    c.drawString(40, y, "MorocCare Planning Report")
    y -= 30
    c.setFont("Helvetica", 11)
    c.drawString(40, y, f"City: {city_id}")
    y -= 20
    c.drawString(40, y, f"Facilities: {len(baseline_df)}")
    y -= 30
    c.setFont("Helvetica-Bold", 12)
    c.drawString(40, y, "Baseline Summary")
    y -= 20
    c.setFont("Helvetica", 10)
    c.drawString(
        40,
        y,
        (
            f"Avg travel={baseline_summary['avg_travel_time']:.2f} min, "
            f"Above 45 min={baseline_summary['pct_above_45min']:.1f}%, "
            f"Avg score={baseline_summary['avg_accessibility_score']:.3f}"
        ),
    )
    y -= 16
    c.drawString(40, y, f"Underserved population={baseline_summary['underserved_population']:.1f}")
    y -= 24

    c.setFont("Helvetica-Bold", 12)
    c.drawString(40, y, "Equity Table (Ring Summary)")
    y -= 20
    c.setFont("Helvetica", 10)
    for _, row in ring_summary_df.iterrows():
        line = f"{row['ring']}: mean={row['mean']:.3f}, median={row['median']:.3f}, count={int(row['count'])}"
        c.drawString(40, y, line)
        y -= 15

    y -= 10
    c.setFont("Helvetica-Bold", 12)
    c.drawString(40, y, "Priority Table (Top 10)")
    y -= 20
    c.setFont("Helvetica", 9)
    for _, row in priority_df.iterrows():
        line = f"#{int(row['priority_rank'])} {row['facility']} [{row['urban_ring']}] vuln={row['vulnerability_score']:.3f}"
        c.drawString(40, y, line)
        y -= 12
        if y < 70:
            c.showPage()
            y = height - 40
            c.setFont("Helvetica", 9)

    y -= 10
    c.setFont("Helvetica-Bold", 12)
    c.drawString(40, y, "Scenario Comparison")
    y -= 20
    c.setFont("Helvetica", 10)
    for _, row in scenario_df.iterrows():
        line = f"{row['scenario']}: mean={row['mean_accessibility']:.3f}, delta={row['delta_vs_baseline']:.3f}"
        c.drawString(40, y, line)
        y -= 14
        if y < 70:
            c.showPage()
            y = height - 40
            c.setFont("Helvetica", 10)

    y -= 10
    c.setFont("Helvetica-Bold", 12)
    c.drawString(40, y, "Simulation Impact Summary")
    y -= 20
    c.setFont("Helvetica", 10)
    c.drawString(
        40,
        y,
        (
            f"Delta travel time={comparison_summary['delta_travel_time']:.2f}, "
            f"Delta accessibility={comparison_summary['delta_accessibility']:.3f}, "
            f"Improvement={comparison_summary['improvement_percentage']:.2f}%"
        ),
    )
    y -= 16
    c.drawString(40, y, f"Inequality change={comparison_summary['inequality_change']:.3f}")
    y -= 24

    c.setFont("Helvetica-Bold", 12)
    c.drawString(40, y, "Recommendations")
    y -= 20
    c.setFont("Helvetica", 9)
    if recommendations:
        for row in recommendations[:3]:
            c.setFillColor(colors.black)
            c.drawString(40, y, f"#{row['rank']} {row['scenario']} (score={row['score']:.3f})")
            y -= 12
            c.drawString(52, y, str(row["explanation"]))
            y -= 14
            if y < 70:
                c.showPage()
                y = height - 40
                c.setFont("Helvetica", 9)
    else:
        c.drawString(40, y, "No recommendations available.")
        y -= 14

    c.showPage()
    c.save()
    output.seek(0)
    return StreamingResponse(output, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="{city_id}_planning_report.pdf"'})
