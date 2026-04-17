from __future__ import annotations

from typing import Iterable

import numpy as np


def safe_mean(values: Iterable[float]) -> float:
    """Return a finite mean for an iterable, defaulting to 0.0 when empty."""
    arr = np.asarray(list(values), dtype=float)
    if arr.size == 0:
        return 0.0
    return float(np.nanmean(arr))


def gini_coefficient(values: Iterable[float]) -> float:
    """Compute the Gini coefficient for non-negative values."""
    arr = np.asarray(list(values), dtype=float)
    arr = arr[np.isfinite(arr)]
    if arr.size == 0:
        return 0.0
    arr = np.clip(arr, 0.0, None)
    if np.all(arr == 0):
        return 0.0
    arr = np.sort(arr)
    n = arr.size
    index = np.arange(1, n + 1, dtype=float)
    return float((2.0 * np.sum(index * arr) / (n * np.sum(arr))) - (n + 1) / n)
