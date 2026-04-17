from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd


def compute_feature_importance(model: Any, X: pd.DataFrame) -> list[dict[str, float | str]]:
    """
    Compute lightweight model explainability using feature_importances_ when available.
    Returns sorted feature importance rows.
    """
    if X.empty:
        return []
    if not hasattr(model, "feature_importances_"):
        return []

    importances = np.asarray(model.feature_importances_, dtype=float)
    feature_names = list(X.columns)
    if importances.shape[0] != len(feature_names):
        return []

    rows = pd.DataFrame({"feature": feature_names, "importance": importances})
    rows = rows.sort_values("importance", ascending=False).reset_index(drop=True)
    return rows.to_dict(orient="records")
