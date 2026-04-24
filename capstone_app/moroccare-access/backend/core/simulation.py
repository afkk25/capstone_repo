from __future__ import annotations

import numpy as np
import pandas as pd

EARTH_RADIUS_M = 6_371_000.0
PLACEMENT_RADIUS_M = 1_000.0
MIN_SITE_SEPARATION_M = 750.0
STOP_RADIUS_500M = 500.0
STOP_RADIUS_1KM = 1_000.0
STOP_DENSITY_AREA_KM2 = np.pi * (0.5**2)


def _min_max_scale(values: np.ndarray) -> np.ndarray:
    if values.size == 0:
        return values
    min_val = float(np.nanmin(values))
    max_val = float(np.nanmax(values))
    if not np.isfinite(min_val) or not np.isfinite(max_val) or (max_val - min_val) < 1e-9:
        return np.zeros_like(values, dtype=float)
    return (values - min_val) / (max_val - min_val)


def _to_numeric_series(df: pd.DataFrame, col: str, default: float = 0.0) -> pd.Series:
    if col not in df.columns:
        return pd.Series(default, index=df.index, dtype=float)
    return pd.to_numeric(df[col], errors="coerce").fillna(default).astype(float)


def _haversine_distance_m(lat: float, lon: float, target_lats: np.ndarray, target_lons: np.ndarray) -> np.ndarray:
    lat1 = np.radians(float(lat))
    lon1 = np.radians(float(lon))
    lat2 = np.radians(target_lats)
    lon2 = np.radians(target_lons)
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = np.sin(dlat / 2.0) ** 2 + np.cos(lat1) * np.cos(lat2) * np.sin(dlon / 2.0) ** 2
    c = 2.0 * np.arcsin(np.sqrt(np.clip(a, 0.0, 1.0)))
    return EARTH_RADIUS_M * c


def _haversine_matrix_m(origin_lats: np.ndarray, origin_lons: np.ndarray, site_lats: np.ndarray, site_lons: np.ndarray) -> np.ndarray:
    if site_lats.size == 0:
        return np.zeros((origin_lats.shape[0], 0), dtype=float)

    lat1 = np.radians(origin_lats)[:, np.newaxis]
    lon1 = np.radians(origin_lons)[:, np.newaxis]
    lat2 = np.radians(site_lats)[np.newaxis, :]
    lon2 = np.radians(site_lons)[np.newaxis, :]

    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = np.sin(dlat / 2.0) ** 2 + np.cos(lat1) * np.cos(lat2) * np.sin(dlon / 2.0) ** 2
    c = 2.0 * np.arcsin(np.sqrt(np.clip(a, 0.0, 1.0)))
    return EARTH_RADIUS_M * c


def _extract_locations_from_scenario(scenario: dict, key: str) -> tuple[np.ndarray, np.ndarray]:
    raw_locations = scenario.get(key) or []
    if not isinstance(raw_locations, list):
        raise ValueError(f"'{key}' must be a list of objects with latitude and longitude")
    if not raw_locations:
        return np.array([], dtype=float), np.array([], dtype=float)

    lats: list[float] = []
    lons: list[float] = []
    for idx, item in enumerate(raw_locations):
        if not isinstance(item, dict):
            raise ValueError(f"Invalid {key}[{idx}] entry: expected object with latitude and longitude")
        if "latitude" not in item or "longitude" not in item:
            raise ValueError(f"Invalid {key}[{idx}] entry: missing latitude/longitude")
        lat = float(item["latitude"])
        lon = float(item["longitude"])
        if lat < -90.0 or lat > 90.0 or lon < -180.0 or lon > 180.0:
            raise ValueError(f"Invalid {key}[{idx}] entry: latitude/longitude out of range")
        lats.append(lat)
        lons.append(lon)
    return np.asarray(lats, dtype=float), np.asarray(lons, dtype=float)


def _origin_coordinates(features_df: pd.DataFrame) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    if "latitude" not in features_df.columns or "longitude" not in features_df.columns:
        raise ValueError("Latitude/longitude columns are required for spatial intervention placement")
    lat_series = pd.to_numeric(features_df["latitude"], errors="coerce")
    lon_series = pd.to_numeric(features_df["longitude"], errors="coerce")
    valid_mask = lat_series.notna() & lon_series.notna()
    return (
        lat_series.to_numpy(dtype=float),
        lon_series.to_numpy(dtype=float),
        valid_mask.to_numpy(dtype=bool),
    )


def _coverage_counts_for_sites(
    origin_lats: np.ndarray,
    origin_lons: np.ndarray,
    valid_origin_mask: np.ndarray,
    site_lats: np.ndarray,
    site_lons: np.ndarray,
    radius_m: float,
) -> np.ndarray:
    coverage = np.zeros(origin_lats.shape[0], dtype=float)
    if site_lats.size == 0 or not valid_origin_mask.any():
        return coverage
    valid_idx = np.where(valid_origin_mask)[0]
    dist = _haversine_matrix_m(origin_lats[valid_idx], origin_lons[valid_idx], site_lats, site_lons)
    coverage[valid_idx] = (dist <= radius_m).sum(axis=1).astype(float)
    return coverage


def _nearest_distance_to_sites(
    origin_lats: np.ndarray,
    origin_lons: np.ndarray,
    valid_origin_mask: np.ndarray,
    site_lats: np.ndarray,
    site_lons: np.ndarray,
) -> np.ndarray:
    nearest = np.full(origin_lats.shape[0], np.inf, dtype=float)
    if site_lats.size == 0 or not valid_origin_mask.any():
        return nearest
    valid_idx = np.where(valid_origin_mask)[0]
    dist = _haversine_matrix_m(origin_lats[valid_idx], origin_lons[valid_idx], site_lats, site_lons)
    nearest[valid_idx] = np.min(dist, axis=1)
    return nearest


def _derive_vulnerability(features_df: pd.DataFrame, baseline_scores: np.ndarray | None) -> tuple[np.ndarray, np.ndarray]:
    facility_supply = _to_numeric_series(features_df, "num_healthcare_facilities", default=0.0).to_numpy(dtype=float)
    stop_distance = _to_numeric_series(features_df, "distance_to_nearest_stop_m", default=0.0).clip(lower=0.0).to_numpy(dtype=float)

    if "population" in features_df.columns:
        population_pressure = _to_numeric_series(features_df, "population", default=0.0).clip(lower=0.0).to_numpy(dtype=float)
    else:
        population_pressure = _to_numeric_series(features_df, "population_density", default=0.0).clip(lower=0.0).to_numpy(dtype=float)

    supply_gap = 1.0 - _min_max_scale(facility_supply)
    transport_gap = _min_max_scale(stop_distance)
    pop_pressure = _min_max_scale(population_pressure)

    if baseline_scores is not None and len(baseline_scores) == len(features_df):
        base_scores = np.clip(np.asarray(baseline_scores, dtype=float), 0.0, 1.0)
        baseline_gap = 1.0 - base_scores
        underserved_threshold = float(np.percentile(base_scores, 25))
        underserved_mask = base_scores <= underserved_threshold
    else:
        baseline_gap = 0.6 * supply_gap + 0.4 * transport_gap
        underserved_threshold = float(np.percentile(baseline_gap, 75))
        underserved_mask = baseline_gap >= underserved_threshold

    vulnerability = 0.5 * baseline_gap + 0.25 * supply_gap + 0.15 * transport_gap + 0.10 * pop_pressure
    return vulnerability, underserved_mask


def _select_new_facility_sites(
    features_df: pd.DataFrame,
    vulnerability: np.ndarray,
    underserved_mask: np.ndarray,
    add_facilities: int,
    existing_site_lats: np.ndarray,
    existing_site_lons: np.ndarray,
) -> np.ndarray:
    coords = features_df[["latitude", "longitude"]].apply(pd.to_numeric, errors="coerce")
    valid_coords = coords.notna().all(axis=1).to_numpy(dtype=bool)
    if not valid_coords.any():
        return np.array([], dtype=int)

    ordered_idx = np.argsort(-vulnerability)
    primary = [idx for idx in ordered_idx if valid_coords[idx] and underserved_mask[idx]]
    fallback = [idx for idx in ordered_idx if valid_coords[idx] and not underserved_mask[idx]]
    candidates = primary + fallback

    lats = coords["latitude"].to_numpy(dtype=float)
    lons = coords["longitude"].to_numpy(dtype=float)
    selected: list[int] = []
    selected_set: set[int] = set()

    for idx in candidates:
        if len(selected) >= add_facilities:
            break
        if existing_site_lats.size:
            existing_dist = _haversine_distance_m(lats[idx], lons[idx], existing_site_lats, existing_site_lons)
            if float(np.min(existing_dist)) < MIN_SITE_SEPARATION_M:
                continue
        if not selected:
            selected.append(int(idx))
            selected_set.add(int(idx))
            continue
        dist = _haversine_distance_m(lats[idx], lons[idx], lats[np.array(selected, dtype=int)], lons[np.array(selected, dtype=int)])
        if float(np.min(dist)) >= MIN_SITE_SEPARATION_M:
            selected.append(int(idx))
            selected_set.add(int(idx))

    if len(selected) < add_facilities:
        for idx in candidates:
            if len(selected) >= add_facilities:
                break
            idx_int = int(idx)
            if idx_int in selected_set:
                continue
            if existing_site_lats.size:
                existing_dist = _haversine_distance_m(lats[idx_int], lons[idx_int], existing_site_lats, existing_site_lons)
                if float(np.min(existing_dist)) < 150.0:
                    continue
            selected.append(idx_int)
            selected_set.add(idx_int)

    return np.array(selected, dtype=int)


def _apply_spatial_facility_placement(
    features_df: pd.DataFrame,
    add_facilities: int,
    baseline_scores: np.ndarray | None,
    existing_site_lats: np.ndarray,
    existing_site_lons: np.ndarray,
) -> tuple[pd.DataFrame, np.ndarray, np.ndarray]:
    if add_facilities <= 0:
        return features_df, np.array([], dtype=float), np.array([], dtype=float)

    if "latitude" not in features_df.columns or "longitude" not in features_df.columns:
        raise ValueError("Latitude/longitude columns are required for add_facilities spatial placement")

    vulnerability, underserved_mask = _derive_vulnerability(features_df, baseline_scores)
    selected_idx = _select_new_facility_sites(
        features_df,
        vulnerability,
        underserved_mask,
        add_facilities,
        existing_site_lats=existing_site_lats,
        existing_site_lons=existing_site_lons,
    )
    if selected_idx.size == 0:
        return features_df, np.array([], dtype=float), np.array([], dtype=float)

    origin_lats, origin_lons, valid_origin_mask = _origin_coordinates(features_df)
    site_lats = origin_lats[selected_idx]
    site_lons = origin_lons[selected_idx]

    additional_supply = _coverage_counts_for_sites(
        origin_lats=origin_lats,
        origin_lons=origin_lons,
        valid_origin_mask=valid_origin_mask,
        site_lats=site_lats,
        site_lons=site_lons,
        radius_m=PLACEMENT_RADIUS_M,
    )
    features_df["num_healthcare_facilities"] = features_df["num_healthcare_facilities"] + additional_supply
    return features_df, site_lats, site_lons


def _apply_user_facility_locations(
    features_df: pd.DataFrame,
    facility_lats: np.ndarray,
    facility_lons: np.ndarray,
) -> pd.DataFrame:
    if facility_lats.size == 0:
        return features_df
    origin_lats, origin_lons, valid_origin_mask = _origin_coordinates(features_df)
    additional_supply = _coverage_counts_for_sites(
        origin_lats=origin_lats,
        origin_lons=origin_lons,
        valid_origin_mask=valid_origin_mask,
        site_lats=facility_lats,
        site_lons=facility_lons,
        radius_m=PLACEMENT_RADIUS_M,
    )
    features_df["num_healthcare_facilities"] = features_df["num_healthcare_facilities"] + additional_supply
    return features_df


def _apply_user_stop_locations(
    features_df: pd.DataFrame,
    stop_lats: np.ndarray,
    stop_lons: np.ndarray,
) -> pd.DataFrame:
    if stop_lats.size == 0:
        return features_df
    origin_lats, origin_lons, valid_origin_mask = _origin_coordinates(features_df)
    extra_stop_density = _coverage_counts_for_sites(
        origin_lats=origin_lats,
        origin_lons=origin_lons,
        valid_origin_mask=valid_origin_mask,
        site_lats=stop_lats,
        site_lons=stop_lons,
        radius_m=STOP_RADIUS_500M,
    ) / STOP_DENSITY_AREA_KM2
    extra_stop_count_1km = _coverage_counts_for_sites(
        origin_lats=origin_lats,
        origin_lons=origin_lons,
        valid_origin_mask=valid_origin_mask,
        site_lats=stop_lats,
        site_lons=stop_lons,
        radius_m=STOP_RADIUS_1KM,
    )
    nearest_custom_stop = _nearest_distance_to_sites(
        origin_lats=origin_lats,
        origin_lons=origin_lons,
        valid_origin_mask=valid_origin_mask,
        site_lats=stop_lats,
        site_lons=stop_lons,
    )

    features_df["stop_density"] = features_df["stop_density"] + extra_stop_density
    features_df["stop_density_1km"] = features_df["stop_density_1km"] + extra_stop_count_1km
    features_df["distance_to_nearest_stop_m"] = np.minimum(features_df["distance_to_nearest_stop_m"], nearest_custom_stop)
    return features_df


def _locations_to_payload(lats: np.ndarray, lons: np.ndarray, source: str) -> list[dict[str, float | str]]:
    return [
        {"latitude": float(lat), "longitude": float(lon), "source": source}
        for lat, lon in zip(lats.tolist(), lons.tolist())
    ]


def apply_intervention(
    features_df: pd.DataFrame,
    scenario: dict,
    baseline_scores: np.ndarray | None = None,
) -> tuple[pd.DataFrame, dict[str, list[dict[str, float | str]]]]:
    """
    Apply planning interventions by updating model features around affected origins.

    This is intentionally a transparent planning proxy: a new stop changes nearest-stop
    distance and stop-density features; a new facility changes healthcare-supply
    features. The trained model is then re-run by the caller. It does not compute a
    schedule-aware transit route or replace the notebook methodology.
    """
    df = features_df.copy()
    if df.empty:
        return df, {"added_facilities": [], "added_transport_stops": [], "auto_placed_facilities": []}

    stop_density_multiplier = float(scenario.get("stop_density_multiplier", 1.0))
    reduce_nearest_stop_distance_pct = float(scenario.get("reduce_nearest_stop_distance_pct", 0.0))
    add_facilities = int(scenario.get("add_facilities", 0))
    custom_facility_lats, custom_facility_lons = _extract_locations_from_scenario(scenario, "facility_locations")
    custom_stop_lats, custom_stop_lons = _extract_locations_from_scenario(scenario, "transport_stop_locations")
    existing_facility_lats, existing_facility_lons = _extract_locations_from_scenario(scenario, "existing_facility_locations")

    df["stop_density"] = _to_numeric_series(df, "stop_density", default=0.0)
    df["stop_density_1km"] = _to_numeric_series(df, "stop_density_1km", default=0.0)
    df["distance_to_nearest_stop_m"] = _to_numeric_series(df, "distance_to_nearest_stop_m", default=0.0)
    df["num_healthcare_facilities"] = _to_numeric_series(df, "num_healthcare_facilities", default=0.0)
    df["population"] = _to_numeric_series(df, "population", default=0.0)
    df["population_density"] = _to_numeric_series(df, "population_density", default=0.0)
    df["distance_to_city_center_km"] = _to_numeric_series(df, "distance_to_city_center_km", default=0.0)

    df["stop_density"] = df["stop_density"] * stop_density_multiplier
    df["stop_density_1km"] = df["stop_density_1km"] * stop_density_multiplier
    df["distance_to_nearest_stop_m"] = df["distance_to_nearest_stop_m"] * (1.0 - reduce_nearest_stop_distance_pct)
    df = _apply_user_stop_locations(df, custom_stop_lats, custom_stop_lons)
    df = _apply_user_facility_locations(df, custom_facility_lats, custom_facility_lons)
    all_existing_lats = existing_facility_lats
    all_existing_lons = existing_facility_lons
    if custom_facility_lats.size:
        all_existing_lats = np.concatenate([all_existing_lats, custom_facility_lats]) if all_existing_lats.size else custom_facility_lats
        all_existing_lons = np.concatenate([all_existing_lons, custom_facility_lons]) if all_existing_lons.size else custom_facility_lons

    df, auto_facility_lats, auto_facility_lons = _apply_spatial_facility_placement(
        df,
        add_facilities,
        baseline_scores,
        existing_site_lats=all_existing_lats,
        existing_site_lons=all_existing_lons,
    )
    df["healthcare_density_1km"] = df["num_healthcare_facilities"] / np.pi

    df["interaction_stop_pop_density"] = df["stop_density"] * df["population_density"]
    df["interaction_fac_pop"] = df["num_healthcare_facilities"] * df["population"]

    clip_cols = [
        "distance_to_nearest_stop_m",
        "stop_density",
        "stop_density_1km",
        "num_healthcare_facilities",
        "healthcare_density_1km",
        "distance_to_city_center_km",
        "interaction_stop_pop_density",
        "interaction_fac_pop",
    ]
    df[clip_cols] = df[clip_cols].clip(lower=0.0)
    return (
        df,
        {
            "added_facilities": _locations_to_payload(custom_facility_lats, custom_facility_lons, "user")
            + _locations_to_payload(auto_facility_lats, auto_facility_lons, "auto"),
            "added_transport_stops": _locations_to_payload(custom_stop_lats, custom_stop_lons, "user"),
            "auto_placed_facilities": _locations_to_payload(auto_facility_lats, auto_facility_lons, "auto"),
        },
    )
