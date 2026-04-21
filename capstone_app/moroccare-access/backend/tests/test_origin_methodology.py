import unittest
from unittest.mock import patch

import geopandas as gpd
import numpy as np
import pandas as pd
from shapely.geometry import Point

from core.features import compute_origin_features
from core.simulation import apply_intervention
from routers.cities import _build_analysis_frame, _district_summary_from_origins


class OriginMethodologyTests(unittest.TestCase):
    def setUp(self) -> None:
        self.city_config = {
            "city_id": "test-city",
            "display_name": "Test City",
            "center_lat": 33.58,
            "center_lon": -7.61,
            "crs_metric": "EPSG:32629",
            "urban_ring_radii_km": [8, 18, 999],
        }
        self.facilities_gdf = gpd.GeoDataFrame(
            {
                "name": ["F1", "F2"],
                "latitude": [33.58, 33.585],
                "longitude": [-7.61, -7.615],
            },
            geometry=[Point(-7.61, 33.58), Point(-7.615, 33.585)],
            crs="EPSG:4326",
        )
        self.stops_gdf = gpd.GeoDataFrame(
            {"stop_name": ["S1", "S2"], "latitude": [33.579, 33.586], "longitude": [-7.611, -7.616]},
            geometry=[Point(-7.611, 33.579), Point(-7.616, 33.586)],
            crs="EPSG:4326",
        )

    def test_origin_features_prefer_origin_rows(self) -> None:
        origins_df = pd.DataFrame(
            {
                "origin_id": ["o1", "o2", "o3"],
                "latitude": [33.5795, 33.582, 33.587],
                "longitude": [-7.6105, -7.613, -7.617],
                "population": [100, 150, 120],
                "pop_density_km2": [1000, 900, 1200],
                "district_name": ["D1", "D1", "D2"],
                "district_id": [1, 1, 2],
                "accessibility_score": [0.4, 0.6, 0.5],
            }
        )
        features = compute_origin_features(origins_df, self.facilities_gdf, self.stops_gdf, self.city_config)
        self.assertEqual(len(features), len(origins_df))
        self.assertTrue((features["analysis_unit"] == "origin").all())
        self.assertIn("origin_id", features.columns)
        self.assertIn("num_healthcare_facilities", features.columns)

    def test_simulation_returns_added_entities(self) -> None:
        features_df = pd.DataFrame(
            {
                "origin_id": ["o1", "o2"],
                "origin_name": ["O1", "O2"],
                "district_name": ["D1", "D2"],
                "latitude": [33.5795, 33.582],
                "longitude": [-7.6105, -7.613],
                "distance_to_nearest_stop_m": [300.0, 450.0],
                "stop_density": [4.0, 3.0],
                "stop_density_1km": [12.0, 10.0],
                "population": [100.0, 150.0],
                "population_density": [1000.0, 900.0],
                "num_healthcare_facilities": [2.0, 1.0],
                "healthcare_density_1km": [0.6, 0.3],
                "distance_to_city_center_km": [1.0, 2.0],
                "urban_ring": ["Inner", "Inner"],
                "interaction_stop_pop_density": [4000.0, 2700.0],
                "interaction_fac_pop": [200.0, 150.0],
            }
        )
        scenario = {
            "stop_density_multiplier": 1.0,
            "reduce_nearest_stop_distance_pct": 0.1,
            "add_facilities": 0,
            "facility_locations": [{"latitude": 33.581, "longitude": -7.612}],
            "transport_stop_locations": [{"latitude": 33.5805, "longitude": -7.6115}],
            "existing_facility_locations": [{"latitude": 33.58, "longitude": -7.61}],
        }
        simulated_df, entities = apply_intervention(features_df, scenario, baseline_scores=np.array([0.5, 0.55], dtype=float))
        self.assertEqual(len(simulated_df), len(features_df))
        self.assertEqual(len(entities["added_facilities"]), 1)
        self.assertEqual(len(entities["added_transport_stops"]), 1)

    def test_district_summary_aggregates_origin_rows(self) -> None:
        features_df = pd.DataFrame(
            {
                "origin_id": ["o1", "o2", "o3"],
                "district_name": ["D1", "D1", "D2"],
                "district_id": [1, 1, 2],
                "latitude": [33.57, 33.571, 33.59],
                "longitude": [-7.61, -7.612, -7.62],
                "population": [100, 200, 50],
            }
        )
        scores = np.array([0.4, 0.6, 0.5], dtype=float)
        summary = _district_summary_from_origins(features_df, scores)
        self.assertEqual(len(summary), 2)
        d1 = next(row for row in summary if row["district_name"] == "D1")
        self.assertEqual(d1["origin_count"], 2)
        self.assertAlmostEqual(d1["population"], 300.0)

    def test_fallback_metadata_is_explicit_when_origins_missing(self) -> None:
        with patch("routers.cities._load_city_origin_metrics", return_value=(pd.DataFrame(), ["origin missing"])):  # noqa: S106
            features_df, metadata = _build_analysis_frame("test-city", self.city_config, self.facilities_gdf, self.stops_gdf)
        self.assertEqual(metadata["analysis_unit"], "facility_proxy")
        self.assertTrue(metadata["warnings"])
        self.assertTrue((features_df["analysis_unit"] == "facility_proxy").all())


if __name__ == "__main__":
    unittest.main()
