from __future__ import annotations

import hashlib
from functools import lru_cache

import pandas as pd


@lru_cache(maxsize=32)
def get_cached_city_rows(city_id: str, freshness_token: str = "") -> tuple[pd.DataFrame, list[float]]:
    """
    Cache baseline rows to avoid recomputing city-level metrics repeatedly.
    Cache is in-process and safe for lightweight repeated API usage.
    """
    _ = freshness_token
    from routers.cities import ensure_baseline_data

    features_df, scores = ensure_baseline_data(city_id)
    return features_df.copy(), [float(x) for x in scores]


def city_freshness_token(city_id: str) -> str:
    """
    Build a lightweight token from city input and artifact mtimes.
    Cache keys change automatically when CSVs/artifacts change.
    """
    from core.config import city_dir
    from services.notebook_bridge.loaders import CityDataNotFoundError, get_city_paths

    folder = city_dir(city_id)
    paths = [
        folder / "healthcare.csv",
        folder / "transport_stops.csv",
        folder / "model.pkl",
        folder / "feature_names.json",
        folder / "features.csv",
        folder / "source_hash.txt",
        folder / "baseline_metadata.json",
        folder / "districts.geojson",
        folder / "districts.gpkg",
        folder / "origins.csv",
    ]
    try:
        notebook_paths = get_city_paths(city_id)
        paths.extend(
            [
                notebook_paths.interim_origin_metrics_csv,
                notebook_paths.interim_worldpop_origins_csv,
                notebook_paths.interim_worldpop_origin_points_csv,
                notebook_paths.final_district_summary_csv,
            ]
        )
    except CityDataNotFoundError:
        pass
    mtimes = []
    for p in paths:
        mtimes.append(f"{p.name}:{p.stat().st_mtime}" if p.exists() else f"{p.name}:missing")
    token = "|".join(mtimes)
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def clear_city_cache(city_id: str | None = None) -> None:
    """Clear all cached rows. Fine-grained invalidation can be added later."""
    _ = city_id
    get_cached_city_rows.cache_clear()
