import json
import re
from pathlib import Path
from typing import Any

from app.core.config import CITIES_DIR, BASELINE_REQUIRED_FILES, SIMULATION_REQUIRED_FILES


def slugify_city_id(value: str) -> str:
    text = str(value or "").strip().lower()
    text = re.sub(r"[^a-z0-9]+", "_", text)
    text = text.strip("_")
    if not text:
        raise ValueError("city_id is required")
    return text


def city_dir(city_id: str) -> Path:
    return CITIES_DIR / slugify_city_id(city_id)


def city_metadata_path(city_id: str) -> Path:
    return city_dir(city_id) / "city_metadata.json"


def read_city_metadata(city_id: str) -> dict[str, Any]:
    path = city_metadata_path(city_id)
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))

    return {
        "city_id": slugify_city_id(city_id),
        "city_name": slugify_city_id(city_id).replace("_", " ").title(),
    }


def write_city_metadata(city_id: str, city_name: str) -> None:
    folder = city_dir(city_id)
    folder.mkdir(parents=True, exist_ok=True)

    metadata = {
        "city_id": slugify_city_id(city_id),
        "city_name": city_name or slugify_city_id(city_id).replace("_", " ").title(),
    }

    city_metadata_path(city_id).write_text(
        json.dumps(metadata, indent=2),
        encoding="utf-8",
    )


def file_exists(city_id: str, filename: str) -> bool:
    return (city_dir(city_id) / filename).exists()


def get_city_status(city_id: str) -> dict[str, Any]:
    folder = city_dir(city_id)
    metadata = read_city_metadata(city_id)

    missing_baseline = [
        filename for filename in BASELINE_REQUIRED_FILES
        if not (folder / filename).exists()
    ]

    missing_simulation = [
        filename for filename in SIMULATION_REQUIRED_FILES
        if not (folder / filename).exists()
    ]

    baseline_ready = len(missing_baseline) == 0
    simulation_ready = baseline_ready and len(missing_simulation) == 0

    return {
        "city_id": metadata["city_id"],
        "city_name": metadata.get("city_name", metadata["city_id"].title()),
        "baseline_ready": baseline_ready,
        "simulation_ready": simulation_ready,
        "missing_baseline_files": missing_baseline,
        "missing_simulation_files": missing_simulation,
        "warnings": [],
    }


def list_city_statuses() -> list[dict[str, Any]]:
    CITIES_DIR.mkdir(parents=True, exist_ok=True)

    statuses: list[dict[str, Any]] = []

    for folder in sorted(CITIES_DIR.iterdir()):
        if folder.is_dir():
            statuses.append(get_city_status(folder.name))

    return statuses