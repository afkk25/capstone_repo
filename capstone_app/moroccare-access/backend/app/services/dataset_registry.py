from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class FileTypeSpec:
    key: str
    required_columns: tuple[str, ...]
    useful_columns: tuple[str, ...] = ()
    normalized_filename: str | None = None
    required_for_baseline: bool = False
    required_for_simulation: bool = False


FILE_TYPE_SPECS: dict[str, FileTypeSpec] = {
    "origins": FileTypeSpec(
        key="origins",
        required_columns=("origin_id", "population", "x", "y"),
        useful_columns=(
            "district_id",
            "district_name",
            "total_travel_time_min",
            "accessibility_score",
            "score_2sfca",
            "num_facilities_reachable_30min",
            "num_facilities_reachable_60min",
        ),
        normalized_filename="origins.csv",
        required_for_baseline=True,
        required_for_simulation=True,
    ),
    "facilities": FileTypeSpec(
        key="facilities",
        required_columns=("name", "latitude", "longitude"),
        useful_columns=("geometry", "type", "capacity"),
        normalized_filename="healthcare.csv",
        required_for_baseline=True,
        required_for_simulation=True,
    ),
    "transport_stops": FileTypeSpec(
        key="transport_stops",
        required_columns=("cluster_id", "stop_name", "latitude", "longitude"),
        useful_columns=("Lines", "mode"),
        normalized_filename="transport_stops.csv",
    ),
    "route_stops": FileTypeSpec(
        key="route_stops",
        required_columns=("stop_key", "x", "y"),
        useful_columns=("cluster_id", "stop_id", "stop_name", "Lines", "mode", "latitude", "longitude"),
        normalized_filename="route_stops.csv",
        required_for_simulation=True,
    ),
    "route_vertices": FileTypeSpec(
        key="route_vertices",
        required_columns=("route_id", "vertex_order", "x", "y"),
        useful_columns=("source",),
        normalized_filename="route_vertices.csv",
        required_for_simulation=True,
    ),
    "districts": FileTypeSpec(
        key="districts",
        required_columns=("geometry",),
        useful_columns=("district", "district_name", "commune", "commune_type_encoded"),
        normalized_filename="districts.csv",
        required_for_baseline=True,
        required_for_simulation=True,
    ),
    "district_summary": FileTypeSpec(
        key="district_summary",
        required_columns=(
            "district_id",
            "district_name",
            "population_raster",
            "origin_count",
            "avg_total_travel_time_min_pw",
            "pop_weighted_accessibility_score",
        ),
        useful_columns=(
            "avg_walk_time_to_stop_min_pw",
            "pop_weighted_score_2sfca",
            "pct_pop_access_threshold",
            "pct_pop_score_below_50",
        ),
        normalized_filename="district_accessibility_summary.csv",
    ),
    "unknown": FileTypeSpec(key="unknown", required_columns=()),
}

SUPPORTED_FILE_TYPES = tuple(FILE_TYPE_SPECS.keys())
BASELINE_REQUIRED_TYPES = {"origins", "facilities", "districts", "transport_stops"}
SIMULATION_REQUIRED_TYPES = {"origins", "facilities", "districts", "transport_stops", "route_stops", "route_vertices"}
OPTIONAL_FILE_TYPES = {"transport_stops", "district_summary"}

TRUSTED_ORIGIN_BASELINES = {"worldpop_origins.csv", "origin_accessibility_metrics.csv", "origins.csv"}
LEGACY_ORIGIN_POINT_FILES = {"worldpop_origin_points.csv"}


def normalized_filename(file_type: str) -> str:
    spec = FILE_TYPE_SPECS[file_type]
    return spec.normalized_filename or f"{file_type}.csv"


def required_columns(file_type: str) -> tuple[str, ...]:
    return FILE_TYPE_SPECS[file_type].required_columns
