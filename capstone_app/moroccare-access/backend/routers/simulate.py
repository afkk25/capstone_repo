from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from core.equity import compute_equity
from core.modeling import load_model, predict
from core.simulation import apply_intervention
from routers.cities import derive_2sfca_scores, ensure_baseline_data
from services.cache import clear_city_cache

router = APIRouter(tags=["simulate"], prefix="/api")


class ScenarioPayload(BaseModel):
    stop_density_multiplier: float | None = Field(default=None, ge=0.1, le=3.0)
    reduce_nearest_stop_distance_pct: float | None = Field(default=None, ge=0.0, le=1.0)
    add_facilities: int | None = Field(default=None, ge=0, le=20)
    walking_speed_mps: float | None = Field(default=None, ge=0.2, le=3.0)
    waiting_time_min: float | None = Field(default=None, ge=1.0, le=60.0)
    transport_speed_kmh: float | None = Field(default=None, ge=2.0, le=80.0)


@router.post("/cities/{city_id}/simulate")
def simulate_city(city_id: str, payload: ScenarioPayload) -> dict[str, Any]:
    clear_city_cache(city_id)
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
    simulated_df = apply_intervention(features_df, scenario)
    simulated_scores = predict(model, simulated_df, feature_names)
    equity = compute_equity(simulated_df, simulated_scores)
    score_2sfca = derive_2sfca_scores(simulated_df).to_numpy(dtype=float)

    facilities = []
    for i, row in simulated_df.reset_index(drop=True).iterrows():
        sim_score = float(simulated_scores[i])
        base_score = float(baseline_scores[i])
        facilities.append(
            {
                "name": str(row["facility"]),
                "district_name": str(row["facility"]),
                "urban_ring": str(row.get("urban_ring", "Unknown")),
                "latitude": float(row["latitude"]),
                "longitude": float(row["longitude"]),
                "baseline_score": base_score,
                "simulated_score": sim_score,
                "accessibility_score": sim_score,
                "travel_time_min": float((1.0 - max(0.0, min(1.0, sim_score))) * 60.0),
                "score_2sfca": float(score_2sfca[i]),
                "population": float(row.get("population", 0.0)),
                "underserved": 1 if sim_score < 0.5 else 0,
                "delta": float(sim_score - base_score),
            }
        )

    avg_delta = float((simulated_scores - baseline_scores).mean()) if len(simulated_scores) else 0.0
    return {"facilities": facilities, "avg_delta": avg_delta, "equity": equity}
