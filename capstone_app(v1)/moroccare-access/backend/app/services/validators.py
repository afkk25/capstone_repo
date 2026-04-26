from __future__ import annotations

from app.core.schemas import CityFiles, CityReadiness


def validate_readiness(files: CityFiles, warnings: list[str] | None = None) -> CityReadiness:
    warnings = list(warnings or [])
    missing: list[str] = []

    baseline_missing = []
    if not files.origins:
        baseline_missing.append("origins")
    if not files.facilities:
        baseline_missing.append("facilities")
    if not files.districts:
        baseline_missing.append("districts")
    if not files.stops:
        baseline_missing.append("stops")

    simulation_missing = []
    if not files.origins:
        simulation_missing.append("origins")
    if not files.facilities:
        simulation_missing.append("facilities")
    if not files.stops:
        simulation_missing.append("stops")
    if not files.route_stops:
        simulation_missing.append("route_stops")
    if not files.route_vertices:
        simulation_missing.append("route_vertices")
    if not files.districts:
        simulation_missing.append("districts")

    missing.extend(sorted(set(baseline_missing + simulation_missing)))
    return CityReadiness(
        baseline_ready=len(baseline_missing) == 0,
        simulation_ready=len(simulation_missing) == 0,
        missing_files=missing,
        warnings=warnings,
    )
