from __future__ import annotations

from copy import deepcopy

from app.models.schemas import DistrictData, HospitalData


# Mocked seed data for the first app iteration.
DISTRICT_DATA: list[DistrictData] = [
    DistrictData(
        district_name="Anfa",
        population=226_000,
        accessibility_score=72.4,
        stop_density=18.2,
    ),
    DistrictData(
        district_name="Sidi Bernoussi",
        population=320_000,
        accessibility_score=54.8,
        stop_density=11.7,
    ),
    DistrictData(
        district_name="Hay Hassani",
        population=420_000,
        accessibility_score=49.1,
        stop_density=9.6,
    ),
    DistrictData(
        district_name="Sidi Othmane",
        population=360_000,
        accessibility_score=46.2,
        stop_density=8.9,
    ),
]

HOSPITAL_DATA: list[HospitalData] = [
    HospitalData(
        facility_name="CHU Ibn Rochd",
        predicted_accessibility=69.0,
        delta_transport=4.4,
        delta_network=3.2,
        population_served=540_000,
    ),
    HospitalData(
        facility_name="Hopital Moulay Hassan",
        predicted_accessibility=52.7,
        delta_transport=6.1,
        delta_network=2.8,
        population_served=370_000,
    ),
    HospitalData(
        facility_name="Hospital CNSS",
        predicted_accessibility=57.3,
        delta_transport=5.2,
        delta_network=2.1,
        population_served=410_000,
    ),
    HospitalData(
        facility_name="Clinique Andalouss",
        predicted_accessibility=61.6,
        delta_transport=3.8,
        delta_network=2.4,
        population_served=255_000,
    ),
]


def get_districts() -> list[DistrictData]:
    return DISTRICT_DATA


def get_hospitals() -> list[HospitalData]:
    return HOSPITAL_DATA


def simulate_hospital_predictions(
    increase_stop_density: float,
    increase_facilities: int,
) -> list[HospitalData]:
    # Mock policy effect formula designed for quick prototyping.
    transport_gain = increase_stop_density * 12.0
    facility_gain = float(increase_facilities) * 1.7

    updated = deepcopy(HOSPITAL_DATA)
    for item in updated:
        new_transport_delta = item.delta_transport + transport_gain
        new_network_delta = item.delta_network + (transport_gain * 0.35) + (facility_gain * 0.2)
        item.delta_transport = round(new_transport_delta, 2)
        item.delta_network = round(new_network_delta, 2)
        item.predicted_accessibility = round(
            min(100.0, item.predicted_accessibility + transport_gain + facility_gain),
            2,
        )
    return updated

