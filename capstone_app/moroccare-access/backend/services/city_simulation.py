from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd

from core.config import get_default_point_simulation_city_id, load_city_config
from core.equity import compute_equity
from core.modeling import load_model, predict
from core.simulation import apply_intervention
from routers.cities import _district_summary_from_origins, _load_city_geo, _read_baseline_metadata, derive_2sfca_scores, ensure_baseline_data
from routers.cities import _clean_label
from services.cache import clear_city_cache, city_freshness_token, get_cached_city_rows
from services.analytics import compute_summary_metrics


def _city_simulation_defaults(city_cfg: dict[str, Any]) -> dict[str, Any]:
    simulation_cfg = city_cfg.get("simulation") if isinstance(city_cfg.get("simulation"), dict) else {}
    defaults = simulation_cfg.get("default_parameters") if isinstance(simulation_cfg.get("default_parameters"), dict) else {}
    return {
        "stop_density_multiplier": defaults.get("stop_density_multiplier", 1.0),
        "reduce_nearest_stop_distance_pct": defaults.get("reduce_nearest_stop_distance_pct", 0.0),
        "add_facilities": defaults.get("add_facilities", 0),
        "walking_speed_mps": defaults.get("walking_speed_mps", 1.0),
        "waiting_time_min": defaults.get("waiting_time_min", 10.0),
        "transport_speed_kmh": defaults.get("transport_speed_kmh", 20.0),
    }


def _value_or_default(payload: dict[str, Any], key: str, default: Any) -> Any:
    value = payload.get(key)
    return default if value is None else value


def _point_payload(city_cfg: dict[str, Any], intervention_type: str, latitude: float, longitude: float) -> dict[str, Any]:
    normalized_type = str(intervention_type).strip().lower()
    simulation_cfg = city_cfg.get("simulation") if isinstance(city_cfg.get("simulation"), dict) else {}
    interventions = simulation_cfg.get("interventions") if isinstance(simulation_cfg.get("interventions"), list) else []

    selected: dict[str, Any] | None = None
    valid_ids: list[str] = []
    for intervention in interventions:
        if not isinstance(intervention, dict):
            continue
        intervention_id = str(intervention.get("id", "")).strip().lower()
        backend_type = str(intervention.get("backend_intervention_type", "")).strip().lower()
        aliases = [str(alias).strip().lower() for alias in intervention.get("aliases", []) if str(alias).strip()]
        candidates = {intervention_id, backend_type, *aliases}
        if intervention_id:
            valid_ids.append(intervention_id)
        if normalized_type in candidates:
            selected = intervention
            break

    if selected is None:
        raise ValueError(
            "intervention_type is not supported for this city. "
            + (f"Supported interventions: {', '.join(sorted(set(valid_ids)))}" if valid_ids else "No interventions are configured for this city")
        )

    payload = {
        **_city_simulation_defaults(city_cfg),
        "facility_locations": [],
        "transport_stop_locations": [],
    }
    scenario_patch = selected.get("scenario_patch") if isinstance(selected.get("scenario_patch"), dict) else {}
    payload.update(scenario_patch)

    placement_target = str(selected.get("placement_target") or "").strip().lower()
    if placement_target == "facility_locations":
        payload["facility_locations"] = [{"latitude": float(latitude), "longitude": float(longitude)}]
    elif placement_target == "transport_stop_locations":
        payload["transport_stop_locations"] = [{"latitude": float(latitude), "longitude": float(longitude)}]
    else:
        backend_type = str(selected.get("backend_intervention_type", "")).strip().lower()
        if backend_type == "healthcare_facility":
            payload["facility_locations"] = [{"latitude": float(latitude), "longitude": float(longitude)}]
        else:
            payload["transport_stop_locations"] = [{"latitude": float(latitude), "longitude": float(longitude)}]
    return payload


def _build_response(
    city_id: str,
    features_df: pd.DataFrame,
    baseline_scores: np.ndarray,
    simulated_df: pd.DataFrame,
    simulated_scores: np.ndarray,
    scenario: dict[str, Any],
    scenario_entities: dict[str, list[dict[str, float | str]]],
) -> dict[str, Any]:
    equity = compute_equity(simulated_df, simulated_scores)
    score_2sfca = derive_2sfca_scores(simulated_df).to_numpy(dtype=float)
    baseline_rows_for_summary = features_df.copy().reset_index(drop=True)
    simulated_rows_for_summary = simulated_df.copy().reset_index(drop=True)
    baseline_rows_for_summary["accessibility_score"] = np.asarray(baseline_scores, dtype=float)
    simulated_rows_for_summary["accessibility_score"] = np.asarray(simulated_scores, dtype=float)
    baseline_summary = compute_summary_metrics(baseline_rows_for_summary)
    simulated_summary = compute_summary_metrics(simulated_rows_for_summary)

    origins: list[dict[str, Any]] = []
    impacted_origin_ids: list[str] = []
    for i, row in simulated_df.reset_index(drop=True).iterrows():
        sim_score = float(simulated_scores[i])
        base_score = float(baseline_scores[i])
        origin_id = str(row.get("origin_id", i))
        origin_name = _clean_label(row.get("origin_name"), f"Origin {i + 1}")
        analysis_unit = _clean_label(row.get("analysis_unit"), "")
        district_fallback = origin_name if analysis_unit == "facility_proxy" else "Unassigned area"
        district_name = _clean_label(row.get("district_name"), district_fallback)
        delta = float(sim_score - base_score)
        if abs(delta) >= 0.005:
            impacted_origin_ids.append(origin_id)
        origins.append(
            {
                "id": origin_id,
                "origin_id": origin_id,
                "name": origin_name,
                "district_name": district_name,
                "district_id": row.get("district_id"),
                "urban_ring": str(row.get("urban_ring", "Unknown")),
                "latitude": float(row["latitude"]),
                "longitude": float(row["longitude"]),
                "before_score": base_score,
                "after_score": sim_score,
                "baseline_score": base_score,
                "simulated_score": sim_score,
                "accessibility_score": sim_score,
                "before_travel_time_min": float((1.0 - max(0.0, min(1.0, base_score))) * 60.0),
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
    before_by_district = {str(row["district_name"]): row for row in district_before}
    district_rows: list[dict[str, Any]] = []
    for after in district_after:
        district_name = str(after.get("district_name", "Unassigned area"))
        before = before_by_district.get(district_name, {})
        before_score = float(before.get("avg_accessibility_score", after.get("avg_accessibility_score", 0.0)))
        after_score = float(after.get("avg_accessibility_score", 0.0))
        before_tt = float((1.0 - max(0.0, min(1.0, before_score))) * 60.0)
        after_tt = float((1.0 - max(0.0, min(1.0, after_score))) * 60.0)
        district_rows.append(
            {
                "district_name": district_name,
                "before_avg_score": before_score * 100.0,
                "after_avg_score": after_score * 100.0,
                "score_delta": (after_score - before_score) * 100.0,
                "before_avg_tt": before_tt,
                "after_avg_tt": after_tt,
                "pop_improved": float(after.get("population", 0.0)) if after_score > before_score else 0.0,
                "origins_improved": int(after.get("origin_count", 0)) if after_score > before_score else 0,
            }
        )
    total_improved_mask = np.asarray(simulated_scores, dtype=float) > np.asarray(baseline_scores, dtype=float) + 0.005
    populations = pd.to_numeric(simulated_df.get("population", 0.0), errors="coerce").fillna(0.0).to_numpy(dtype=float)

    return {
        "city_id": city_id,
        "analysis_unit": analysis_unit,
        "warnings": metadata.get("warnings", []),
        "summary": {
            "city_before_avg_score": float(baseline_summary["avg_accessibility_score"] * 100.0),
            "city_after_avg_score": float(simulated_summary["avg_accessibility_score"] * 100.0),
            "city_before_avg_tt": float(baseline_summary["avg_travel_time"]),
            "city_after_avg_tt": float(simulated_summary["avg_travel_time"]),
            "total_pop_improved": float(populations[total_improved_mask].sum()) if populations.size else 0.0,
            "total_origins_improved": int(total_improved_mask.sum()),
        },
        "districts": district_rows,
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
        "facilities": origins,
    }


def run_city_scenario(city_id: str, scenario_payload: dict[str, Any]) -> dict[str, Any]:
    clear_city_cache(city_id)
    city_cfg = load_city_config(city_id)
    features_df, baseline_scores = ensure_baseline_data(city_id)
    _, healthcare_gdf, _ = _load_city_geo(city_id)
    model, feature_names, _ = load_model(city_id)
    simulation_defaults = _city_simulation_defaults(city_cfg)

    scenario = {
        "stop_density_multiplier": _value_or_default(scenario_payload, "stop_density_multiplier", simulation_defaults["stop_density_multiplier"]),
        "reduce_nearest_stop_distance_pct": _value_or_default(
            scenario_payload,
            "reduce_nearest_stop_distance_pct",
            simulation_defaults["reduce_nearest_stop_distance_pct"],
        ),
        "add_facilities": _value_or_default(scenario_payload, "add_facilities", simulation_defaults["add_facilities"]),
        "facility_locations": _value_or_default(scenario_payload, "facility_locations", []),
        "transport_stop_locations": _value_or_default(scenario_payload, "transport_stop_locations", []),
        "existing_facility_locations": [
            {"latitude": float(row["latitude"]), "longitude": float(row["longitude"])}
            for _, row in healthcare_gdf.reset_index(drop=True).iterrows()
        ],
        "walking_speed_mps": _value_or_default(scenario_payload, "walking_speed_mps", simulation_defaults["walking_speed_mps"]),
        "waiting_time_min": _value_or_default(scenario_payload, "waiting_time_min", simulation_defaults["waiting_time_min"]),
        "transport_speed_kmh": _value_or_default(scenario_payload, "transport_speed_kmh", simulation_defaults["transport_speed_kmh"]),
    }

    simulated_df, scenario_entities = apply_intervention(features_df, scenario, baseline_scores)
    simulated_scores = predict(model, simulated_df, feature_names)
    return _build_response(city_id, features_df, np.asarray(baseline_scores, dtype=float), simulated_df, simulated_scores, scenario, scenario_entities)


def run_point_simulation(city_id: str | None, intervention_type: str, latitude: float, longitude: float) -> dict[str, Any]:
    resolved_city_id = city_id or get_default_point_simulation_city_id()
    if not resolved_city_id:
        raise ValueError("city_id is required for point simulations when no default point-simulation city is configured")
    city_cfg = load_city_config(resolved_city_id)
    return run_city_scenario(resolved_city_id, _point_payload(city_cfg, intervention_type, latitude, longitude))


def preload_simulation_data() -> None:
    default_city_id = get_default_point_simulation_city_id()
    if not default_city_id:
        return
    try:
        get_cached_city_rows(default_city_id, city_freshness_token(default_city_id))
    except Exception:
        return
