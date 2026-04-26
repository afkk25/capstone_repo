from typing import Any

import numpy as np
import pandas as pd

from app.services.city_store import city_dir, read_city_metadata, get_city_status
from app.services.baseline_engine import first_existing_column, weighted_mean, weighted_share, safe_number
from app.services.origin_metrics import prepare_origin_metrics

def compute_ranking(city_id: str) -> dict[str, Any]:
    folder = city_dir(city_id)
    metadata = read_city_metadata(city_id)
    status = get_city_status(city_id)

    if not status["baseline_ready"]:
        return {
            "city_id": metadata["city_id"],
            "city_name": metadata["city_name"],
            "analysis_unit": "commune",
            "ranking": [],
            "warnings": ["Baseline package is incomplete."],
        }

    origins_raw = pd.read_csv(folder / "origins.csv")
    metrics = prepare_origin_metrics(city_id, origins_raw)

    df = metrics.origins.copy()

    df["population"] = (
        pd.to_numeric(df["population"], errors="coerce")
        .fillna(0)
        .clip(lower=0)
    )

    df["travel_time_min"] = pd.to_numeric(
        df["baseline_time_min"],
        errors="coerce",
    )

    df["accessibility_score"] = pd.to_numeric(
        df["baseline_score"],
        errors="coerce",
    )

    travel_time_col = metrics.travel_time_col
    score_col = metrics.score_col

    # Commune is the preferred detailed unit. Fallback to district.
    if "commune" in df.columns:
        df["zone_name"] = df["commune"].astype(str)
    elif "commune_name" in df.columns:
        df["zone_name"] = df["commune_name"].astype(str)
    elif "district_name" in df.columns:
        df["zone_name"] = df["district_name"].astype(str)
    elif "district" in df.columns:
        df["zone_name"] = df["district"].astype(str)
    else:
        df["zone_name"] = "Unknown area"

    if "district_name" in df.columns:
        df["district_name"] = df["district_name"].astype(str)
    elif "district" in df.columns:
        df["district_name"] = df["district"].astype(str)
    else:
        df["district_name"] = df["zone_name"]

    rows: list[dict[str, Any]] = []

    for zone_name, group in df.groupby("zone_name", dropna=False):
        population = pd.to_numeric(group["population"], errors="coerce").fillna(0)

        row = {
            "zone_name": str(zone_name),
            "commune_name": str(zone_name),
            "district_name": str(group["district_name"].iloc[0]) if "district_name" in group.columns else str(zone_name),
            "population": safe_number(population.sum()),
            "origin_count": int(len(group)),
            "avg_total_travel_time_min_pw": safe_number(weighted_mean(group["travel_time_min"], population)),
            "pop_weighted_accessibility_score": safe_number(weighted_mean(group["accessibility_score"], population)),
            "pct_pop_access_30min": safe_number(weighted_share(group["travel_time_min"] <= 30, population)),
            "pct_pop_access_60min": safe_number(weighted_share(group["travel_time_min"] <= 60, population)),
            "pct_pop_score_below_50": safe_number(weighted_share(group["accessibility_score"] < 50, population)),
        }

        rows.append(row)

    # Weakest access first
    rows.sort(
        key=lambda r: (
            r["pop_weighted_accessibility_score"] is None,
            r["pop_weighted_accessibility_score"] if r["pop_weighted_accessibility_score"] is not None else 999,
        )
    )

    for index, row in enumerate(rows, start=1):
        row["rank"] = index

    return {
        "city_id": metadata["city_id"],
        "city_name": metadata["city_name"],
        "analysis_unit": "commune",
        "ranking": rows,
        "debug_columns_used": {
            "travel_time_col": travel_time_col,
            "score_col": score_col,
        },
        "warnings": metrics.warnings,
    }