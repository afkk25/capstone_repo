from typing import Any

import numpy as np
import pandas as pd
from pyproj import Transformer

from app.services.origin_metrics import prepare_origin_metrics
from app.services.city_store import city_dir, read_city_metadata, get_city_status
from app.services.baseline_engine import (
    first_existing_column,
    safe_number,
    weighted_mean,
)


def haversine_m(lat1, lon1, lat2, lon2):
    lat1 = np.radians(lat1)
    lon1 = np.radians(lon1)
    lat2 = np.radians(lat2)
    lon2 = np.radians(lon2)

    dlat = lat2 - lat1
    dlon = lon2 - lon1

    a = (
        np.sin(dlat / 2) ** 2
        + np.cos(lat1) * np.cos(lat2) * np.sin(dlon / 2) ** 2
    )

    return 6371000 * (2 * np.arcsin(np.sqrt(np.clip(a, 0, 1))))


def normalize_payload(payload: dict[str, Any]) -> dict[str, Any]:
    scenario_type = str(payload.get("scenario_type") or "").strip().lower()
    location = payload.get("location") or {}

    facility_locations = payload.get("facility_locations") or []
    transport_stop_locations = payload.get("transport_stop_locations") or []

    if scenario_type in {"add_facility", "healthcare_facility"} and location:
        facility_locations = [location]

    if scenario_type in {"add_stop", "transport_stop"} and location:
        transport_stop_locations = [location]

    if not scenario_type:
        if facility_locations:
            scenario_type = "add_facility"
        elif transport_stop_locations:
            scenario_type = "add_stop"

    return {
        "scenario_type": scenario_type,
        "facility_locations": facility_locations,
        "transport_stop_locations": transport_stop_locations,
        "score_threshold_min": float(payload.get("score_threshold_min", 45)),
        "walking_speed_m_per_min": float(payload.get("walking_speed_m_per_min", 60)),
        "facility_effect_radius_m": float(payload.get("facility_effect_radius_m", 3000)),
        "stop_effect_radius_m": float(payload.get("stop_effect_radius_m", 1500)),
        "grid_size_m": float(payload.get("grid_size_m", 750)),
    }


# def load_origin_baseline(city_id: str) -> tuple[pd.DataFrame, str, str | None]:
#     folder = city_dir(city_id)
#     origins = pd.read_csv(folder / "origins.csv")

#     travel_time_col = first_existing_column(
#         origins,
#         [
#             "tt_base",
#             "total_travel_time_min",
#             "travel_time_min",
#             "nearest_healthcare_travel_time_min",
#             "nearest_facility_travel_time_min",
#         ],
#     )

#     score_col = first_existing_column(
#         origins,
#         [
#             "accessibility_score",
#             "access_score",
#             "score",
#             "linear_accessibility_score",
#         ],
#     )

#     if travel_time_col is None:
#         raise ValueError(
#             "Simulation preview requires origins.csv to contain a travel-time column such as tt_base or total_travel_time_min."
#         )

#     origins = origins.copy()
#     origins["baseline_time_min"] = pd.to_numeric(origins[travel_time_col], errors="coerce")

#     if score_col is not None:
#         origins["baseline_score"] = pd.to_numeric(origins[score_col], errors="coerce")
#         if origins["baseline_score"].notna().any() and origins["baseline_score"].max(skipna=True) <= 1.5:
#             origins["baseline_score"] = origins["baseline_score"] * 100
#     else:
#         origins["baseline_score"] = 100 * (
#             1 - (origins["baseline_time_min"].clip(lower=0) / 45).clip(upper=1)
#         )

#     origins["population"] = (
#         pd.to_numeric(origins["population"], errors="coerce")
#         .fillna(0)
#         .clip(lower=0)
#     )

#     # If origins already have lat/lon, use them.
#     # Build latitude/longitude for spatial preview.
#     if {"latitude", "longitude"}.issubset(origins.columns):
#         origins["latitude"] = pd.to_numeric(origins["latitude"], errors="coerce")
#         origins["longitude"] = pd.to_numeric(origins["longitude"], errors="coerce")

#     else:
#         x = pd.to_numeric(origins.get("x"), errors="coerce")
#         y = pd.to_numeric(origins.get("y"), errors="coerce")

#         if x.notna().any() and y.notna().any():
#             looks_like_lonlat = (
#                 x.between(-180, 180).all()
#                 and y.between(-90, 90).all()
#             )

#             if looks_like_lonlat:
#                 origins["longitude"] = x
#                 origins["latitude"] = y
#             else:
#                 # Morocco projected CRS used by the Casablanca notebook pipeline.
#                 transformer = Transformer.from_crs("EPSG:32629", "EPSG:4326", always_xy=True)
#                 lon, lat = transformer.transform(x.to_numpy(), y.to_numpy())
#                 origins["longitude"] = lon
#                 origins["latitude"] = lat
#         else:
#             origins["latitude"] = np.nan
#             origins["longitude"] = np.nan
#     return origins, travel_time_col, score_col

def load_origin_baseline(city_id: str) -> tuple[pd.DataFrame, str | None, str | None, list[str]]:
    folder = city_dir(city_id)
    origins_raw = pd.read_csv(folder / "origins.csv")

    metrics = prepare_origin_metrics(city_id, origins_raw)

    return (
        metrics.origins,
        metrics.travel_time_col,
        metrics.score_col,
        metrics.warnings,
    )

def get_zone_columns(df: pd.DataFrame) -> tuple[str, str]:
    if "commune" in df.columns:
        zone_col = "commune"
    elif "commune_name" in df.columns:
        zone_col = "commune_name"
    elif "district_name" in df.columns:
        zone_col = "district_name"
    elif "district" in df.columns:
        zone_col = "district"
    else:
        zone_col = ""

    if "district_name" in df.columns:
        district_col = "district_name"
    elif "district" in df.columns:
        district_col = "district"
    else:
        district_col = zone_col

    return zone_col, district_col


def estimate_add_facility(
    origins: pd.DataFrame,
    location: dict[str, Any],
    params: dict[str, Any],
) -> pd.DataFrame:
    out = origins.copy()

    lat = float(location["latitude"])
    lon = float(location["longitude"])

    threshold = params["score_threshold_min"]
    walking_speed = params["walking_speed_m_per_min"]
    effect_radius = params["facility_effect_radius_m"]

    if out["latitude"].notna().any() and out["longitude"].notna().any():
        dist_m = haversine_m(
            out["latitude"].astype(float),
            out["longitude"].astype(float),
            lat,
            lon,
        )
    else:
        dist_m = pd.Series(np.inf, index=out.index)

    walk_time_to_new_facility = dist_m / walking_speed
    new_time = walk_time_to_new_facility.where(dist_m <= effect_radius, np.inf)

    out["scenario_time_min"] = np.minimum(out["baseline_time_min"], new_time)
    out["scenario_score"] = 100 * (
        1 - (out["scenario_time_min"].clip(lower=0) / threshold).clip(upper=1)
    )
    out["scenario_score"] = np.maximum(out["baseline_score"], out["scenario_score"])

    return out


def estimate_add_stop(
    origins: pd.DataFrame,
    location: dict[str, Any],
    params: dict[str, Any],
) -> pd.DataFrame:
    out = origins.copy()

    lat = float(location["latitude"])
    lon = float(location["longitude"])

    threshold = params["score_threshold_min"]
    effect_radius = params["stop_effect_radius_m"]

    if out["latitude"].notna().any() and out["longitude"].notna().any():
        dist_m = haversine_m(
            out["latitude"].astype(float),
            out["longitude"].astype(float),
            lat,
            lon,
        )
    else:
        dist_m = pd.Series(np.inf, index=out.index)

    proximity_factor = (1 - (dist_m / effect_radius)).clip(lower=0, upper=1)
    reduction_fraction = 0.20 * proximity_factor

    scenario_time = out["baseline_time_min"] * (1 - reduction_fraction)

    out["scenario_time_min"] = np.minimum(out["baseline_time_min"], scenario_time)
    out["scenario_score"] = 100 * (
        1 - (out["scenario_time_min"].clip(lower=0) / threshold).clip(upper=1)
    )
    out["scenario_score"] = np.maximum(out["baseline_score"], out["scenario_score"])
    return out


def summarize_simulation(origins: pd.DataFrame) -> dict[str, Any]:
    pop = origins["population"]
    baseline_time = origins["baseline_time_min"]
    scenario_time = origins["scenario_time_min"]
    baseline_score = origins["baseline_score"]
    scenario_score = origins["scenario_score"]

    time_reduction = (baseline_time - scenario_time).clip(lower=0)
    score_gain = (scenario_score - baseline_score).clip(lower=0)

    improved_mask = time_reduction > 0.1
    newly_covered_60 = (baseline_time > 60) & (scenario_time <= 60)

    return {
        "total_population": safe_number(pop.sum()),
        "population_improved": safe_number(pop[improved_mask].sum()),
        "newly_covered_population_60min": safe_number(pop[newly_covered_60].sum()),
        "average_travel_time_reduction_min": safe_number(weighted_mean(time_reduction, pop)),
        "average_accessibility_score_gain": safe_number(weighted_mean(score_gain, pop)),
        "avg_travel_time_before": safe_number(weighted_mean(baseline_time, pop)),
        "avg_travel_time_after": safe_number(weighted_mean(scenario_time, pop)),
        "avg_score_before": safe_number(weighted_mean(baseline_score, pop)),
        "avg_score_after": safe_number(weighted_mean(scenario_score, pop)),
    }


def zone_impacts(origins: pd.DataFrame) -> list[dict[str, Any]]:
    zone_col, district_col = get_zone_columns(origins)

    if not zone_col:
        return []

    rows = []

    for zone_name, group in origins.groupby(zone_col, dropna=False):
        pop = group["population"]
        time_reduction = (group["baseline_time_min"] - group["scenario_time_min"]).clip(lower=0)
        score_gain = (group["scenario_score"] - group["baseline_score"]).clip(lower=0)

        rows.append(
            {
                "zone_name": str(zone_name),
                "commune_name": str(zone_name),
                "district_name": str(group[district_col].iloc[0]) if district_col else str(zone_name),
                "population": safe_number(pop.sum()),
                "population_improved": safe_number(pop[time_reduction > 0.1].sum()),
                "average_travel_time_reduction_min": safe_number(weighted_mean(time_reduction, pop)),
                "average_accessibility_score_gain": safe_number(weighted_mean(score_gain, pop)),
            }
        )

    rows.sort(
        key=lambda r: r["population_improved"] if r["population_improved"] is not None else 0,
        reverse=True,
    )

    return rows[:15]

def build_scenario_surface(
    simulated: pd.DataFrame,
    grid_size_m: float = 750,
) -> dict[str, Any]:
    """
    Build a GeoJSON grid surface showing scenario impact.

    The geometry is generated from origin coordinates. Each grid cell contains
    population-weighted baseline/scenario metrics.
    """
    if simulated.empty:
        return {"type": "FeatureCollection", "features": []}

    df = simulated.copy()

    # Try to use projected x/y if available.
    x = pd.to_numeric(df.get("x"), errors="coerce")
    y = pd.to_numeric(df.get("y"), errors="coerce")

    has_projected_xy = x.notna().any() and y.notna().any()

    if has_projected_xy:
        looks_like_lonlat = (
            x.dropna().between(-180, 180).all()
            and y.dropna().between(-90, 90).all()
        )

        if looks_like_lonlat:
            # x/y are actually lon/lat, so project them.
            transformer_to_metric = Transformer.from_crs(
                "EPSG:4326",
                "EPSG:32629",
                always_xy=True,
            )
            metric_x, metric_y = transformer_to_metric.transform(
                x.to_numpy(),
                y.to_numpy(),
            )
            df["metric_x"] = metric_x
            df["metric_y"] = metric_y
        else:
            # x/y are already projected coordinates.
            df["metric_x"] = x
            df["metric_y"] = y

    else:
        # Fall back to latitude/longitude.
        lat = pd.to_numeric(df.get("latitude"), errors="coerce")
        lon = pd.to_numeric(df.get("longitude"), errors="coerce")

        if not lat.notna().any() or not lon.notna().any():
            return {"type": "FeatureCollection", "features": []}

        transformer_to_metric = Transformer.from_crs(
            "EPSG:4326",
            "EPSG:32629",
            always_xy=True,
        )
        metric_x, metric_y = transformer_to_metric.transform(
            lon.to_numpy(),
            lat.to_numpy(),
        )
        df["metric_x"] = metric_x
        df["metric_y"] = metric_y

    df = df.replace([np.inf, -np.inf], np.nan)
    df = df.dropna(
        subset=[
            "metric_x",
            "metric_y",
            "population",
            "baseline_time_min",
            "scenario_time_min",
            "baseline_score",
            "scenario_score",
        ]
    )

    if df.empty:
        return {"type": "FeatureCollection", "features": []}

    grid_size_m = float(grid_size_m)

    df["grid_x"] = np.floor(df["metric_x"] / grid_size_m) * grid_size_m
    df["grid_y"] = np.floor(df["metric_y"] / grid_size_m) * grid_size_m

    transformer_to_wgs84 = Transformer.from_crs(
        "EPSG:32629",
        "EPSG:4326",
        always_xy=True,
    )

    features = []

    for (grid_x, grid_y), group in df.groupby(["grid_x", "grid_y"]):
        pop = group["population"].fillna(0).clip(lower=0)

        baseline_time = group["baseline_time_min"]
        scenario_time = group["scenario_time_min"]
        baseline_score = group["baseline_score"]
        scenario_score = group["scenario_score"]

        time_reduction = (baseline_time - scenario_time).clip(lower=0)
        score_gain = (scenario_score - baseline_score).clip(lower=0)

        x0 = float(grid_x)
        y0 = float(grid_y)
        x1 = x0 + grid_size_m
        y1 = y0 + grid_size_m

        metric_corners = [
            (x0, y0),
            (x1, y0),
            (x1, y1),
            (x0, y1),
            (x0, y0),
        ]

        lon_values, lat_values = transformer_to_wgs84.transform(
            [point[0] for point in metric_corners],
            [point[1] for point in metric_corners],
        )

        coordinates = [
            [
                [float(lon), float(lat)]
                for lon, lat in zip(lon_values, lat_values)
            ]
        ]

        feature = {
            "type": "Feature",
            "geometry": {
                "type": "Polygon",
                "coordinates": coordinates,
            },
            "properties": {
                "population": safe_number(pop.sum()),
                "origin_count": int(len(group)),

                "baseline_travel_time_min": safe_number(
                    weighted_mean(baseline_time, pop)
                ),
                "scenario_travel_time_min": safe_number(
                    weighted_mean(scenario_time, pop)
                ),
                "time_reduction_min": safe_number(
                    weighted_mean(time_reduction, pop)
                ),

                "baseline_score": safe_number(
                    weighted_mean(baseline_score, pop)
                ),
                "scenario_score": safe_number(
                    weighted_mean(scenario_score, pop)
                ),
                "score_gain": safe_number(
                    weighted_mean(score_gain, pop)
                ),
            },
        }

        features.append(feature)

    return {
        "type": "FeatureCollection",
        "features": features,
    }


def safe_float(value: Any, default: float = 0.0) -> float:
    try:
        if value is None:
            return default
        value = float(value)
        if not np.isfinite(value):
            return default
        return value
    except Exception:
        return default


def recommendation_reason(
    scenario_type: str,
    summary: dict[str, Any],
    top_area: str | None,
) -> str:
    population_improved = safe_float(summary.get("population_improved"))
    newly_covered = safe_float(summary.get("newly_covered_population_60min"))
    score_gain = safe_float(summary.get("average_accessibility_score_gain"))
    time_saved = safe_float(summary.get("average_travel_time_reduction_min"))

    intervention_name = (
        "facility" if scenario_type == "add_facility" else "transport stop"
    )

    if population_improved <= 0 and score_gain <= 0:
        return (
            f"This candidate {intervention_name} location has limited estimated "
            "impact in the simplified preview model."
        )

    if newly_covered > 0:
        return (
            f"This candidate {intervention_name} location is recommended because "
            f"it improves access around {top_area or 'underserved areas'} and brings "
            "some population within the 60-minute threshold."
        )

    if score_gain >= 2 or time_saved >= 1:
        return (
            f"This candidate {intervention_name} location is recommended because "
            f"it creates a visible accessibility improvement around "
            f"{top_area or 'nearby underserved areas'}."
        )

    return (
        f"This candidate {intervention_name} location improves access for nearby "
        f"population around {top_area or 'underserved areas'}, but the estimated "
        "effect is moderate."
    )


def build_candidate_locations(
    origins: pd.DataFrame,
    max_candidates: int = 120,
) -> pd.DataFrame:
    """
    Select promising origin points to test as candidate intervention locations.

    We do not test every origin because origins.csv can be large.
    Instead, we prioritize populated underserved origins and deduplicate nearby points.
    """
    df = origins.copy()

    df = df.replace([np.inf, -np.inf], np.nan)
    df = df.dropna(
        subset=[
            "latitude",
            "longitude",
            "population",
            "baseline_time_min",
            "baseline_score",
        ]
    )

    if df.empty:
        return df

    df["population"] = pd.to_numeric(df["population"], errors="coerce").fillna(0)
    df["baseline_time_min"] = pd.to_numeric(
        df["baseline_time_min"], errors="coerce"
    )
    df["baseline_score"] = pd.to_numeric(df["baseline_score"], errors="coerce")

    df = df[
        (df["population"] > 0)
        & df["latitude"].between(-90, 90)
        & df["longitude"].between(-180, 180)
    ].copy()

    if df.empty:
        return df

    underserved = df[
        (df["baseline_score"] < 50) | (df["baseline_time_min"] > 45)
    ].copy()

    if not underserved.empty:
        df = underserved

    # Higher score = more populated and more underserved.
    score_deficit = (100 - df["baseline_score"]).clip(lower=0)
    time_penalty = (df["baseline_time_min"] - 45).clip(lower=0)

    df["candidate_priority"] = (
        df["population"]
        * (1 + score_deficit / 100)
        * (1 + time_penalty / 45)
    )

    df = df.sort_values("candidate_priority", ascending=False)

    # Deduplicate close candidates by rounding coordinates.
    # 3 decimals is roughly 100 meters, enough for candidate preview.
    df["candidate_lat_key"] = df["latitude"].round(3)
    df["candidate_lon_key"] = df["longitude"].round(3)

    df = df.drop_duplicates(
        subset=["candidate_lat_key", "candidate_lon_key"],
        keep="first",
    )

    return df.head(max_candidates).copy()


def score_recommendation(summary: dict[str, Any]) -> float:
    """
    Transparent rule-based score for ranking candidates.
    Population improved is the main driver.
    """
    population_improved = safe_float(summary.get("population_improved"))
    newly_covered = safe_float(summary.get("newly_covered_population_60min"))
    avg_time_saved = safe_float(summary.get("average_travel_time_reduction_min"))
    avg_score_gain = safe_float(summary.get("average_accessibility_score_gain"))

    return (
        population_improved
        + 2.0 * newly_covered
        + 10000.0 * avg_score_gain
        + 5000.0 * avg_time_saved
    )


def select_spatially_diverse_recommendations(
    recommendations: list[dict[str, Any]],
    limit: int = 5,
    min_distance_m: float = 1200,
) -> list[dict[str, Any]]:
    """
    Select top recommendations while forcing distance between selected sites.

    This prevents the top recommendations from all appearing next to each other.
    """
    selected: list[dict[str, Any]] = []

    for candidate in recommendations:
        candidate_lat = safe_float(candidate.get("latitude"), default=np.nan)
        candidate_lon = safe_float(candidate.get("longitude"), default=np.nan)

        if not np.isfinite(candidate_lat) or not np.isfinite(candidate_lon):
            continue

        too_close = False

        for chosen in selected:
            chosen_lat = safe_float(chosen.get("latitude"), default=np.nan)
            chosen_lon = safe_float(chosen.get("longitude"), default=np.nan)

            distance_m = haversine_m(
                candidate_lat,
                candidate_lon,
                chosen_lat,
                chosen_lon,
            )

            if float(distance_m) < min_distance_m:
                too_close = True
                break

        if not too_close:
            selected.append(candidate)

        if len(selected) >= limit:
            break

    return selected

def recommend_simulation_locations(
    city_id: str,
    scenario_type: str = "add_facility",
    limit: int = 5,
    max_candidates: int = 120,
) -> dict[str, Any]:
    """
    Recommend candidate locations for adding a facility or stop.

    These are planning candidates, not final optimal sites.
    """
    metadata = read_city_metadata(city_id)
    status = get_city_status(city_id)

    if not status["baseline_ready"]:
        return {
            "city_id": metadata["city_id"],
            "city_name": metadata["city_name"],
            "error": "Baseline package is incomplete.",
            "readiness": status,
            "recommendations": [],
        }

    scenario_type = str(scenario_type or "add_facility").strip().lower()

    if scenario_type not in {"add_facility", "add_stop"}:
        raise ValueError("scenario_type must be add_facility or add_stop.")

    limit = max(1, min(int(limit), 10))
    max_candidates = max(20, min(int(max_candidates), 250))

    origins, travel_time_col, score_col, metric_warnings = load_origin_baseline(city_id)
    scenario_params = normalize_payload(
        {
            "scenario_type": scenario_type,
            "score_threshold_min": 45,
            "walking_speed_m_per_min": 60,
            "facility_effect_radius_m": 3000,
            "stop_effect_radius_m": 1500,
            "grid_size_m": 750,
        }
    )

    candidates = build_candidate_locations(
        origins,
        max_candidates=max_candidates,
    )

    if candidates.empty:
        return {
            "city_id": metadata["city_id"],
            "city_name": metadata["city_name"],
            "scenario_type": scenario_type,
            "recommendations": [],
            "message": "No valid candidate origins with latitude/longitude were found.",
            "debug_columns_used": {
                "travel_time_col": travel_time_col,
                "score_col": score_col,
            },
        }

    recommendations: list[dict[str, Any]] = []

    for _, candidate in candidates.iterrows():
        location = {
            "latitude": float(candidate["latitude"]),
            "longitude": float(candidate["longitude"]),
        }

        if scenario_type == "add_facility":
            simulated = estimate_add_facility(origins, location, scenario_params)
        else:
            simulated = estimate_add_stop(origins, location, scenario_params)

        summary = summarize_simulation(simulated)
        impacts = zone_impacts(simulated)

        top_area = None
        if impacts:
            top_area = impacts[0].get("zone_name") or impacts[0].get("commune_name")

        recommendation_score = score_recommendation(summary)

        recommendations.append(
            {
                "latitude": location["latitude"],
                "longitude": location["longitude"],
                "recommendation_score": safe_number(recommendation_score),
                "population_improved": summary.get("population_improved"),
                "newly_covered_population_60min": summary.get(
                    "newly_covered_population_60min"
                ),
                "average_travel_time_reduction_min": summary.get(
                    "average_travel_time_reduction_min"
                ),
                "average_accessibility_score_gain": summary.get(
                    "average_accessibility_score_gain"
                ),
                "top_impacted_area": top_area,
                "reason": recommendation_reason(
                    scenario_type=scenario_type,
                    summary=summary,
                    top_area=top_area,
                ),
            }
        )

    recommendations.sort(
        key=lambda item: safe_float(item.get("recommendation_score")),
        reverse=True,
    )

    min_distance_m = 5000 if scenario_type == "add_facility" else 4000

    # Use stronger spacing for facilities than stops.
    # Facilities should be spread across larger areas.
    distance_steps = (
        [6000, 5000, 4000, 3000]
        if scenario_type == "add_facility"
        else [3000, 2500, 2000, 1500]
    )

    top_recommendations = []

    for distance_m in distance_steps:
        top_recommendations = select_spatially_diverse_recommendations(
            recommendations=recommendations,
            limit=limit,
            min_distance_m=distance_m,
        )

        if len(top_recommendations) >= limit:
            break


    for index, recommendation in enumerate(top_recommendations, start=1):
        recommendation["rank"] = index

    return {
        "city_id": metadata["city_id"],
        "city_name": metadata["city_name"],
        "scenario_type": scenario_type,
        "recommendations": top_recommendations,
        "warnings": metric_warnings,
        "note": (
            "Recommended locations are planning candidates generated from the "
            "simplified scenario model. They are not final optimal sites."
        ),
        "debug_columns_used": {
            "travel_time_col": travel_time_col,
            "score_col": score_col,
        },
    }

def run_simulation(city_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    metadata = read_city_metadata(city_id)
    status = get_city_status(city_id)

    if not status["baseline_ready"]:
        return {
            "city_id": metadata["city_id"],
            "city_name": metadata["city_name"],
            "error": "Baseline package is incomplete.",
            "readiness": status,
        }

    scenario = normalize_payload(payload)
    scenario_type = scenario["scenario_type"]

    origins, travel_time_col, score_col, metric_warnings = load_origin_baseline(city_id)

    warnings = [
        "Scenario preview estimate: this simplified mode estimates impacts without full schedule-based transport routing."
    ]

    warnings.extend(metric_warnings)

    if scenario_type == "add_facility":
        if not scenario["facility_locations"]:
            raise ValueError("add_facility scenario requires a location.")
        location = scenario["facility_locations"][0]
        simulated = estimate_add_facility(origins, location, scenario)
        added_facilities = [location]
        added_transport_stops = []

    elif scenario_type == "add_stop":
        if not scenario["transport_stop_locations"]:
            raise ValueError("add_stop scenario requires a location.")
        location = scenario["transport_stop_locations"][0]
        simulated = estimate_add_stop(origins, location, scenario)
        added_facilities = []
        added_transport_stops = [location]

    else:
        raise ValueError("scenario_type must be add_facility or add_stop.")

    if simulated["scenario_time_min"].equals(simulated["baseline_time_min"]):
        warnings.append(
            "No spatial improvement was detected. Ensure origins.csv includes latitude/longitude or add projected-coordinate support later."
        )

    sample_cols = [
        "origin_id",
        "population",
        "baseline_time_min",
        "scenario_time_min",
        "baseline_score",
        "scenario_score",
    ]

    sample_frame = simulated[sample_cols].head(200).replace([np.inf, -np.inf], np.nan)
    sample = sample_frame.where(pd.notna(sample_frame), None).to_dict(orient="records")

    impacts = zone_impacts(simulated)
    scenario_surface = build_scenario_surface(
        simulated,
        grid_size_m=scenario["grid_size_m"],
    )

    return {
        "city_id": metadata["city_id"],
        "city_name": metadata["city_name"],
        "analysis_unit": "commune",
        "scenario_type": scenario_type,
        "summary": summarize_simulation(simulated),
        "zone_impacts": impacts,
        "commune_impacts": impacts,
        "district_impacts": impacts,
        "scenario_surface": scenario_surface,
        "origin_metrics_sample": sample,
        "added_facilities": added_facilities,
        "added_transport_stops": added_transport_stops,
        "warnings": warnings,
        "debug_columns_used": {
            "travel_time_col": travel_time_col,
            "score_col": score_col,
        },
    }