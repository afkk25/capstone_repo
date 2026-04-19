from __future__ import annotations

from typing import Any

import pandas as pd
from fastapi import APIRouter, HTTPException

from core.equity import compute_equity
from core.modeling import FEATURE_COLS, load_model, predict
from core.simulation import apply_intervention
from models.analytics import ComparePayload, SensitivityPayload
from routers.cities import ensure_baseline_data
from services.analytics import compare_scenarios, compute_summary_metrics, rank_underserved_districts
from services.cache import city_freshness_token, get_cached_city_rows
from services.explainability import compute_feature_importance
from services.notebook_bridge.loaders import (
    CityDataNotFoundError,
    load_notebook_district_summary,
    load_notebook_feature_importance,
)
from services.recommendation import recommend_best_intervention

router = APIRouter(tags=["analytics"], prefix="/api")


def _facility_rows(features_df: pd.DataFrame, scores: pd.Series | Any, score_key: str = "accessibility_score") -> pd.DataFrame:
    df = features_df.copy().reset_index(drop=True)
    df[score_key] = pd.Series(scores).astype(float).to_numpy()
    # Keep population-like field for impact calculations.
    if "population" not in df.columns:
        df["population"] = 1.0
    return df


def _ranking_from_notebook_districts(district_df: pd.DataFrame) -> list[dict[str, Any]]:
    if district_df.empty:
        return []
    dname_col = "district_name" if "district_name" in district_df.columns else ("district" if "district" in district_df.columns else None)
    score_col = "pop_weighted_accessibility_score" if "pop_weighted_accessibility_score" in district_df.columns else None
    if dname_col is None or score_col is None:
        return []

    underserved_col = "pct_pop_score_below_50" if "pct_pop_score_below_50" in district_df.columns else None
    pop_col = "population_raster" if "population_raster" in district_df.columns else None

    work = district_df.copy()
    work[score_col] = pd.to_numeric(work[score_col], errors="coerce")
    if underserved_col:
        work[underserved_col] = pd.to_numeric(work[underserved_col], errors="coerce")
    if pop_col:
        work[pop_col] = pd.to_numeric(work[pop_col], errors="coerce")

    work = work.dropna(subset=[score_col]).sort_values([score_col], ascending=True).reset_index(drop=True)
    if work.empty:
        return []

    rows: list[dict[str, Any]] = []
    for idx, row in work.iterrows():
        rows.append(
            {
                "district": str(row[dname_col]),
                "avg_accessibility_score": float(row[score_col]),
                "underserved_pct": float(row[underserved_col]) if underserved_col and pd.notna(row.get(underserved_col)) else 0.0,
                "population": float(row[pop_col]) if pop_col and pd.notna(row.get(pop_col)) else 0.0,
                "rank": int(idx + 1),
            }
        )
    return rows


@router.get("/cities/{city_id}/summary")
def get_city_summary(city_id: str) -> dict[str, Any]:
    try:
        features_df, scores = get_cached_city_rows(city_id, city_freshness_token(city_id))
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"City '{city_id}' not found")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    rows = _facility_rows(features_df, scores)
    return {"city_id": city_id, "summary": compute_summary_metrics(rows)}


@router.get("/cities/{city_id}/ranking")
def get_city_ranking(city_id: str) -> dict[str, Any]:
    try:
        district_df = load_notebook_district_summary(city_id)
        notebook_rows = _ranking_from_notebook_districts(district_df)
        if notebook_rows:
            return {"city_id": city_id, "ranking": notebook_rows}
    except CityDataNotFoundError:
        pass
    except Exception:
        # Keep endpoint resilient; fallback to baseline-derived ranking below.
        pass

    try:
        features_df, scores = get_cached_city_rows(city_id, city_freshness_token(city_id))
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"City '{city_id}' not found")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    rows = _facility_rows(features_df, scores)
    return {"city_id": city_id, "ranking": rank_underserved_districts(rows)}


@router.post("/cities/{city_id}/compare")
def compare_city_scenarios(city_id: str, payload: ComparePayload) -> dict[str, Any]:
    try:
        features_df, baseline_scores = ensure_baseline_data(city_id)
        model, feature_names, _ = load_model(city_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"City '{city_id}' not found")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    scenario = {
        "stop_density_multiplier": payload.stop_density_multiplier if payload.stop_density_multiplier is not None else 1.0,
        "reduce_nearest_stop_distance_pct": payload.reduce_nearest_stop_distance_pct
        if payload.reduce_nearest_stop_distance_pct is not None
        else 0.0,
        "add_facilities": payload.add_facilities if payload.add_facilities is not None else 0,
    }
    # Optional sensitivity knobs are accepted and returned for transparency.
    scenario["walking_speed_mps"] = 1.0
    scenario["waiting_time_min"] = 10.0
    scenario["transport_speed_kmh"] = 20.0
    simulated_df = apply_intervention(features_df, scenario)
    simulated_scores = predict(model, simulated_df, feature_names)

    baseline_rows = _facility_rows(features_df, baseline_scores, "accessibility_score")
    simulated_rows = _facility_rows(simulated_df, simulated_scores, "accessibility_score")
    comparison = compare_scenarios(baseline_rows, simulated_rows)
    district_before = rank_underserved_districts(baseline_rows)
    district_after = rank_underserved_districts(simulated_rows)

    improved = 0
    before_map = {row["district"]: row["avg_accessibility_score"] for row in district_before}
    after_map = {row["district"]: row["avg_accessibility_score"] for row in district_after}
    for district, before_score in before_map.items():
        if district in after_map and after_map[district] > before_score:
            improved += 1

    return {
        "city_id": city_id,
        "scenario": scenario,
        "comparison": comparison,
        "districts_improved": improved,
        "districts_total": len(before_map),
        "population_affected": float(
            max(0.0, compute_summary_metrics(baseline_rows)["underserved_population"] - compute_summary_metrics(simulated_rows)["underserved_population"])
        ),
        "ranking_before": district_before,
        "ranking_after": district_after,
    }


@router.get("/cities/{city_id}/recommendations")
def get_city_recommendations(city_id: str) -> dict[str, Any]:
    try:
        features_df, baseline_scores = ensure_baseline_data(city_id)
        model, feature_names, _ = load_model(city_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"City '{city_id}' not found")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    baseline_rows = _facility_rows(features_df, baseline_scores, "accessibility_score")
    scenarios = [
        ("transport_plus", {"stop_density_multiplier": 1.2}),
        ("walkability_plus", {"reduce_nearest_stop_distance_pct": 0.15}),
        ("facility_plus", {"add_facilities": 1}),
        ("combined", {"stop_density_multiplier": 1.2, "reduce_nearest_stop_distance_pct": 0.15, "add_facilities": 1}),
    ]

    sim_payload: list[dict[str, Any]] = []
    for name, scenario in scenarios:
        sim_df = apply_intervention(features_df, scenario)
        sim_scores = predict(model, sim_df, feature_names)
        sim_rows = _facility_rows(sim_df, sim_scores, "accessibility_score")
        sim_payload.append({"scenario": name, "baseline_rows": baseline_rows.to_dict(orient="records"), "simulated_rows": sim_rows.to_dict(orient="records")})

    recommendations = recommend_best_intervention(sim_payload)
    explain_rows = compute_feature_importance(model, features_df[FEATURE_COLS].copy())
    return {"city_id": city_id, "recommendations": recommendations, "feature_importance": explain_rows[:10]}


@router.get("/cities/{city_id}/explainability")
def get_city_explainability(city_id: str) -> dict[str, Any]:
    try:
        imp_df = load_notebook_feature_importance(city_id)
        if not imp_df.empty and "feature" in imp_df.columns:
            imp_col = "perm_importance_mean" if "perm_importance_mean" in imp_df.columns else ("importance" if "importance" in imp_df.columns else None)
            if imp_col:
                rows = (
                    imp_df[["feature", imp_col]]
                    .rename(columns={imp_col: "importance"})
                    .assign(importance=lambda d: pd.to_numeric(d["importance"], errors="coerce"))
                    .dropna(subset=["importance"])
                    .sort_values("importance", ascending=False)
                    .head(10)
                )
                return {"city_id": city_id, "feature_importance": rows.to_dict(orient="records")}
    except CityDataNotFoundError:
        pass
    except Exception:
        # Keep endpoint resilient; fallback to model-based explainability below.
        pass

    try:
        features_df, _ = ensure_baseline_data(city_id)
        model, _, _ = load_model(city_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"City '{city_id}' not found")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    rows = compute_feature_importance(model, features_df[FEATURE_COLS].copy())
    return {"city_id": city_id, "feature_importance": rows[:10]}


@router.post("/cities/{city_id}/sensitivity")
def run_sensitivity_analysis(city_id: str, payload: SensitivityPayload) -> dict[str, Any]:
    """
    Lightweight sensitivity analysis by converting speed/time assumptions to scenario perturbations.
    """
    try:
        features_df, baseline_scores = ensure_baseline_data(city_id)
        model, feature_names, _ = load_model(city_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"City '{city_id}' not found")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    walk_factor = max(0.5, min(1.5, 1.0 / max(payload.walking_speed_mps, 0.1)))
    wait_factor = max(0.7, min(1.3, payload.waiting_time_min / 10.0))
    transit_factor = max(0.5, min(1.5, payload.transport_speed_kmh / 20.0))
    scenario = {
        "stop_density_multiplier": transit_factor,
        "reduce_nearest_stop_distance_pct": max(0.0, min(0.4, (1.0 - walk_factor) * 0.25)),
        "add_facilities": 0,
    }

    simulated_df = apply_intervention(features_df, scenario)
    simulated_scores = predict(model, simulated_df, feature_names)
    baseline_rows = _facility_rows(features_df, baseline_scores, "accessibility_score")
    simulated_rows = _facility_rows(simulated_df, simulated_scores, "accessibility_score")
    comparison = compare_scenarios(baseline_rows, simulated_rows)
    comparison["waiting_time_factor"] = wait_factor
    return {"city_id": city_id, "assumptions": payload.model_dump(), "derived_scenario": scenario, "comparison": comparison}
