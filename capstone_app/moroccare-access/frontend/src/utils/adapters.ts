import type {
  BaselineFacilityDto,
  FacilityPointDto,
  BaselineResponse,
  ComparisonResponse,
  FrontendDistrict,
  RankingResponse,
  RecommendationResponse,
  SummaryResponse
} from "../types/api";
import type { DashboardSummary } from "../types/ui";

export const FALLBACK_CENTER = { center_lat: 31.7917, center_lon: -7.0926 };

export function toSafeNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function scoreToTravelMinutes(score: number): number {
  const clipped = Math.max(0, Math.min(1, score));
  return (1 - clipped) * 60;
}

export function normalizeScore(value: unknown, fallback = 0): number {
  const raw = toSafeNumber(value, fallback);
  const normalized = raw > 1 ? raw / 100 : raw;
  return Math.max(0, Math.min(1, normalized));
}

export function normalizeFacility(row: BaselineFacilityDto, index = 0): FrontendDistrict {
  const accessibilityScore = normalizeScore((row as Record<string, unknown>).after_score ?? row.simulated_score ?? row.accessibility_score, 0);
  const baselineScore = normalizeScore(
    (row as Record<string, unknown>).before_score ?? row.baseline_score ?? row.accessibility_score ?? accessibilityScore,
    accessibilityScore
  );
  const travelTimeMin = toSafeNumber(row.travel_time_min, scoreToTravelMinutes(accessibilityScore));
  const latitude = toSafeNumber((row as Record<string, unknown>).lat ?? row.latitude, 0);
  const longitude = toSafeNumber((row as Record<string, unknown>).lon ?? row.longitude, 0);
  const analysisUnit = String((row as Record<string, unknown>).analysis_unit ?? "");
  const rawDistrictName = (row as Record<string, unknown>).district ?? row.district_name;
  const rawOriginName = (row as Record<string, unknown>).origin_name ?? row.name ?? row.origin_id;
  const originName = cleanDisplayLabel(rawOriginName, `Origin ${index + 1}`);
  let districtName = cleanDisplayLabel(rawDistrictName, analysisUnit === "facility_proxy" ? "Service location" : originName);
  if (analysisUnit === "facility_proxy" && !row.district_id && districtName === originName) {
    districtName = "Service location";
  }

  return {
    id: String(row.id ?? row.origin_id ?? row.name ?? row.district_name ?? `origin-${index}`),
    districtName,
    originName,
    analysisUnit,
    districtId: row.district_id ?? null,
    urbanRing: String(row.urban_ring ?? "Unknown"),
    latitude,
    longitude,
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

function cleanDisplayLabel(value: unknown, fallback: string): string {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  if (!text || ["nan", "none", "null", "unknown"].includes(text.toLowerCase())) return fallback;
  return text;
}

export function normalizeBaselineFacilities(payload: BaselineResponse | null | undefined): FrontendDistrict[] {
  const rows = Array.isArray(payload?.baseline_rows)
    ? payload.baseline_rows
    : Array.isArray(payload?.origins)
    ? payload.origins
    : Array.isArray(payload?.facilities)
    ? (payload.facilities as BaselineFacilityDto[])
    : [];
  return rows
    .map(normalizeFacility)
    .filter((row) => Number.isFinite(row.latitude) && Number.isFinite(row.longitude) && row.latitude !== 0 && row.longitude !== 0);
}

export function normalizeSupplyFacilities(payload: BaselineResponse | null | undefined): FacilityPointDto[] {
  const rows = Array.isArray(payload?.facilities_baseline)
    ? payload.facilities_baseline
    : Array.isArray(payload?.facilities)
    ? payload.facilities
    : [];
  return rows
    .map((row, index) => ({
      id: row.id ?? `facility-${index}`,
      name: row.name ?? `Facility ${index + 1}`,
      latitude: toSafeNumber(row.latitude, NaN),
      longitude: toSafeNumber(row.longitude, NaN)
    }))
    .filter((row) => Number.isFinite(row.latitude) && Number.isFinite(row.longitude));
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
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.ranking)) return payload.ranking;
  if (Array.isArray(payload?.rows)) return payload.rows;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.districts)) return payload.districts;
  return [];
}

export type NormalizedBaselineOverview = {
  population: number | null;
  facilityCount: number | null;
  transportStopCount: number | null;
  averageAccessTimeMin: number | null;
  averageAccessibilityScore: number | null;
  pctPopulationWithin30Min: number | null;
  pctPopulationWithin60Min: number | null;
  coverageGapPct: number | null;
  facilitiesNearTransit: number | null;
  districtSummaryRows: Array<Record<string, unknown>>;
  kpiFieldsFound: boolean;
};

export type NormalizedOverviewData = {
  population: number | null;
  facilityCount: number | null;
  transportStopCount: number | null;
  averageAccessTimeMin: number | null;
  averageAccessibilityScore: number | null;
  pctPopulationWithin60Min: number | null;
  coverageGapPct: number | null;
  facilitiesNearTransit: number | null;
  rankingRows: Array<Record<string, unknown>>;
  districtSummaryRows: Array<Record<string, unknown>>;
  mappingIssue: string | null;
};

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const lowered = trimmed.toLowerCase();
    if (["nan", "none", "null", "undefined", "n/a", "na"].includes(lowered)) return null;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function firstFinite(...values: unknown[]): number | null {
  for (const value of values) {
    const parsed = nullableNumber(value);
    if (parsed !== null) return parsed;
  }
  return null;
}

function weightedAverageFromRows(
  rows: Array<Record<string, unknown>>,
  valueKeys: string[],
  weightKeys = ["population_raster", "population"]
): number | null {
  if (!rows.length) return null;
  let weightedTotal = 0;
  let totalWeight = 0;
  for (const row of rows) {
    const value = firstFinite(...valueKeys.map((key) => row?.[key]));
    const weight = firstFinite(...weightKeys.map((key) => row?.[key]));
    if (value === null || weight === null || weight <= 0) continue;
    weightedTotal += value * weight;
    totalWeight += weight;
  }
  return totalWeight > 0 ? weightedTotal / totalWeight : null;
}

function sumFromRows(rows: Array<Record<string, unknown>>, keys: string[]): number | null {
  if (!rows.length) return null;
  let total = 0;
  let found = false;
  for (const row of rows) {
    const value = firstFinite(...keys.map((key) => row?.[key]));
    if (value === null) continue;
    total += value;
    found = true;
  }
  return found ? total : null;
}

function unwrapPayload<T>(payload: T | { data?: T } | null | undefined): T | null {
  if (!payload) return null;
  if (typeof payload === "object" && payload !== null && "data" in (payload as Record<string, unknown>)) {
    return (((payload as Record<string, unknown>).data as T | undefined) ?? null);
  }
  return payload as T;
}

export function normalizeBaselineResponse(response?: BaselineResponse | null): NormalizedBaselineOverview {
  const payload = unwrapPayload(response);
  const kpis = (payload as BaselineResponse & { kpis?: Record<string, unknown> })?.kpis || {};
  const summary = ((payload as BaselineResponse & { summary?: Record<string, unknown> })?.summary || {}) as Record<string, unknown>;
  const districtSummaryRows = Array.isArray(payload?.district_summaries)
    ? payload.district_summaries
    : Array.isArray((payload as BaselineResponse & { district_summary?: Array<Record<string, unknown>> })?.district_summary)
    ? ((payload as BaselineResponse & { district_summary?: Array<Record<string, unknown>> }).district_summary as Array<Record<string, unknown>>)
    : [];
  const origins = Array.isArray(payload?.baseline_rows)
    ? payload.baseline_rows
    : Array.isArray(payload?.origins)
    ? payload.origins
    : [];
  const facilityCountFromArray = payload
    ? Array.isArray(payload?.facilities_baseline)
      ? payload.facilities_baseline.length
      : Array.isArray(payload?.facilities)
      ? payload.facilities.length
      : null
    : null;
  const facilities = Array.isArray(payload?.facilities_baseline)
    ? payload.facilities_baseline
    : Array.isArray(payload?.facilities)
    ? payload.facilities
    : [];
  const transportStopCountFromArray = payload
    ? Array.isArray(payload?.transport_stops_baseline)
      ? payload.transport_stops_baseline.length
      : Array.isArray(payload?.transport_stops)
      ? payload.transport_stops.length
      : null
    : null;
  const transportStops = Array.isArray(payload?.transport_stops_baseline)
    ? payload.transport_stops_baseline
    : Array.isArray(payload?.transport_stops)
    ? payload.transport_stops
    : [];
  const derivedPopulation =
    sumFromRows(origins as Array<Record<string, unknown>>, ["population"]) ??
    sumFromRows(districtSummaryRows, ["population_raster", "population"]);

  const normalized: NormalizedBaselineOverview = {
    population: firstFinite(
      kpis.population,
      (payload as BaselineResponse & { population?: number })?.population,
      summary?.population,
      summary?.population_raster,
      derivedPopulation
    ),
    facilityCount: firstFinite(
      kpis.facility_count,
      (payload as BaselineResponse & { facility_count?: number })?.facility_count,
      summary?.facility_count,
      summary?.healthcare_facilities,
      facilityCountFromArray
    ),
    transportStopCount: firstFinite(
      kpis.transport_stop_count,
      (payload as BaselineResponse & { transport_stop_count?: number })?.transport_stop_count,
      summary?.transport_stop_count,
      summary?.stop_count,
      transportStopCountFromArray
    ),
    averageAccessTimeMin: firstFinite(
      kpis.average_access_time_min,
      kpis.avg_total_travel_time_min_pw,
      kpis.avg_total_travel_time_min,
      summary?.average_access_time_min,
      summary?.avg_total_travel_time_min_pw,
      summary?.avg_travel_time,
      weightedAverageFromRows(districtSummaryRows, ["avg_total_travel_time_min_pw"])
    ),
    averageAccessibilityScore: firstFinite(
      kpis.average_accessibility_score,
      kpis.pop_weighted_accessibility_score,
      kpis.avg_accessibility_score,
      summary?.average_accessibility_score,
      summary?.pop_weighted_accessibility_score,
      summary?.avg_accessibility_score,
      weightedAverageFromRows(districtSummaryRows, ["pop_weighted_accessibility_score", "avg_accessibility_score"])
    ),
    pctPopulationWithin30Min: firstFinite(kpis.pct_population_within_30_min),
    pctPopulationWithin60Min: firstFinite(
      kpis.pct_population_within_60_min,
      kpis.pct_pop_access_60min,
      kpis.population_covered_45min_pct,
      summary?.pct_population_within_60_min,
      summary?.pct_pop_access_60min,
      summary?.pct_pop_access_threshold
    ),
    coverageGapPct: firstFinite(
      kpis.coverage_gap_pct,
      kpis.pct_pop_score_below_50,
      summary?.coverage_gap_pct,
      summary?.pct_pop_score_below_50
    ),
    facilitiesNearTransit: firstFinite(
      kpis.facilities_near_transit,
      (payload as BaselineResponse & { facilities_near_transit?: number })?.facilities_near_transit,
      summary?.facilities_near_transit
    ),
    districtSummaryRows,
    kpiFieldsFound: [
      kpis.population,
      (payload as BaselineResponse & { population?: number })?.population,
      kpis.facility_count,
      kpis.transport_stop_count,
      kpis.average_access_time_min,
      kpis.avg_total_travel_time_min_pw,
      kpis.avg_total_travel_time_min,
      kpis.average_accessibility_score,
      kpis.pop_weighted_accessibility_score,
      kpis.avg_accessibility_score,
      kpis.pct_population_within_30_min,
      kpis.pct_population_within_60_min,
      kpis.population_covered_45min_pct,
      kpis.coverage_gap_pct,
      kpis.pct_pop_score_below_50,
      summary?.population_raster,
      summary?.population,
      (payload as BaselineResponse & { facility_count?: number })?.facility_count,
      summary?.facility_count,
      summary?.healthcare_facilities,
      (payload as BaselineResponse & { transport_stop_count?: number })?.transport_stop_count,
      summary?.avg_total_travel_time_min_pw,
      summary?.average_access_time_min,
      summary?.pop_weighted_accessibility_score
    ].some((value) => nullableNumber(value) !== null)
  };

  if (normalized.coverageGapPct === null && normalized.population !== null) {
    const underservedPopulation = firstFinite(kpis.underserved_population, summary?.underserved_population);
    if (underservedPopulation !== null && normalized.population > 0) {
      normalized.coverageGapPct = (underservedPopulation / normalized.population) * 100;
    }
  }

  if (normalized.coverageGapPct === null && normalized.pctPopulationWithin60Min !== null) {
    normalized.coverageGapPct = Math.max(0, 100 - normalized.pctPopulationWithin60Min);
  }

  return normalized;
}

export function normalizeOverviewData({
  baseline,
  summary,
  ranking
}: {
  baseline?: BaselineResponse | null;
  summary?: SummaryResponse | null;
  ranking?: RankingResponse | null | Record<string, unknown> | unknown[];
}): NormalizedOverviewData {
  const baselinePayload = unwrapPayload(baseline);
  const summaryRoot = unwrapPayload(summary);
  const normalizedBaseline = normalizeBaselineResponse(baselinePayload);
  const summaryPayload = summaryRoot?.summary || {};
  const districtRows = normalizedBaseline.districtSummaryRows;
  const rankingRows = safeRankingRows(unwrapPayload(ranking as RankingResponse | null) as RankingResponse | null);

  const population =
    firstFinite(
      baselinePayload?.kpis?.population,
      baselinePayload?.population,
      summaryPayload.population,
      summaryPayload.population_raster
    ) ??
    sumFromRows(
      Array.isArray(baselinePayload?.baseline_rows)
        ? (baselinePayload.baseline_rows as Array<Record<string, unknown>>)
        : [],
      ["population"]
    ) ??
    sumFromRows(districtRows, ["population_raster", "population"]);

  const facilityCount = firstFinite(
    baselinePayload?.kpis?.facility_count,
    baselinePayload?.facility_count,
    summaryPayload.facility_count,
    summaryPayload.healthcare_facilities,
    Array.isArray(baselinePayload?.facilities) ? baselinePayload?.facilities.length : null,
    Array.isArray(baselinePayload?.facilities_baseline) ? baselinePayload?.facilities_baseline.length : null
  );

  const transportStopCount = firstFinite(
    baselinePayload?.kpis?.transport_stop_count,
    baselinePayload?.transport_stop_count,
    summaryPayload.transport_stop_count,
    summaryPayload.stop_count,
    Array.isArray(baselinePayload?.transport_stops_baseline) ? baselinePayload?.transport_stops_baseline.length : null,
    Array.isArray(baselinePayload?.transport_stops) ? baselinePayload?.transport_stops.length : null
  );

  const averageAccessTimeMin =
    firstFinite(
      baselinePayload?.kpis?.average_access_time_min,
      baselinePayload?.kpis?.avg_total_travel_time_min_pw,
      baselinePayload?.kpis?.avg_total_travel_time_min,
      summaryPayload.average_access_time_min,
      summaryPayload.avg_total_travel_time_min_pw,
      summaryPayload.avg_travel_time
    ) ?? weightedAverageFromRows(districtRows, ["avg_total_travel_time_min_pw"]);

  const averageAccessibilityScore =
    firstFinite(
      baselinePayload?.kpis?.average_accessibility_score,
      baselinePayload?.kpis?.pop_weighted_accessibility_score,
      baselinePayload?.kpis?.avg_accessibility_score,
      summaryPayload.average_accessibility_score,
      summaryPayload.pop_weighted_accessibility_score,
      summaryPayload.avg_accessibility_score
    ) ?? weightedAverageFromRows(districtRows, ["pop_weighted_accessibility_score", "avg_accessibility_score"]);

  const pctPopulationWithin60Min = firstFinite(
    baselinePayload?.kpis?.pct_population_within_60_min,
    baselinePayload?.kpis?.pct_pop_access_60min,
    baselinePayload?.kpis?.population_covered_45min_pct,
    summaryPayload.pct_population_within_60_min,
    summaryPayload.pct_pop_access_60min,
    summaryPayload.pct_pop_access_threshold
  );

  const coverageGapPct = firstFinite(
    baselinePayload?.kpis?.coverage_gap_pct,
    baselinePayload?.kpis?.pct_pop_score_below_50,
    summaryPayload.coverage_gap_pct,
    summaryPayload.pct_pop_score_below_50
  );

  const facilitiesNearTransit = firstFinite(
    baselinePayload?.kpis?.facilities_near_transit,
    baselinePayload?.facilities_near_transit,
    summaryPayload.facilities_near_transit
  );

  const fallbackRankingRows = [...districtRows].sort((a, b) =>
    toSafeNumber(a.pop_weighted_accessibility_score ?? a.avg_accessibility_score, 0) -
    toSafeNumber(b.pop_weighted_accessibility_score ?? b.avg_accessibility_score, 0)
  );

  const kpiFieldsFound = [
    population,
    facilityCount,
    transportStopCount,
    averageAccessTimeMin,
    averageAccessibilityScore,
    pctPopulationWithin60Min,
    coverageGapPct
  ].some((value) => value !== null && !Number.isNaN(value));

  return {
    population,
    facilityCount,
    transportStopCount,
    averageAccessTimeMin,
    averageAccessibilityScore,
    pctPopulationWithin60Min,
    coverageGapPct,
    facilitiesNearTransit,
    rankingRows: rankingRows.length ? rankingRows : fallbackRankingRows,
    districtSummaryRows: districtRows,
    mappingIssue: baselinePayload && !kpiFieldsFound ? "Baseline loaded but KPI fields were not mapped." : null
  };
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

