from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from core.equity import compute_equity
from core.modeling import load_model, predict
from core.simulation import apply_intervention
from routers.cities import _district_summary_from_origins, _load_city_geo, _read_baseline_metadata, derive_2sfca_scores, ensure_baseline_data
from services.casablanca_simulation import run_point_simulation
from services.cache import clear_city_cache

router = APIRouter(tags=["simulate"], prefix="/api")


class LocationPoint(BaseModel):
    latitude: float = Field(ge=-90.0, le=90.0)
    longitude: float = Field(ge=-180.0, le=180.0)


class ScenarioPayload(BaseModel):
    stop_density_multiplier: float | None = Field(default=None, ge=0.1, le=3.0)
    reduce_nearest_stop_distance_pct: float | None = Field(default=None, ge=0.0, le=1.0)
    add_facilities: int | None = Field(default=None, ge=0, le=20)
    facility_locations: list[LocationPoint] = Field(default_factory=list)
    transport_stop_locations: list[LocationPoint] = Field(default_factory=list)
    walking_speed_mps: float | None = Field(default=None, ge=0.2, le=3.0)
    waiting_time_min: float | None = Field(default=None, ge=1.0, le=60.0)
    transport_speed_kmh: float | None = Field(default=None, ge=2.0, le=80.0)


class PointSimulationPayload(BaseModel):
    intervention_type: str
    latitude: float = Field(ge=-90.0, le=90.0)
    longitude: float = Field(ge=-180.0, le=180.0)


@router.post("/simulate")
def simulate_point_intervention(payload: PointSimulationPayload) -> dict[str, Any]:
    try:
        return run_point_simulation(
            intervention_type=payload.intervention_type,
            latitude=payload.latitude,
            longitude=payload.longitude,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except FileNotFoundError as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/cities/{city_id}/simulate")
def simulate_city(city_id: str, payload: ScenarioPayload) -> dict[str, Any]:
    clear_city_cache(city_id)
    try:
        features_df, baseline_scores = ensure_baseline_data(city_id)
        _, healthcare_gdf, _ = _load_city_geo(city_id)
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
        "facility_locations": [point.model_dump() for point in payload.facility_locations],
        "transport_stop_locations": [point.model_dump() for point in payload.transport_stop_locations],
        "existing_facility_locations": [
            {"latitude": float(row["latitude"]), "longitude": float(row["longitude"])}
            for _, row in healthcare_gdf.reset_index(drop=True).iterrows()
        ],
    }
    try:
        simulated_df, scenario_entities = apply_intervention(features_df, scenario, baseline_scores)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    simulated_scores = predict(model, simulated_df, feature_names)
    equity = compute_equity(simulated_df, simulated_scores)
    score_2sfca = derive_2sfca_scores(simulated_df).to_numpy(dtype=float)

    origins = []
    deltas = simulated_scores - np.asarray(baseline_scores, dtype=float)
    impacted_origin_ids = []
    for i, row in simulated_df.reset_index(drop=True).iterrows():
        sim_score = float(simulated_scores[i])
        base_score = float(baseline_scores[i])
        origin_id = str(row.get("origin_id", i))
        delta = float(sim_score - base_score)
        if abs(delta) >= 0.005:
            impacted_origin_ids.append(origin_id)
        origins.append(
            {
                "id": origin_id,
                "origin_id": origin_id,
                "name": str(row.get("origin_name", f"Origin {i + 1}")),
                "district_name": str(row.get("district_name", "Unknown")),
                "district_id": row.get("district_id"),
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
                "delta": delta,
            }
        )

    avg_delta = float((simulated_scores - baseline_scores).mean()) if len(simulated_scores) else 0.0
    analysis_unit = str(simulated_df.get("analysis_unit", pd.Series(["unknown"])).iloc[0])
    metadata = _read_baseline_metadata(city_id)
    district_before = _district_summary_from_origins(features_df, np.asarray(baseline_scores, dtype=float)) if analysis_unit == "origin" else []
    district_after = _district_summary_from_origins(simulated_df, np.asarray(simulated_scores, dtype=float)) if analysis_unit == "origin" else []
    return {
        "analysis_unit": analysis_unit,
        "warnings": metadata.get("warnings", []),
        "origins": origins,
        "avg_delta": avg_delta,
        "equity": equity,
        "scenario": {
            "stop_density_multiplier": scenario["stop_density_multiplier"],
            "reduce_nearest_stop_distance_pct": scenario["reduce_nearest_stop_distance_pct"],
            "add_facilities": scenario["add_facilities"],
        },
        "added_facilities": scenario_entities["added_facilities"],
        "added_transport_stops": scenario_entities["added_transport_stops"],
        "auto_placed_facilities": scenario_entities["auto_placed_facilities"],
        "impacted_origin_ids": impacted_origin_ids,
        "district_summaries_before": district_before,
        "district_summaries_after": district_after,
        # Backward-compatible alias for older clients.
        "facilities": origins,
    }
