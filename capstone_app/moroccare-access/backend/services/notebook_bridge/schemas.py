from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class ErrorResponse(BaseModel):
    detail: str


class SummaryMetrics(BaseModel):
    avg_travel_time: float = 0.0
    pct_above_45min: float = 0.0
    underserved_population: float = 0.0
    avg_accessibility_score: float = 0.0


class DistrictAnalysisRow(BaseModel):
    district_id: str | int | None = None
    district_name: str | None = None
    population_raster: float | None = None
    origin_count: float | None = None
    avg_walk_time_to_stop_min_pw: float | None = None
    avg_total_travel_time_min_pw: float | None = None
    pop_weighted_accessibility_score: float | None = None
    pop_weighted_score_2sfca: float | None = None
    pct_pop_access_30min: float | None = None
    pct_pop_score_below_50: float | None = None
    rank: int | None = None


class DistrictAnalysisResponse(BaseModel):
    city_id: str
    rows: list[DistrictAnalysisRow] = Field(default_factory=list)


class EquityMetrics(BaseModel):
    threshold_25: float | None = None
    below_threshold_by_ring: dict[str, float] = Field(default_factory=dict)
    ring_summary: dict[str, dict[str, float | int]] = Field(default_factory=dict)
    priority_table: list[dict[str, Any]] = Field(default_factory=list)


class AccessibilityDistributionBin(BaseModel):
    bin_left: float
    bin_right: float
    count: int


class AccessibilityDistributionResponse(BaseModel):
    city_id: str
    bins: list[AccessibilityDistributionBin] = Field(default_factory=list)
    total_count: int = 0


class BaselineSummaryResponse(BaseModel):
    city_id: str
    summary: SummaryMetrics


class RankingRow(BaseModel):
    district: str
    avg_accessibility_score: float
    underserved_pct: float
    population: float
    rank: int


class RankingResponse(BaseModel):
    city_id: str
    ranking: list[RankingRow] = Field(default_factory=list)


class CompareScenarioRequest(BaseModel):
    stop_density_multiplier: float | None = None
    reduce_nearest_stop_distance_pct: float | None = None
    add_facilities: int | None = None
    walking_speed_mps: float | None = None
    waiting_time_min: float | None = None
    transport_speed_kmh: float | None = None


class CompareScenarioOutput(BaseModel):
    delta_travel_time: float = 0.0
    delta_accessibility: float = 0.0
    improvement_percentage: float = 0.0
    inequality_change: float = 0.0


class CompareScenarioResponse(BaseModel):
    city_id: str
    scenario: dict[str, Any]
    comparison: CompareScenarioOutput
    districts_improved: int = 0
    districts_total: int = 0
    population_affected: float = 0.0
    ranking_before: list[RankingRow] = Field(default_factory=list)
    ranking_after: list[RankingRow] = Field(default_factory=list)


class ModelMetricsResponse(BaseModel):
    city_id: str
    metrics: dict[str, float | int | str] = Field(default_factory=dict)


class FeatureImportanceRow(BaseModel):
    feature: str
    importance: float


class FeatureImportanceResponse(BaseModel):
    city_id: str
    feature_importance: list[FeatureImportanceRow] = Field(default_factory=list)


class PredictRequest(BaseModel):
    rows: list[dict[str, Any]] = Field(default_factory=list)


class PredictResponse(BaseModel):
    city_id: str
    predictions: list[float] = Field(default_factory=list)


class UnderservedClassificationRow(BaseModel):
    row_id: str | int | None = None
    underserved: bool
    probability: float | None = None


class UnderservedClassificationResponse(BaseModel):
    city_id: str
    rows: list[UnderservedClassificationRow] = Field(default_factory=list)


class ScenarioRankRequest(BaseModel):
    scenarios: list[dict[str, Any]] = Field(default_factory=list)


class RecommendationRow(BaseModel):
    rank: int
    scenario: str
    district_improvement: float
    inequality_reduction: float
    population_impact: float
    score: float
    explanation: str


class RecommendationResponse(BaseModel):
    city_id: str
    recommendations: list[RecommendationRow] = Field(default_factory=list)

