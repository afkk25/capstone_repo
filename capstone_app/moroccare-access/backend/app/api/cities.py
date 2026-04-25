from __future__ import annotations

from fastapi import APIRouter

from app.services.aggregation import aggregate_commune_summary
from app.services.city_registry import get_city_bundle, get_city_status, list_city_statuses
from app.services.json_utils import json_safe
from app.services.recommendations import district_recommendations, recommended_placements

router = APIRouter(prefix="/api/cities", tags=["cities"])


@router.get("")
def cities() -> list[dict]:
    return json_safe(list_city_statuses())


@router.get("/{city_id}/status")
def city_status(city_id: str) -> dict:
    return json_safe(get_city_status(city_id))


@router.get("/{city_id}/summary")
def city_summary(city_id: str) -> dict:
    bundle = get_city_bundle(city_id)
    origins = bundle.baseline_origins if bundle.baseline_origins is not None else bundle.origins
    commune = bundle.commune_summary if bundle.commune_summary is not None else aggregate_commune_summary(origins)
    if commune is None or len(commune) == 0:
        summary = {}
    else:
        population = commune.get("population", []).sum() if "population" in commune else None
        summary = {
            "population": float(population) if population is not None else None,
            "facility_count": int(len(bundle.facilities)) if bundle.facilities is not None else 0,
            "transport_stop_count": int(len(bundle.stops)) if bundle.stops is not None else 0,
            "average_access_time_min": float(commune["avg_total_travel_time_min_pw"].mean()) if "avg_total_travel_time_min_pw" in commune else None,
            "average_accessibility_score": float(commune["pop_weighted_accessibility_score"].mean())
            if "pop_weighted_accessibility_score" in commune
            else None,
            "pct_population_within_60_min": float(commune["pct_pop_access_60min"].mean()) if "pct_pop_access_60min" in commune else None,
            "coverage_gap_pct": float(commune["pct_pop_score_below_50"].mean()) if "pct_pop_score_below_50" in commune else None,
        }
    return json_safe({"city_id": city_id, "analysis_unit": "commune", "summary": summary})


@router.get("/{city_id}/ranking")
def city_ranking(city_id: str) -> dict:
    bundle = get_city_bundle(city_id)
    commune = bundle.commune_summary if bundle.commune_summary is not None else aggregate_commune_summary(bundle.baseline_origins)
    if commune is None or commune.empty:
        rows = []
    else:
        frame = commune.copy()
        frame["score_rank"] = frame["pop_weighted_accessibility_score"].rank(method="dense", ascending=True) if "pop_weighted_accessibility_score" in frame else None
        frame["time_rank"] = frame["avg_total_travel_time_min_pw"].rank(method="dense", ascending=False) if "avg_total_travel_time_min_pw" in frame else None
        cols = [
            c
            for c in [
                "commune_id",
                "commune_name",
                "district_name",
                "pop_weighted_accessibility_score",
                "avg_total_travel_time_min_pw",
                "pct_pop_score_below_50",
                "population",
                "score_rank",
                "time_rank",
            ]
            if c in frame.columns
        ]
        rows = frame.sort_values("pop_weighted_accessibility_score", ascending=True).head(200)[cols].to_dict(orient="records")
        for row in rows:
            row["district"] = row.get("commune_name") or row.get("district_name")
            row["avg_accessibility_score"] = row.get("pop_weighted_accessibility_score")
            row["underserved_pct"] = row.get("pct_pop_score_below_50")
            row["population"] = row.get("population", row.get("population_raster"))
    return json_safe({"city_id": city_id, "analysis_unit": "commune", "ranking": rows, "rows": rows})


@router.get("/{city_id}/recommendations")
def city_recommendations(city_id: str) -> dict:
    bundle = get_city_bundle(city_id)
    origins = bundle.baseline_origins if bundle.baseline_origins is not None else bundle.origins
    recs = district_recommendations(origins)
    output = [
        {
            "rank": int(i + 1),
            "scenario": f"prioritize_{r.get('commune_id') or r.get('district_id')}",
            "score": r.get("underserved_population"),
            "population_impact": r.get("underserved_population"),
            "commune_id": r.get("commune_id") or r.get("district_id"),
            "commune_name": r.get("commune_name") or r.get("district_name"),
            "district_name": r.get("district_name"),
            "explanation": f"High underserved population in {r.get('commune_name') or r.get('district_name')}",
        }
        for i, r in enumerate(recs)
    ]
    return json_safe({"city_id": city_id, "recommendations": output})


@router.get("/{city_id}/recommended-placements")
def city_recommended_placements(city_id: str) -> dict:
    bundle = get_city_bundle(city_id)
    origins = bundle.baseline_origins if bundle.baseline_origins is not None else bundle.origins
    placements = recommended_placements(origins)
    return json_safe(
        {
            "city_id": city_id,
            "placements": placements,
            "facility_recommendations": placements,
            "transport_stop_recommendations": placements,
            "methodology_notes": ["Candidates are underserved origin centroids (score < 50 or travel time > 60 min)."],
        }
    )


@router.get("/{city_id}/explainability")
def city_explainability(city_id: str) -> dict:
    return json_safe({"city_id": city_id, "feature_importance": []})
