from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd

from core.config import get_default_point_simulation_city_id, load_city_config
from core.equity import compute_equity
from routers.cities import (
    _district_summary_from_origins,
    _load_city_geo,
    _methodology_metadata,
    _origin_rows,
    _response_warnings,
    _read_baseline_metadata,
    derive_2sfca_scores,
    ensure_baseline_data,
)
from routers.cities import _clean_label
from services.cache import clear_city_cache, city_freshness_token, get_cached_city_rows
from services.analytics import compute_summary_metrics
from services.origin_accessibility import (
    accessibility_score_from_travel_time,
    load_city_facilities,
    simulate_origin_accessibility,
)


def _min_max(values: pd.Series) -> pd.Series:
    numeric = pd.to_numeric(values, errors="coerce").fillna(0.0).astype(float)
    span = float(numeric.max() - numeric.min())
    if span < 1e-9:
        return pd.Series(0.0, index=numeric.index, dtype=float)
    return (numeric - float(numeric.min())) / span


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


def _candidate_origins(features_df: pd.DataFrame, baseline_scores: np.ndarray, limit: int = 35) -> pd.DataFrame:
    candidates = features_df.copy().reset_index(drop=True)
    if candidates.empty or "latitude" not in candidates.columns or "longitude" not in candidates.columns:
        return candidates.head(0)

    candidates["latitude"] = pd.to_numeric(candidates["latitude"], errors="coerce")
    candidates["longitude"] = pd.to_numeric(candidates["longitude"], errors="coerce")
    candidates = candidates[candidates["latitude"].notna() & candidates["longitude"].notna()].copy()
    if candidates.empty:
        return candidates

    base_scores = pd.Series(np.asarray(baseline_scores, dtype=float), index=features_df.reset_index(drop=True).index)
    candidates["_baseline_score"] = base_scores.reindex(candidates.index).fillna(float(np.nanmean(baseline_scores) if len(baseline_scores) else 0.0))
    candidates["_access_gap"] = 1.0 - candidates["_baseline_score"].clip(lower=0.0, upper=1.0)
    population_source = candidates["population"] if "population" in candidates.columns else candidates.get("population_density", 0.0)
    stop_distance = candidates["distance_to_nearest_stop_m"] if "distance_to_nearest_stop_m" in candidates.columns else 0.0
    candidates["_candidate_priority"] = (
        0.6 * candidates["_access_gap"]
        + 0.25 * _min_max(pd.Series(population_source, index=candidates.index))
        + 0.15 * _min_max(pd.Series(stop_distance, index=candidates.index))
    )

    low_access_cutoff = float(np.nanpercentile(candidates["_baseline_score"], 45)) if len(candidates) else 1.0
    underserved = candidates[candidates["_baseline_score"] <= low_access_cutoff].copy()
    if underserved.empty:
        underserved = candidates.copy()
    return underserved.sort_values("_candidate_priority", ascending=False).head(limit)


def _recommendation_metrics(
    baseline_summary: dict[str, float],
    baseline_scores: np.ndarray,
    simulated_df: pd.DataFrame,
    simulated_scores: np.ndarray,
) -> dict[str, float | int]:
    simulated_rows = simulated_df.copy().reset_index(drop=True)
    simulated_rows["accessibility_score"] = np.asarray(simulated_scores, dtype=float)
    simulated_summary = compute_summary_metrics(simulated_rows)
    deltas = np.asarray(simulated_scores, dtype=float) - np.asarray(baseline_scores, dtype=float)
    improved_mask = deltas > 0.005
    if "population" in simulated_df.columns:
        populations = pd.to_numeric(simulated_df["population"], errors="coerce").fillna(0.0).to_numpy(dtype=float)
    else:
        populations = np.zeros(len(simulated_df), dtype=float)
    return {
        "avg_accessibility_delta": float(simulated_summary["avg_accessibility_score"] - baseline_summary["avg_accessibility_score"]),
        "avg_travel_time_delta": float(simulated_summary["avg_travel_time"] - baseline_summary["avg_travel_time"]),
        "improved_origin_count": int(improved_mask.sum()),
        "improved_population": float(populations[improved_mask].sum()) if populations.size else 0.0,
        "max_origin_delta": float(np.nanmax(deltas)) if deltas.size else 0.0,
    }


def _ranked_candidate_payload(
    *,
    city_id: str,
    features_df: pd.DataFrame,
    baseline_scores: np.ndarray,
    intervention_type: str,
    candidates: pd.DataFrame,
    baseline_summary: dict[str, float],
    simulation_defaults: dict[str, Any],
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    scenario_key = "facility_locations" if intervention_type == "healthcare_facility" else "transport_stop_locations"
    if "population" in features_df.columns:
        total_population = float(pd.to_numeric(features_df["population"], errors="coerce").fillna(0.0).sum())
    else:
        total_population = 0.0
    for _, candidate in candidates.iterrows():
        lat = float(candidate["latitude"])
        lon = float(candidate["longitude"])
        scenario = {
            **simulation_defaults,
            "facility_locations": [],
            "transport_stop_locations": [],
        }
        scenario[scenario_key] = [{"latitude": lat, "longitude": lon}]
        try:
            simulated_df, _scenario_entities, _context = simulate_origin_accessibility(city_id, scenario, baseline_df=features_df)
            simulated_scores = pd.to_numeric(simulated_df["accessibility_score"], errors="coerce").fillna(0.0).to_numpy(dtype=float)
        except ValueError:
            continue

        metrics = _recommendation_metrics(baseline_summary, baseline_scores, simulated_df, simulated_scores)
        population_weight = float(candidate.get("population", 0.0) or 0.0)
        score = (
            float(metrics["avg_accessibility_delta"]) * 100.0
            + float(metrics["improved_origin_count"]) / max(1, len(features_df)) * 2.0
            + float(metrics["improved_population"]) / max(1.0, total_population) * 2.0
            + float(metrics["max_origin_delta"]) * 10.0
        )
        rows.append(
            {
                "city_id": city_id,
                "intervention_type": intervention_type,
                "latitude": lat,
                "longitude": lon,
                "origin_id": str(candidate.get("origin_id", candidate.name)),
                "origin_name": _clean_label(candidate.get("origin_name"), "Recommended origin"),
                "district_name": _clean_label(candidate.get("district_name"), "Unassigned area"),
                "baseline_accessibility": float(candidate.get("_baseline_score", 0.0)),
                "local_population": population_weight,
                "score": float(score),
                **metrics,
                "method": "candidate origins are ranked by recomputing origin-to-facility travel time through the stop network",
            }
        )

    return sorted(rows, key=lambda item: item["score"], reverse=True)[:3]


def recommend_city_placements(city_id: str) -> dict[str, Any]:
    city_cfg = load_city_config(city_id)
    features_df, baseline_scores = ensure_baseline_data(city_id)

    baseline_rows = features_df.copy().reset_index(drop=True)
    baseline_rows["accessibility_score"] = np.asarray(baseline_scores, dtype=float)
    baseline_summary = compute_summary_metrics(baseline_rows)
    candidates = _candidate_origins(features_df, np.asarray(baseline_scores, dtype=float))
    simulation_defaults = _city_simulation_defaults(city_cfg)

    facility_rows = _ranked_candidate_payload(
        city_id=city_id,
        features_df=features_df,
        baseline_scores=np.asarray(baseline_scores, dtype=float),
        intervention_type="healthcare_facility",
        candidates=candidates,
        baseline_summary=baseline_summary,
        simulation_defaults=simulation_defaults,
    )
    stop_rows = _ranked_candidate_payload(
        city_id=city_id,
        features_df=features_df,
        baseline_scores=np.asarray(baseline_scores, dtype=float),
        intervention_type="transport_stop",
        candidates=candidates,
        baseline_summary=baseline_summary,
        simulation_defaults=simulation_defaults,
    )
    return {
        "city_id": city_id,
        "analysis_unit": str(features_df.get("analysis_unit", pd.Series(["unknown"])).iloc[0]),
        "placements": facility_rows + stop_rows,
        "facility_recommendations": facility_rows,
        "transport_stop_recommendations": stop_rows,
        "methodology_notes": [
            "Recommended placements are computed from candidate demand origins, not manually selected.",
            "Each candidate is evaluated by recomputing origin-to-facility travel time over the transport-stop network.",
            "Ranking combines average accessibility gain, improved origins, improved population, and the strongest local origin-level gain.",
        ],
    }


def _build_response(
    city_id: str,
    features_df: pd.DataFrame,
    baseline_scores: np.ndarray,
    simulated_df: pd.DataFrame,
    simulated_scores: np.ndarray,
    scenario: dict[str, Any],
    scenario_entities: dict[str, list[dict[str, float | str]]],
    context: dict[str, Any] | None = None,
) -> dict[str, Any]:
    baseline_equity = compute_equity(features_df, baseline_scores)
    simulated_equity = compute_equity(simulated_df, simulated_scores)
    equity = {
        **simulated_equity,
        "gini_before": float(baseline_equity.get("gini_coefficient", 0.0)),
        "gini_after": float(simulated_equity.get("gini_coefficient", 0.0)),
    }
    facility_lookup = context.get("facility_lookup", {}) if isinstance(context, dict) else {}
    score_2sfca = pd.to_numeric(simulated_df.get("score_2sfca", derive_2sfca_scores(simulated_df)), errors="coerce").fillna(0.0).to_numpy(dtype=float)
    baseline_rows_for_summary = features_df.copy().reset_index(drop=True)
    simulated_rows_for_summary = simulated_df.copy().reset_index(drop=True)
    baseline_rows_for_summary["accessibility_score"] = np.asarray(baseline_scores, dtype=float)
    simulated_rows_for_summary["accessibility_score"] = np.asarray(simulated_scores, dtype=float)
    baseline_summary = compute_summary_metrics(baseline_rows_for_summary)
    simulated_summary = compute_summary_metrics(simulated_rows_for_summary)
    feature_delta_cols = ["distance_to_nearest_stop_m", "walk_time_to_stop_min", "travel_time_min", "accessibility_score"]
    feature_delta_summary: dict[str, float | int] = {}
    feature_changed_mask = np.zeros(len(simulated_df), dtype=bool)
    for col in feature_delta_cols:
        if col not in features_df.columns or col not in simulated_df.columns:
            continue
        before_values = pd.to_numeric(features_df[col], errors="coerce").fillna(0.0).to_numpy(dtype=float)
        after_values = pd.to_numeric(simulated_df[col], errors="coerce").fillna(0.0).to_numpy(dtype=float)
        delta_values = after_values - before_values
        changed = np.abs(delta_values) > 1e-9
        feature_changed_mask = feature_changed_mask | changed
        feature_delta_summary[f"{col}_changed_origin_count"] = int(changed.sum())
        feature_delta_summary[f"{col}_mean_delta"] = float(delta_values.mean()) if delta_values.size else 0.0

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
        feature_changed = bool(feature_changed_mask[i]) if i < len(feature_changed_mask) else False
        if abs(delta) >= 0.005 or feature_changed:
            impacted_origin_ids.append(origin_id)
        origins.append(
            {
                "id": origin_id,
                "origin_id": origin_id,
                "name": origin_name,
                "district_name": district_name,
                "district_id": row.get("district_id"),
                "analysis_unit": analysis_unit,
                "urban_ring": str(row.get("urban_ring", "Unknown")),
                "latitude": float(row["latitude"]),
                "longitude": float(row["longitude"]),
                "before_score": base_score,
                "after_score": sim_score,
                "baseline_score": base_score,
                "simulated_score": sim_score,
                "accessibility_score": sim_score,
                "before_travel_time_min": float(pd.to_numeric(pd.Series([features_df.iloc[i].get("travel_time_min")]), errors="coerce").fillna((1.0 - max(0.0, min(1.0, base_score))) * 60.0).iloc[0]),
                "travel_time_min": float(pd.to_numeric(pd.Series([row.get("travel_time_min")]), errors="coerce").fillna((1.0 - max(0.0, min(1.0, sim_score))) * 60.0).iloc[0]),
                "score_2sfca": float(score_2sfca[i]),
                "population": float(row.get("population", 0.0)),
                "underserved": 1 if sim_score < 0.5 else 0,
                "delta": delta,
                "feature_changed": feature_changed,
                "nearest_stop_id": row.get("nearest_stop_id"),
                "nearest_facility_id": row.get("nearest_facility_id"),
                "nearest_facility_name": row.get("nearest_facility_name")
                or facility_lookup.get(str(row.get("nearest_facility_id")), {}).get("name"),
            }
        )

    avg_delta = float((simulated_scores - baseline_scores).mean()) if len(simulated_scores) else 0.0
    analysis_unit = str(simulated_df.get("analysis_unit", pd.Series(["unknown"])).iloc[0])
    metadata = _read_baseline_metadata(city_id)
    methodology = _methodology_metadata(analysis_unit)
    warnings = _response_warnings(metadata, analysis_unit)
    district_before = _district_summary_from_origins(features_df, np.asarray(baseline_scores, dtype=float)) if analysis_unit == "origin" else []
    district_after = _district_summary_from_origins(simulated_df, np.asarray(simulated_scores, dtype=float)) if analysis_unit == "origin" else []
    before_by_district = {str(row["district_name"]): row for row in district_before}
    district_rows: list[dict[str, Any]] = []
    for after in district_after:
        district_name = str(after.get("district_name", "Unassigned area"))
        before = before_by_district.get(district_name, {})
        before_score = float(before.get("avg_accessibility_score", after.get("avg_accessibility_score", 0.0)))
        after_score = float(after.get("avg_accessibility_score", 0.0))
        before_tt = float(before.get("avg_travel_time_min", 0.0))
        after_tt = float(after.get("avg_travel_time_min", 0.0))
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
        "warnings": warnings,
        "methodology": methodology,
        "methodology_notes": methodology["notes"],
        "summary": {
            "avg_score_before": float(baseline_summary["avg_accessibility_score"]),
            "avg_score_after": float(simulated_summary["avg_accessibility_score"]),
            "avg_travel_time_before": float(baseline_summary["avg_travel_time"]),
            "avg_travel_time_after": float(simulated_summary["avg_travel_time"]),
            "improved_population": float(populations[total_improved_mask].sum()) if populations.size else 0.0,
            "improved_origin_count": int(total_improved_mask.sum()),
            "city_before_avg_score": float(baseline_summary["avg_accessibility_score"] * 100.0),
            "city_after_avg_score": float(simulated_summary["avg_accessibility_score"] * 100.0),
            "city_before_avg_tt": float(baseline_summary["avg_travel_time"]),
            "city_after_avg_tt": float(simulated_summary["avg_travel_time"]),
            "total_pop_improved": float(populations[total_improved_mask].sum()) if populations.size else 0.0,
            "total_origins_improved": int(total_improved_mask.sum()),
        },
        "delta_summary": {
            "avg_accessibility_delta": float(simulated_summary["avg_accessibility_score"] - baseline_summary["avg_accessibility_score"]),
            "avg_travel_time_delta": float(simulated_summary["avg_travel_time"] - baseline_summary["avg_travel_time"]),
            "improved_population": float(populations[total_improved_mask].sum()) if populations.size else 0.0,
            "improved_origin_count": int(total_improved_mask.sum()),
            "feature_changed_origin_count": int(feature_changed_mask.sum()),
        },
        "feature_delta_summary": feature_delta_summary,
        "districts": district_rows,
        "baseline_rows": _origin_rows(features_df, np.asarray(baseline_scores, dtype=float)),
        "simulated_rows": origins,
        "origins": origins,
        "avg_delta": avg_delta,
        "equity": equity,
        "scenario": {
            "stop_density_multiplier": scenario["stop_density_multiplier"],
            "reduce_nearest_stop_distance_pct": scenario["reduce_nearest_stop_distance_pct"],
            "add_facilities": scenario["add_facilities"],
        },
        "added_facilities": scenario_entities["added_facilities"],
        "facilities_added": scenario_entities["added_facilities"],
        "added_transport_stops": scenario_entities["added_transport_stops"],
        "transport_stops_added": scenario_entities["added_transport_stops"],
        "auto_placed_facilities": scenario_entities["auto_placed_facilities"],
        "impacted_origin_ids": impacted_origin_ids,
        "district_summaries_before": district_before,
        "district_summaries_after": district_after,
        "facilities": load_city_facilities(city_id).rename(columns={"facility_id": "id"}).to_dict(orient="records"),
        "route_geometries": context.get("routes", {"type": "FeatureCollection", "features": []}) if isinstance(context, dict) else {"type": "FeatureCollection", "features": []},
    }


def run_city_scenario(city_id: str, scenario_payload: dict[str, Any]) -> dict[str, Any]:
    clear_city_cache(city_id)
    city_cfg = load_city_config(city_id)
    features_df, baseline_scores = ensure_baseline_data(city_id)
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
        "walking_speed_mps": _value_or_default(scenario_payload, "walking_speed_mps", simulation_defaults["walking_speed_mps"]),
        "waiting_time_min": _value_or_default(scenario_payload, "waiting_time_min", simulation_defaults["waiting_time_min"]),
        "transport_speed_kmh": _value_or_default(scenario_payload, "transport_speed_kmh", simulation_defaults["transport_speed_kmh"]),
        "max_travel_time_min": _value_or_default(scenario_payload, "max_travel_time_min", 60.0),
    }

    simulated_df, scenario_entities, context = simulate_origin_accessibility(city_id, scenario, baseline_df=features_df)
    simulated_scores = pd.to_numeric(simulated_df["accessibility_score"], errors="coerce").fillna(0.0).to_numpy(dtype=float)
    return _build_response(
        city_id,
        features_df,
        np.asarray(baseline_scores, dtype=float),
        simulated_df,
        simulated_scores,
        scenario,
        scenario_entities,
        context,
    )


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
