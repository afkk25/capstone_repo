from __future__ import annotations

import numpy as np
import pandas as pd


def safe_weighted_mean(values: pd.Series, weights: pd.Series) -> float | None:
    v = pd.to_numeric(values, errors="coerce")
    w = pd.to_numeric(weights, errors="coerce")
    mask = v.notna() & w.notna() & np.isfinite(v) & np.isfinite(w) & (w > 0)
    if mask.sum() == 0:
        return None
    ws = float(w[mask].sum())
    if ws <= 0:
        return None
    return float((v[mask] * w[mask]).sum() / ws)


def safe_weighted_share(mask: pd.Series, weights: pd.Series) -> float | None:
    w = pd.to_numeric(weights, errors="coerce")
    valid = w.notna() & np.isfinite(w) & (w > 0)
    if valid.sum() == 0:
        return None
    total = float(w[valid].sum())
    if total <= 0:
        return None
    return float(w[valid & mask.fillna(False)].sum() / total)


def aggregate_commune_summary(origins: pd.DataFrame) -> pd.DataFrame:
    if origins is None or origins.empty:
        return pd.DataFrame(columns=["commune_id", "commune_name", "district_name"])

    df = origins.copy()
    if "commune_id" not in df.columns:
        if "district_id" in df.columns:
            df["commune_id"] = df["district_id"]
        else:
            df["commune_id"] = "unknown"
    if "commune_name" not in df.columns:
        if "district_name" in df.columns:
            df["commune_name"] = df["district_name"]
        else:
            df["commune_name"] = df["commune_id"].astype(str)
    if "district_name" not in df.columns:
        if "district" in df.columns:
            df["district_name"] = df["district"]
        else:
            df["district_name"] = df["commune_name"]

    rows = []
    for (commune_id, commune_name, district_name), group in df.groupby(["commune_id", "commune_name", "district_name"], dropna=False):
        pop = pd.to_numeric(group.get("population"), errors="coerce")
        row = {
            "commune_id": str(commune_id),
            "district_id": str(commune_id),  # compatibility alias
            "commune_name": str(commune_name),
            "district_name": str(district_name),
            "population": float(pop.fillna(0).sum()),
            "population_raster": float(pop.fillna(0).sum()),  # compatibility alias
            "origin_count": int(len(group)),
            "avg_total_travel_time_min_pw": safe_weighted_mean(group.get("total_travel_time_min"), pop),
            "pop_weighted_accessibility_score": safe_weighted_mean(group.get("accessibility_score"), pop),
            "avg_walk_time_to_stop_min_pw": safe_weighted_mean(group.get("walk_time_to_stop_min"), pop) if "walk_time_to_stop_min" in group else None,
            "pop_weighted_score_2sfca": safe_weighted_mean(group.get("score_2sfca"), pop) if "score_2sfca" in group else None,
            "pct_pop_access_30min": safe_weighted_share(pd.to_numeric(group.get("total_travel_time_min"), errors="coerce") <= 30, pop)
            if "total_travel_time_min" in group
            else None,
            "pct_pop_access_60min": safe_weighted_share(pd.to_numeric(group.get("total_travel_time_min"), errors="coerce") <= 60, pop)
            if "total_travel_time_min" in group
            else None,
            "pct_pop_access_threshold": safe_weighted_share(group.get("is_access_threshold").astype(bool), pop)
            if "is_access_threshold" in group
            else None,
            "pct_pop_score_below_50": safe_weighted_share(pd.to_numeric(group.get("accessibility_score"), errors="coerce") < 50, pop)
            if "accessibility_score" in group
            else None,
            "unreachable_population": safe_weighted_share(group.get("is_unreachable").astype(bool), pop)
            if "is_unreachable" in group
            else None,
        }
        rows.append(row)

    return pd.DataFrame(rows)


def aggregate_district_summary(origins: pd.DataFrame) -> pd.DataFrame:
    # Compatibility alias. Commune is the primary analysis unit.
    return aggregate_commune_summary(origins)


def compute_kpis(origins: pd.DataFrame | None, facilities: pd.DataFrame | None, stops: pd.DataFrame | None, facilities_near_transit: int | None) -> dict:
    if origins is None:
        return {
            "population": None,
            "facility_count": int(len(facilities)) if facilities is not None else 0,
            "transport_stop_count": int(len(stops)) if stops is not None else 0,
            "facilities_near_transit": int(facilities_near_transit) if facilities_near_transit is not None else None,
            "average_access_time_min": None,
            "average_accessibility_score": None,
            "pct_population_within_30_min": None,
            "pct_population_within_60_min": None,
            "coverage_gap_pct": None,
        }
    pop = pd.to_numeric(origins.get("population"), errors="coerce")
    kpis = {
        "population": float(pop.fillna(0).sum()) if len(pop) else 0.0,
        "facility_count": int(len(facilities)) if facilities is not None else 0,
        "transport_stop_count": int(len(stops)) if stops is not None else 0,
        "facilities_near_transit": int(facilities_near_transit) if facilities_near_transit is not None else None,
        "average_access_time_min": safe_weighted_mean(origins.get("total_travel_time_min"), pop) if "total_travel_time_min" in origins else None,
        "average_accessibility_score": safe_weighted_mean(origins.get("accessibility_score"), pop) if "accessibility_score" in origins else None,
        "pct_population_within_30_min": safe_weighted_share(pd.to_numeric(origins.get("total_travel_time_min"), errors="coerce") <= 30, pop)
        if "total_travel_time_min" in origins
        else None,
        "pct_population_within_60_min": safe_weighted_share(pd.to_numeric(origins.get("total_travel_time_min"), errors="coerce") <= 60, pop)
        if "total_travel_time_min" in origins
        else None,
        "coverage_gap_pct": safe_weighted_share(pd.to_numeric(origins.get("accessibility_score"), errors="coerce") < 50, pop)
        if "accessibility_score" in origins
        else None,
    }
    return kpis
