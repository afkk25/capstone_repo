from pathlib import Path

import pandas as pd


def read_csv_header(path: Path) -> list[str]:
    df = pd.read_csv(path, nrows=5)
    return list(df.columns)


def validate_columns(path: Path, required_any: list[list[str]], required_all: list[str]) -> list[str]:
    warnings: list[str] = []

    try:
        columns = set(read_csv_header(path))
    except Exception as exc:
        return [f"Could not read {path.name}: {exc}"]

    for col in required_all:
        if col not in columns:
            warnings.append(f"{path.name} missing required column: {col}")

    for group in required_any:
        if not any(col in columns for col in group):
            warnings.append(
                f"{path.name} must include at least one of: {', '.join(group)}"
            )

    return warnings


def validate_city_files(city_folder: Path) -> list[str]:
    warnings: list[str] = []

    files = {
        "origins.csv": {
            "all": ["origin_id", "population", "x", "y"],
            "any": [],
        },
        "healthcare.csv": {
            "all": ["name", "latitude", "longitude"],
            "any": [],
        },
        "transport_stops.csv": {
            "all": ["stop_name", "latitude", "longitude"],
            "any": [["cluster_id", "stop_key"]],
        },
        "districts.csv": {
            "all": ["geometry"],
            "any": [["district", "district_name", "commune", "commune_name"]],
        },
        "route_stops.csv": {
            "all": ["stop_key", "x", "y"],
            "any": [],
        },
        "route_vertices.csv": {
            "all": ["route_id", "vertex_order", "x", "y"],
            "any": [],
        },
    }

    for filename, rule in files.items():
        path = city_folder / filename
        if path.exists():
            warnings.extend(
                validate_columns(
                    path,
                    required_all=rule["all"],
                    required_any=rule["any"],
                )
            )

    return warnings