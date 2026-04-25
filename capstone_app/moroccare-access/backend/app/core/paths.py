from pathlib import Path

from .config import get_cities_root


def city_dir(city_id: str) -> Path:
    return get_cities_root() / city_id.strip().lower()


def ensure_city_dirs(city_id: str) -> Path:
    root = city_dir(city_id)
    root.mkdir(parents=True, exist_ok=True)
    (root / "raw").mkdir(parents=True, exist_ok=True)
    (root / "scenarios").mkdir(parents=True, exist_ok=True)
    return root
