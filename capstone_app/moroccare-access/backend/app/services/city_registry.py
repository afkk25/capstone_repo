from __future__ import annotations

import logging
from pathlib import Path
from threading import Lock

from app.core.config import get_cities_root
from app.core.schemas import CacheEntry, CityBundle
from app.services.data_loader import city_signature, city_status, find_city_files, load_city_bundle

logger = logging.getLogger("moroccare")

_CACHE: dict[str, CacheEntry] = {}
_CACHE_GUARD = Lock()


def clear_city_bundle_cache() -> None:
    with _CACHE_GUARD:
        _CACHE.clear()


def _get_lock(city_id: str) -> Lock:
    with _CACHE_GUARD:
        if city_id not in _CACHE:
            _CACHE[city_id] = CacheEntry(signature="", bundle=None, lock=Lock())  # type: ignore[arg-type]
        return _CACHE[city_id].lock


def get_city_bundle(city_id: str) -> CityBundle:
    city_id = city_id.strip().lower()
    files = find_city_files(city_id)
    sig = city_signature(city_id, files)

    with _CACHE_GUARD:
        existing = _CACHE.get(city_id)
        if existing and existing.signature == sig and existing.bundle is not None:
            logger.info("Cache hit for city %s", city_id)
            return existing.bundle

    lock = _get_lock(city_id)
    with lock:
        with _CACHE_GUARD:
            existing = _CACHE.get(city_id)
            if existing and existing.signature == sig and existing.bundle is not None:
                logger.info("Cache hit for city %s", city_id)
                return existing.bundle

        logger.info("Cache miss for city %s", city_id)
        bundle = load_city_bundle(city_id)
        with _CACHE_GUARD:
            _CACHE[city_id] = CacheEntry(signature=sig, bundle=bundle, lock=lock)
        return bundle


def list_city_ids() -> list[str]:
    root = get_cities_root()
    if not root.exists():
        return []
    return sorted([p.name for p in root.iterdir() if p.is_dir()])


def list_city_statuses() -> list[dict]:
    rows = []
    for city_id in list_city_ids():
        try:
            bundle = get_city_bundle(city_id)
            st = city_status(city_id, bundle)
            rows.append(
                {
                    "city_id": city_id,
                    "city_name": st["city_name"],
                    "baseline_ready": st["baseline_ready"],
                    "simulation_ready": st["simulation_ready"],
                    "missing_files": st["missing_files"],
                    "warnings": st["warnings"],
                    "id": city_id,
                    "name": st["city_name"],
                }
            )
        except Exception as exc:
            logger.exception("Failed to load city status for %s", city_id)
            rows.append(
                {
                    "city_id": city_id,
                    "city_name": city_id.title(),
                    "baseline_ready": False,
                    "simulation_ready": False,
                    "missing_files": ["unknown"],
                    "warnings": [str(exc)],
                    "id": city_id,
                    "name": city_id.title(),
                }
            )
    return rows


def get_city_status(city_id: str) -> dict:
    bundle = get_city_bundle(city_id)
    return city_status(city_id, bundle)
