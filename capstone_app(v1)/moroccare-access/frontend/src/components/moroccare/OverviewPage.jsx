import { useEffect, useMemo, useState } from "react";
import FacilityCard from "../FacilityCard";
import KeyIndicators from "./KeyIndicators";
import TopFilterBar from "./TopFilterBar";
import { useI18n } from "../../i18n/I18nProvider";
import { normalizeOverviewData } from "../../utils/adapters";

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function pct(value) {
  return Math.round(Math.max(0, Math.min(100, value)));
}

function isMissing(value) {
  return value === null || value === undefined || (typeof value === "number" && Number.isNaN(value));
}

function formatPopulation(value, fallbackLabel = "Not available") {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return fallbackLabel;
  if (numericValue >= 1_000_000) return `${(numericValue / 1_000_000).toFixed(numericValue >= 10_000_000 ? 0 : 2)}M`;
  if (numericValue >= 1_000) return `${Math.round(numericValue / 1000)}K`;
  return Math.round(numericValue).toLocaleString();
}

function formatCount(value, fallbackLabel = "Not available") {
  if (isMissing(value)) return fallbackLabel;
  return Number(value).toLocaleString();
}

function formatMinutes(value, fallbackLabel = "Not available") {
  if (isMissing(value)) return fallbackLabel;
  return `${Math.round(Number(value))} min`;
}

function formatPercent(value, fallbackLabel = "Not available") {
  if (isMissing(value)) return fallbackLabel;
  return `${pct(Number(value))}%`;
}

function formatScoreOutOf100(value, fallbackLabel = "Not available") {
  if (isMissing(value)) return fallbackLabel;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallbackLabel;
  const normalized = numeric > 1 ? numeric : numeric * 100;
  return `${Math.round(Math.max(0, Math.min(100, normalized)))}/100`;
}

function summarizeDistricts(rows) {
  const buckets = new Map();
  for (const row of rows) {
    const name = row.districtName || "Unknown";
    const current = buckets.get(name) || { name, scoreTotal: 0, population: 0, count: 0, travelTotal: 0 };
    current.scoreTotal += toNumber(row.accessibilityScore, 0);
    current.population += toNumber(row.population, 0);
    current.travelTotal += toNumber(row.travelTimeMin, 0);
    current.count += 1;
    buckets.set(name, current);
  }
  return [...buckets.values()].map((row) => ({
    ...row,
    avgScore: row.count ? row.scoreTotal / row.count : 0,
    avgTravelTime: row.count ? row.travelTotal / row.count : 0,
    coverageGap: 1 - (row.count ? row.scoreTotal / row.count : 0),
    popImprovedPotential: (1 - (row.count ? row.scoreTotal / row.count : 0)) * row.population
  }));
}

function normalizeDistrictSummary(row) {
  const rawScore = toNumber(row.avg_accessibility_score ?? row.avgScore ?? row.average_score ?? row.accessibility_score, 0);
  const avgScore = rawScore > 1 ? rawScore / 100 : rawScore;
  const rawGap = toNumber(row.coverage_gap ?? row.underserved_pct, NaN);
  const coverageGap = Number.isFinite(rawGap) ? (rawGap > 1 ? rawGap / 100 : rawGap) : 1 - avgScore;
  return {
    name: row.district_name || row.district || row.name || "Unknown",
    avgScore,
    avgTravelTime: toNumber(row.avg_travel_time_min ?? row.avgTravelTime, 0),
    population: toNumber(row.population, 0),
    count: toNumber(row.origin_count ?? row.count, 0),
    coverageGap,
    popImprovedPotential: toNumber(row.pop_improved ?? row.popImprovedPotential, 0) || coverageGap * toNumber(row.population, 0)
  };
}

function summarizeFacilityTransit(facilities) {
  const withDistance = facilities.filter((facility) => Number.isFinite(Number(facility.nearestStopDistanceMeters)));
  const reachable = withDistance.filter((facility) => Number(facility.nearestStopDistanceMeters) <= 500).length;
  return {
    total: facilities.length,
    reachable,
    hasDistance: withDistance.length > 0
  };
}

export default function OverviewPage({
  city,
  facilities,
  transportStops,
  baselineSupplyFacilities,
  baselineResponse,
  summaryResponse,
  rankingResponse,
  overviewData,
  simulation,
  isLoading,
  cities = [],
  selectedCityId = "",
  onCityChange,
  onOpenUpload,
  onAddCity,
  districtSummaries: backendDistrictSummaries = [],
  citySummary = null,
  analysisUnit = "origin"
}) {
  const { t } = useI18n();
  const [selectedDistrict, setSelectedDistrict] = useState("");
  const [bestFirst, setBestFirst] = useState(false);
  const resolvedOverviewData = useMemo(
    () =>
      overviewData ??
      normalizeOverviewData({
        baseline: baselineResponse,
        summary: summaryResponse,
        ranking: rankingResponse
      }),
    [baselineResponse, overviewData, rankingResponse, summaryResponse]
  );

  const filteredFacilities = useMemo(
    () => (selectedDistrict ? facilities.filter((row) => row.districtName === selectedDistrict) : facilities),
    [facilities, selectedDistrict]
  );
  const districtSummaries = useMemo(() => {
    const backendRows = backendDistrictSummaries.map(normalizeDistrictSummary).filter((row) => row.name && row.name !== "Unknown");
    return backendRows.length ? backendRows : summarizeDistricts(facilities);
  }, [backendDistrictSummaries, facilities]);
  const rankingRows = useMemo(() => {
    const sortRows = (rows) => [...rows].sort((a, b) => (bestFirst ? b.accessibilityScore - a.accessibilityScore : a.accessibilityScore - b.accessibilityScore));
    if (Array.isArray(resolvedOverviewData?.rankingRows) && resolvedOverviewData.rankingRows.length) {
      return sortRows(resolvedOverviewData.rankingRows.map((row, index) => ({
        id: row.district_id ?? row.district ?? row.district_name ?? `ranking-${index}`,
        districtName: row.district ?? row.district_name ?? row.name ?? `District ${index + 1}`,
        originName: row.district ?? row.district_name ?? row.name ?? `District ${index + 1}`,
        accessibilityScore: (() => {
          const raw = toNumber(row.avg_accessibility_score ?? row.pop_weighted_accessibility_score ?? row.accessibility_score, 0);
          return raw > 1 ? raw / 100 : raw;
        })(),
        nearestStopDistanceMeters: NaN
      })));
    }
    const fallbackRows = sortRows(districtSummaries.map((row) => ({ accessibilityScore: toNumber(row.avgScore, 0), ...row })));
    return fallbackRows.map((row, index) => ({
      id: row.name || `district-${index}`,
      districtName: row.name,
      originName: row.name,
      accessibilityScore: toNumber(row.avgScore, 0),
      nearestStopDistanceMeters: NaN
    }));
  }, [resolvedOverviewData?.rankingRows, districtSummaries, bestFirst]);
  const districtOptions = useMemo(() => {
    const fromDistricts = districtSummaries.map((row) => row.name);
    const fromFacilities = facilities.map((row) => row.districtName).filter(Boolean);
    return [...new Set([...fromDistricts, ...fromFacilities])].sort((a, b) => a.localeCompare(b));
  }, [districtSummaries, facilities]);

  const facilityTransit = useMemo(() => summarizeFacilityTransit(baselineSupplyFacilities), [baselineSupplyFacilities]);
  const baseline = useMemo(() => {
    const fallbackPopulation = facilities.reduce((sum, row) => sum + toNumber(row.population, 0), 0);
    const fallbackAvgTravelTime = Number.isFinite(Number(citySummary?.avg_travel_time))
      ? Number(citySummary.avg_travel_time)
      : facilities.length
      ? facilities.reduce((sum, row) => sum + toNumber(row.travelTimeMin, 0), 0) / facilities.length
      : null;
    const fallbackWithin60Pct = facilities.length ? pct((facilities.filter((row) => toNumber(row.travelTimeMin, 99) <= 60).length / facilities.length) * 100) : null;
    const hasBaselinePayload = Boolean(baselineResponse);
    return {
      population:
        resolvedOverviewData?.population ??
        (hasBaselinePayload ? (fallbackPopulation > 0 ? fallbackPopulation : null) : null),
      facilityCount:
        resolvedOverviewData?.facilityCount ??
        (hasBaselinePayload ? (baselineSupplyFacilities.length > 0 ? baselineSupplyFacilities.length : null) : null),
      transportStopCount:
        resolvedOverviewData?.transportStopCount ??
        (hasBaselinePayload ? (transportStops.length > 0 ? transportStops.length : null) : null),
      facilitiesNearTransit: resolvedOverviewData?.facilitiesNearTransit,
      avgTravelTime: resolvedOverviewData?.averageAccessTimeMin ?? fallbackAvgTravelTime,
      avgScore: resolvedOverviewData?.averageAccessibilityScore,
      within60Pct: resolvedOverviewData?.pctPopulationWithin60Min ?? fallbackWithin60Pct,
      coverageGap: resolvedOverviewData?.coverageGapPct ?? (fallbackWithin60Pct !== null ? 100 - fallbackWithin60Pct : null),
      mappingIssue: resolvedOverviewData?.mappingIssue ?? null
    };
  }, [baselineResponse, baselineSupplyFacilities.length, citySummary, facilities, resolvedOverviewData, transportStops.length]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    console.log("Overview KPI raw", baselineResponse?.kpis || {});
    console.log("Overview KPI normalized", baseline);
  }, [baselineResponse, baseline]);
  const lowAccess = filteredFacilities.filter((item) => Number(item.nearestStopDistanceMeters) > 250 || Number(item.accessibilityScore) < 0.35);
  const avgStopDistance = filteredFacilities.length
    ? filteredFacilities.reduce((sum, item) => sum + (Number.isFinite(Number(item.nearestStopDistanceMeters)) ? Number(item.nearestStopDistanceMeters) : 0), 0) / filteredFacilities.length
    : 0;
  const mostIsolated = [...filteredFacilities]
    .filter((item) => Number.isFinite(Number(item.nearestStopDistanceMeters)))
    .sort((a, b) => Number(b.nearestStopDistanceMeters) - Number(a.nearestStopDistanceMeters))[0];

  const indicators = [
    {
      label: t("overviewPage.population"),
      value: formatPopulation(baseline.population, t("common.notAvailable")),
      helper: !isMissing(baseline.population) ? t("overviewPage.populationHelper") : t("overviewPage.populationMissingHelper")
    },
    {
      label: t("overviewPage.healthcareFacilities"),
      value: formatCount(baseline.facilityCount, t("common.notAvailable")),
      helper: t("overviewPage.healthcareFacilitiesHelper")
    },
    {
      label: "Transport stops",
      value: formatCount(baseline.transportStopCount, t("common.notAvailable")),
      helper: "Public transport access points in the loaded baseline data."
    },
    {
      label: t("overviewPage.facilitiesNearTransit"),
      value: !isMissing(baseline.facilitiesNearTransit)
        ? formatCount(baseline.facilitiesNearTransit, t("common.notAvailable"))
        : facilityTransit.hasDistance
        ? `${facilityTransit.reachable}/${facilityTransit.total}`
        : t("common.notAvailable"),
      helper: t("overviewPage.facilitiesNearTransitHelper")
    },
    {
      label: t("overviewPage.avgAccessTime"),
      value: formatMinutes(baseline.avgTravelTime, t("common.notAvailable")),
      basis: t("overviewPage.baseline"),
      helper: t("overviewPage.avgAccessTimeHelper")
    },
    {
      label: "Accessibility score",
      value: formatScoreOutOf100(baseline.avgScore, t("common.notAvailable")),
      basis: t("overviewPage.baseline"),
      helper: "Average accessibility level across the active analysis units."
    },
    {
      label: t("overviewPage.areasWithin60"),
      value: formatPercent(baseline.within60Pct, t("common.notAvailable")),
      basis: t("overviewPage.baseline"),
      helper: t("overviewPage.areasWithin60Helper")
    },
    {
      label: t("overviewPage.coverageGap"),
      value: formatPercent(baseline.coverageGap, t("common.notAvailable")),
      basis: t("overviewPage.baseline"),
      helper: t("overviewPage.coverageGapHelper")
    }
  ];

  const isFacilityProxy = analysisUnit === "facility_proxy";
  const rankingTitle = isFacilityProxy ? t("overviewPage.facilityRankingTitle") : t("overviewPage.originRankingTitle");
  const rankingIntro = isFacilityProxy
    ? t("overviewPage.facilityRankingIntro")
    : t("overviewPage.originRankingIntro");

  return (
    <div className="mc-overview-page">
      <TopFilterBar
        districts={districtOptions}
        selectedDistrict={selectedDistrict}
        onDistrictChange={setSelectedDistrict}
        cities={cities}
        selectedCityId={selectedCityId}
        onCityChange={onCityChange}
        onOpenUpload={onOpenUpload}
        onAddCity={onAddCity}
      />

      <section className="mc-overview-hero-card">
        <div>
          <span>{t("overviewPage.baselineOverview")}</span>
          <h1>{t("overviewPage.heroTitle", { city: city?.name || city?.display_name || t("overview.selectedCity") })}</h1>
          <p>
            {t("overviewPage.heroBody", {
              count: lowAccess.length.toLocaleString(),
              subject: isFacilityProxy ? t("overviewPage.healthcareFacilitiesLower") : t("overviewPage.originAreasLower")
            })}
            {mostIsolated
              ? ` ${t("overviewPage.heroIsolated", {
                  name: mostIsolated.originName || mostIsolated.districtName,
                  distance: Math.round(Number(mostIsolated.nearestStopDistanceMeters)).toLocaleString()
                })}`
              : ""}
          </p>
          {baseline.mappingIssue ? (
            <p className="mc-empty-note">{baseline.mappingIssue}</p>
          ) : null}
        </div>
      </section>

      <div className="mc-overview-summary-grid">
        <KeyIndicators indicators={indicators} />
      </div>

      <section className="mc-card mc-ranking-card">
        <div className="mc-ranking-head">
          <div>
            <h2>{rankingTitle}</h2>
            <p>{rankingIntro}</p>
          </div>
          <div className="mc-ranking-actions">
            <div className="mc-ranking-stat">
              <span>{t("overviewPage.averageStopDistance")}</span>
              <strong>{filteredFacilities.length ? `${Math.round(avgStopDistance).toLocaleString()}m` : t("common.notAvailable")}</strong>
            </div>
            <button type="button" className="mc-secondary-button" onClick={() => setBestFirst((prev) => !prev)}>
              {bestFirst ? t("overviewPage.showWeakestFirst") : t("overviewPage.showStrongestFirst")}
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="mc-empty-note">{t("overviewPage.loadingBaselineRanking")}</div>
        ) : rankingRows.length ? (
          <div className="mc-facility-ranking-grid">
            {rankingRows.map((facility) => (
              <FacilityCard key={facility.id} facility={facility} />
            ))}
          </div>
        ) : (
          <div className="mc-empty-note">
            {baselineResponse || summaryResponse || rankingResponse
              ? "Baseline ranking loaded, but no ranking rows were available."
              : t("overviewPage.noBaselineRows")}
          </div>
        )}
      </section>
    </div>
  );
}
