from __future__ import annotations

import pandas as pd

from app.services.aggregation import safe_weighted_mean


def underserved_origins(origins: pd.DataFrame) -> pd.DataFrame:
    if origins is None or origins.empty:
        return pd.DataFrame(columns=origins.columns if origins is not None else [])
    tt = pd.to_numeric(origins.get("total_travel_time_min"), errors="coerce")
    score = pd.to_numeric(origins.get("accessibility_score"), errors="coerce")
    return origins[(score < 50) | (tt > 60)].copy()


def district_recommendations(origins: pd.DataFrame, top_n: int = 5) -> list[dict]:
    under = underserved_origins(origins)
    if under.empty:
        return []

    rows = []
    if "commune_id" not in under.columns:
        under["commune_id"] = under.get("district_id")
    if "commune_name" not in under.columns:
        under["commune_name"] = under.get("district_name")
    if "district_name" not in under.columns:
        under["district_name"] = under.get("commune_name")

    for (commune_id, commune_name, district_name), grp in under.groupby(["commune_id", "commune_name", "district_name"], dropna=False):
        pop = pd.to_numeric(grp.get("population"), errors="coerce").fillna(0)
        rows.append(
            {
                "commune_id": str(commune_id),
                "district_id": str(commune_id),
                "commune_name": str(commune_name),
                "district_name": str(district_name),
                "underserved_population": float(pop.sum()),
                "avg_accessibility_score": safe_weighted_mean(grp.get("accessibility_score"), pop),
                "avg_total_travel_time_min": safe_weighted_mean(grp.get("total_travel_time_min"), pop),
            }
        )

    out = pd.DataFrame(rows).sort_values("underserved_population", ascending=False).head(top_n)
    out["rank"] = range(1, len(out) + 1)
    return out.to_dict(orient="records")


def recommended_placements(origins: pd.DataFrame, top_n: int = 10) -> list[dict]:
    under = underserved_origins(origins)
    if under.empty:
        return []

    cols = [c for c in ["origin_id", "district_name", "population", "accessibility_score", "total_travel_time_min"] if c in under.columns]
    selected = under.sort_values("population", ascending=False).head(top_n)

    rows = []
    for row in selected.itertuples():
        rows.append(
            {
                "origin_id": getattr(row, "origin_id", None),
                "district_name": getattr(row, "district_name", None),
                "latitude": getattr(row, "geometry").y if hasattr(row, "geometry") and row.geometry is not None else None,
                "longitude": getattr(row, "geometry").x if hasattr(row, "geometry") and row.geometry is not None else None,
                "local_population": float(getattr(row, "population", 0) or 0),
                "baseline_accessibility": float(getattr(row, "accessibility_score", 0) or 0),
                "method": "underserved_origin_centroid",
                "reason": "high-need origin with poor accessibility",
            }
        )
    return rows
