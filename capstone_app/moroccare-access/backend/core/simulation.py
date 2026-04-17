from __future__ import annotations

import numpy as np
import pandas as pd


def apply_intervention(features_df: pd.DataFrame, scenario: dict) -> pd.DataFrame:
    df = features_df.copy()
    if df.empty:
        return df

    stop_density_multiplier = float(scenario.get("stop_density_multiplier", 1.0))
    reduce_nearest_stop_distance_pct = float(scenario.get("reduce_nearest_stop_distance_pct", 0.0))
    add_facilities = int(scenario.get("add_facilities", 0))

    df["stop_density"] = df["stop_density"] * stop_density_multiplier
    df["stop_density_1km"] = df["stop_density_1km"] * stop_density_multiplier
    df["distance_to_nearest_stop_m"] = df["distance_to_nearest_stop_m"] * (1.0 - reduce_nearest_stop_distance_pct)
    df["num_healthcare_facilities"] = df["num_healthcare_facilities"] + add_facilities
    df["healthcare_density_1km"] = df["num_healthcare_facilities"] / np.pi

    df["interaction_stop_pop_density"] = df["stop_density"] * df["population_density"]
    df["interaction_fac_pop"] = df["num_healthcare_facilities"] * df["population"]
    df["interaction_built_stop"] = df["local_edge_length_500m"] * df["stop_density"]

    clip_cols = [
        "distance_to_nearest_stop_m",
        "stop_density",
        "stop_density_1km",
        "num_healthcare_facilities",
        "healthcare_density_1km",
        "distance_to_city_center_km",
        "distance_to_nearest_node_m",
        "interaction_stop_pop_density",
        "interaction_fac_pop",
        "interaction_built_stop",
    ]
    df[clip_cols] = df[clip_cols].clip(lower=0.0)
    return df
