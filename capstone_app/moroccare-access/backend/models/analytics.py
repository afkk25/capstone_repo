from __future__ import annotations

from pydantic import BaseModel, Field


class ComparePayload(BaseModel):
    stop_density_multiplier: float | None = Field(default=None, ge=0.1, le=3.0)
    reduce_nearest_stop_distance_pct: float | None = Field(default=None, ge=0.0, le=1.0)
    add_facilities: int | None = Field(default=None, ge=0, le=20)


class SensitivityPayload(BaseModel):
    walking_speed_mps: float = Field(default=1.0, ge=0.2, le=3.0)
    waiting_time_min: float = Field(default=10.0, ge=1.0, le=60.0)
    transport_speed_kmh: float = Field(default=20.0, ge=2.0, le=80.0)
