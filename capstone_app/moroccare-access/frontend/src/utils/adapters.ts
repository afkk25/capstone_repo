import type {
  BaselineFacilityDto,
  BaselineResponse,
  ComparisonResponse,
  FrontendDistrict,
  RankingResponse,
  RecommendationResponse,
  SummaryResponse
} from "../types/api";
import type { DashboardSummary } from "../types/ui";

export const FALLBACK_CENTER = { center_lat: 33.5731, center_lon: -7.5898 };

export function toSafeNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function scoreToTravelMinutes(score: number): number {
  const clipped = Math.max(0, Math.min(1, score));
  return (1 - clipped) * 60;
}

export function normalizeFacility(row: BaselineFacilityDto, index = 0): FrontendDistrict {
  const accessibilityScore = toSafeNumber(row.simulated_score ?? row.accessibility_score, 0);
  const baselineScore = toSafeNumber(row.baseline_score ?? row.accessibility_score ?? accessibilityScore, accessibilityScore);
  const travelTimeMin = toSafeNumber(row.travel_time_min, scoreToTravelMinutes(accessibilityScore));

  return {
    id: String(row.id ?? row.name ?? row.district_name ?? `district-${index}`),
    districtName: String(row.district_name ?? row.name ?? `District ${index + 1}`),
    urbanRing: String(row.urban_ring ?? "Unknown"),
    latitude: toSafeNumber(row.latitude, 0),
    longitude: toSafeNumber(row.longitude, 0),
    geometry: row.geometry,
    accessibilityScore,
    baselineScore,
    travelTimeMin,
    score2sfca: toSafeNumber(row.score_2sfca, 0),
    underserved: toSafeNumber(row.underserved ?? (accessibilityScore < 0.5 ? 1 : 0), 0) >= 1 ? 1 : 0,
    population: toSafeNumber(row.population, 0),
    delta: toSafeNumber(row.delta, accessibilityScore - baselineScore)
  };
}

export function normalizeBaselineFacilities(payload: BaselineResponse | null | undefined): FrontendDistrict[] {
  const rows = Array.isArray(payload?.facilities) ? payload.facilities : [];
  return rows
    .map(normalizeFacility)
    .filter((row) => Number.isFinite(row.latitude) && Number.isFinite(row.longitude) && row.latitude !== 0 && row.longitude !== 0);
}

export function dashboardSummary(rows: FrontendDistrict[]): DashboardSummary {
  if (!rows.length) {
    return {
      averageAccessibility: 0,
      averageTravelTime: 0,
      underservedCount: 0,
      underservedPct: 0,
      bestDistrict: null,
      worstDistrict: null
    };
  }

  const sortedByScore = [...rows].sort((a, b) => a.accessibilityScore - b.accessibilityScore);
  const underservedCount = rows.filter((row) => row.underserved === 1).length;

  return {
    averageAccessibility: rows.reduce((sum, row) => sum + row.accessibilityScore, 0) / rows.length,
    averageTravelTime: rows.reduce((sum, row) => sum + row.travelTimeMin, 0) / rows.length,
    underservedCount,
    underservedPct: (underservedCount / rows.length) * 100,
    bestDistrict: sortedByScore[sortedByScore.length - 1] ?? null,
    worstDistrict: sortedByScore[0] ?? null
  };
}

export function mergeSummary(dashboard: DashboardSummary, summaryPayload?: SummaryResponse | null): DashboardSummary {
  if (!summaryPayload?.summary) return dashboard;
  const s = summaryPayload.summary;
  return {
    ...dashboard,
    averageAccessibility: toSafeNumber(s.avg_accessibility_score, dashboard.averageAccessibility),
    averageTravelTime: toSafeNumber(s.avg_travel_time, dashboard.averageTravelTime)
  };
}

export function topBottomDistricts(rows: FrontendDistrict[], count = 5) {
  const sortedAsc = [...rows].sort((a, b) => a.accessibilityScore - b.accessibilityScore);
  const sortedDesc = [...rows].sort((a, b) => b.accessibilityScore - a.accessibilityScore);
  return {
    bottom: sortedAsc.slice(0, count),
    top: sortedDesc.slice(0, count)
  };
}

export function scoreDistribution(rows: FrontendDistrict[], bucketSize = 0.1): { bucket: string; count: number }[] {
  const output: { bucket: string; count: number }[] = [];
  for (let start = 0; start < 1; start += bucketSize) {
    const end = Number((start + bucketSize).toFixed(1));
    output.push({
      bucket: `${start.toFixed(1)}-${end.toFixed(1)}`,
      count: rows.filter((row) => row.accessibilityScore >= start && row.accessibilityScore < end).length
    });
  }
  return output;
}

export function safeRankingRows(payload?: RankingResponse | null) {
  return Array.isArray(payload?.ranking) ? payload.ranking : [];
}

export function safeRecommendations(payload?: RecommendationResponse | null) {
  return Array.isArray(payload?.recommendations) ? payload.recommendations : [];
}

export function comparisonIndicators(payload?: ComparisonResponse | null) {
  const cmp = payload?.comparison;
  if (!cmp) return null;
  return {
    accessibilityDelta: toSafeNumber(cmp.delta_accessibility, 0),
    travelDelta: toSafeNumber(cmp.delta_travel_time, 0),
    inequalityDelta: toSafeNumber(cmp.inequality_change, 0),
    improvementPct: toSafeNumber(cmp.improvement_percentage, 0),
    districtsImproved: toSafeNumber(payload?.districts_improved, 0),
    districtsTotal: toSafeNumber(payload?.districts_total, 0)
  };
}

