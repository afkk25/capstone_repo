from __future__ import annotations

import json
import pickle
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingRegressor

from core.config import city_dir

FEATURE_COLS = [
    "distance_to_nearest_stop_m",
    "stop_density",
    "stop_density_1km",
    "population",
    "population_density",
    "num_healthcare_facilities",
    "healthcare_density_1km",
    "distance_to_city_center_km",
    "local_edge_count_500m",
    "local_edge_length_500m",
    "nearest_node_degree",
    "distance_to_nearest_node_m",
    "interaction_stop_pop_density",
    "interaction_fac_pop",
    "interaction_built_stop",
    "neighbor_accessibility_mean",
]


def _target_accessibility_score(df: pd.DataFrame) -> pd.Series:
    inv_distance = 1.0 / df["distance_to_nearest_stop_m"].clip(lower=1e-6)
    stop_rank = df["stop_density"].rank(pct=True, ascending=True)
    inv_dist_rank = inv_distance.rank(pct=True, ascending=True)
    hc_rank = df["healthcare_density_1km"].rank(pct=True, ascending=True)
    return stop_rank * 0.4 + inv_dist_rank * 0.3 + hc_rank * 0.3


def train_model(features_df: pd.DataFrame, city_id: str) -> tuple[GradientBoostingRegressor, list[str], pd.DataFrame]:
    if features_df.empty:
        raise ValueError("Cannot train model on empty features")
    train_df = features_df.copy()
    train_df["accessibility_score"] = _target_accessibility_score(train_df)
    x = train_df[FEATURE_COLS].to_numpy(dtype=float)
    y = train_df["accessibility_score"].to_numpy(dtype=float)
    model = GradientBoostingRegressor(
        n_estimators=200,
        learning_rate=0.1,
        max_depth=5,
        subsample=0.9,
        random_state=42,
    )
    model.fit(x, y)
    city_path = city_dir(city_id)
    city_path.mkdir(parents=True, exist_ok=True)

    model_path = city_path / "model.pkl"
    feature_path = city_path / "feature_names.json"
    features_path = city_path / "features.csv"
    with model_path.open("wb") as f:
        pickle.dump(model, f)
    feature_path.write_text(json.dumps(FEATURE_COLS, indent=2), encoding="utf-8")
    train_df.to_csv(features_path, index=False)
    return model, FEATURE_COLS, train_df


def load_model(city_id: str) -> tuple[GradientBoostingRegressor, list[str], pd.DataFrame]:
    city_path = city_dir(city_id)
    model_path = city_path / "model.pkl"
    feature_path = city_path / "feature_names.json"
    features_path = city_path / "features.csv"

    if not model_path.exists() or not feature_path.exists() or not features_path.exists():
        raise FileNotFoundError(f"Model artifacts are missing for city '{city_id}'")

    with model_path.open("rb") as f:
        model = pickle.load(f)
    feature_names = json.loads(feature_path.read_text(encoding="utf-8"))
    features_df = pd.read_csv(features_path)
    return model, feature_names, features_df


def predict(model: GradientBoostingRegressor, features_df: pd.DataFrame, feature_names: list[str]) -> np.ndarray:
    if features_df.empty:
        return np.array([], dtype=float)
    scores = model.predict(features_df[feature_names].to_numpy(dtype=float))
    return np.clip(scores, 0, 1)
