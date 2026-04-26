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
    feature_names = list(X.columns)

    importances: np.ndarray | None = None
    if hasattr(model, "feature_importances_"):
        importances = np.asarray(model.feature_importances_, dtype=float)
    elif hasattr(model, "coef_"):
        coefs = np.asarray(model.coef_, dtype=float)
        if coefs.ndim == 2:
            coefs = np.mean(np.abs(coefs), axis=0)
        else:
            coefs = np.abs(coefs)
        importances = np.asarray(coefs, dtype=float)
    else:
        return [{"feature": "__message__", "importance": 0.0, "message": "Model does not expose feature_importances_ or coef_."}]

    if importances.shape[0] != len(feature_names):
        return [{"feature": "__message__", "importance": 0.0, "message": "Model explainability dimensions do not match feature columns."}]

    rows = pd.DataFrame({"feature": feature_names, "importance": importances})
    rows = rows.sort_values("importance", ascending=False).reset_index(drop=True)
    return rows.to_dict(orient="records")
