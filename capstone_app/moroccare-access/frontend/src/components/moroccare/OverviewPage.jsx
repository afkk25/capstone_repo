import { useMemo, useState } from "react";
import FacilityCard from "../FacilityCard";
import KeyIndicators from "./KeyIndicators";
import RecommendationsCard from "./RecommendationsCard";
import TopDistrictsTable from "./TopDistrictsTable";
import TopFilterBar from "./TopFilterBar";

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function pct(value) {
  return Math.round(Math.max(0, Math.min(100, value)));
}

function formatPopulation(value) {
  if (!Number.isFinite(value) || value <= 0) return "Not available";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 2)}M`;
  if (value >= 1_000) return `${Math.round(value / 1000)}K`;
  return Math.round(value).toLocaleString();
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

function normalizePlanningRank(row) {
  const rawScore = toNumber(row.avg_accessibility_score ?? row.score ?? row.percent, 0);
  const avgScore = rawScore > 1 ? rawScore / 100 : rawScore;
  return {
    name: row.district || row.district_name || row.name || "Unknown",
    avgScore,
    underservedPct: toNumber(row.underserved_pct, 0),
    population: toNumber(row.population, 0),
    rank: toNumber(row.rank, 0)
  };
}

function backendRecommendationText(item) {
  if (!item || typeof item !== "object") return "";
  const scenario = String(item.scenario || "Recommended intervention").replace(/_/g, " ");
  const explanation = String(item.explanation || "").trim();
  if (explanation) return explanation;
  const score = Number(item.score);
  return Number.isFinite(score)
    ? `${scenario}: strongest tested option with a planning score of ${score.toFixed(2)}.`
    : `${scenario}: review this intervention as a candidate planning action.`;
}

export default function OverviewPage({
  city,
  facilities,
  transportStops,
  baselineSupplyFacilities,
  simulation,
  isLoading,
  cities = [],
  selectedCityId = "",
  onCityChange,
  onOpenUpload,
  onAddCity,
  districtSummaries: backendDistrictSummaries = [],
  citySummary = null,
  planningRanking = [],
  backendRecommendations = [],
  analysisUnit = "origin"
}) {
  const [selectedDistrict, setSelectedDistrict] = useState("");
  const [bestFirst, setBestFirst] = useState(false);

  const filteredFacilities = useMemo(
    () => (selectedDistrict ? facilities.filter((row) => row.districtName === selectedDistrict) : facilities),
    [facilities, selectedDistrict]
  );
  const sortedFacilities = useMemo(() => {
    const rows = [...filteredFacilities];
    rows.sort((a, b) => (bestFirst ? b.accessibilityScore - a.accessibilityScore : a.accessibilityScore - b.accessibilityScore));
    return rows;
  }, [filteredFacilities, bestFirst]);
  const districtSummaries = useMemo(() => {
    const backendRows = backendDistrictSummaries.map(normalizeDistrictSummary).filter((row) => row.name && row.name !== "Unknown");
    return backendRows.length ? backendRows : summarizeDistricts(facilities);
  }, [backendDistrictSummaries, facilities]);
  const districtOptions = useMemo(() => {
    const fromDistricts = districtSummaries.map((row) => row.name);
    const fromFacilities = facilities.map((row) => row.districtName).filter(Boolean);
    return [...new Set([...fromDistricts, ...fromFacilities])].sort((a, b) => a.localeCompare(b));
  }, [districtSummaries, facilities]);
  const topDistricts = useMemo(
    () => {
      const ranked = planningRanking.map(normalizePlanningRank).filter((row) => row.name && row.name !== "Unknown" && Number.isFinite(row.avgScore));
      const sourceRows = ranked.length ? ranked : districtSummaries;
      return [...sourceRows]
        .sort((a, b) => a.avgScore - b.avgScore)
        .slice(0, 5)
        .map((row) => ({ name: row.name, percent: pct(row.avgScore * 100) }));
    },
    [districtSummaries, planningRanking]
  );

  const facilityTransit = useMemo(() => summarizeFacilityTransit(baselineSupplyFacilities), [baselineSupplyFacilities]);
  const baseline = useMemo(() => {
    const population = facilities.reduce((sum, row) => sum + toNumber(row.population, 0), 0);
    const avgTravelTime = Number.isFinite(Number(citySummary?.avg_travel_time))
      ? Number(citySummary.avg_travel_time)
      : facilities.length
      ? facilities.reduce((sum, row) => sum + toNumber(row.travelTimeMin, 0), 0) / facilities.length
      : 32;
    const avgScore = Number.isFinite(Number(citySummary?.avg_accessibility_score))
      ? Number(citySummary.avg_accessibility_score)
      : facilities.length
      ? facilities.reduce((sum, row) => sum + toNumber(row.accessibilityScore, 0), 0) / facilities.length
      : 0.68;
    const within60Pct = facilities.length ? pct((facilities.filter((row) => toNumber(row.travelTimeMin, 99) <= 60).length / facilities.length) * 100) : 68;
    return {
      population,
      avgTravelTime,
      avgScore,
      within60Pct,
      coverageGap: 100 - within60Pct
    };
  }, [citySummary, facilities]);
  const lowAccess = filteredFacilities.filter((item) => Number(item.nearestStopDistanceMeters) > 250 || Number(item.accessibilityScore) < 0.35);
  const avgStopDistance = filteredFacilities.length
    ? filteredFacilities.reduce((sum, item) => sum + (Number.isFinite(Number(item.nearestStopDistanceMeters)) ? Number(item.nearestStopDistanceMeters) : 0), 0) / filteredFacilities.length
    : 0;
  const mostIsolated = [...filteredFacilities]
    .filter((item) => Number.isFinite(Number(item.nearestStopDistanceMeters)))
    .sort((a, b) => Number(b.nearestStopDistanceMeters) - Number(a.nearestStopDistanceMeters))[0];

  const indicators = [
    { label: "Population", value: formatPopulation(baseline.population), helper: baseline.population ? "Population represented by origin areas." : "Upload population inputs to unlock population-weighted metrics." },
    { label: "Healthcare Facilities", value: facilityTransit.total ? facilityTransit.total.toLocaleString() : "Not available", helper: "All healthcare supply points are treated as one facility layer." },
    { label: "Facilities near Transit", value: facilityTransit.hasDistance ? `${facilityTransit.reachable}/${facilityTransit.total}` : "Not available", helper: "Healthcare facilities within 500m of at least one transport stop." },
    { label: "Avg. Access Time", value: facilities.length ? `${Math.round(baseline.avgTravelTime)} min` : "Not available", basis: "baseline", helper: "Estimated average travel time derived from accessibility score or backend travel time." },
    { label: "Areas within 60 min", value: facilities.length ? `${baseline.within60Pct}%` : "Not available", basis: "baseline", helper: "Share of origin areas with estimated access at or below 60 minutes." },
    { label: "Coverage Gap", value: facilities.length ? `${baseline.coverageGap}%` : "Not available", basis: "baseline", helper: "Origin areas above the 60-minute threshold." }
  ];

  const recommendations = useMemo(() => {
    const backendItems = backendRecommendations.map(backendRecommendationText).filter(Boolean).slice(0, 3);
    if (backendItems.length >= 3) return backendItems;
    const sourceDistricts = Array.isArray(simulation?.districts) && simulation.districts.length
      ? simulation.districts.map((row) => ({
          name: row.district_name,
          avgScore: toNumber(row.after_avg_score, 0) > 1 ? toNumber(row.after_avg_score, 0) / 100 : toNumber(row.after_avg_score, 0),
          popImprovedPotential: toNumber(row.pop_improved, 0),
          coverageGap: 1 - (toNumber(row.after_avg_score, 0) > 1 ? toNumber(row.after_avg_score, 0) / 100 : toNumber(row.after_avg_score, 0))
        }))
      : districtSummaries;
    const lowest = [...sourceDistricts].sort((a, b) => a.avgScore - b.avgScore)[0];
    const pop = [...sourceDistricts].sort((a, b) => b.popImprovedPotential - a.popImprovedPotential)[0] || lowest;
    const gap = [...sourceDistricts].sort((a, b) => b.coverageGap - a.coverageGap)[0] || lowest;
    const generatedItems = [
      `Improve bus coverage in ${lowest?.name || "Sidi Moumen"} to reduce access gaps for peripheral origins.`,
      `Add healthcare facility capacity in ${pop?.name || "Ain Chock"} where the potential population benefit is highest.`,
      `Increase connectivity in ${gap?.name || "Sidi Bernoussi"} through feeder routes and better stop spacing.`
    ];
    return [...backendItems, ...generatedItems].slice(0, 3);
  }, [backendRecommendations, districtSummaries, simulation]);
  const isFacilityProxy = analysisUnit === "facility_proxy";
  const rankingTitle = isFacilityProxy ? "Healthcare Facility Reachability Ranking" : "Origin Area Accessibility Ranking";
  const rankingIntro = isFacilityProxy
    ? "The current dataset uses healthcare facilities as proxy analysis locations. Use this list to identify facilities with weaker transit access."
    : "Sorted by accessibility score. Origins represent demand or population analysis locations, while healthcare facilities are shown separately on the map.";

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
          <span>Baseline Overview</span>
          <h1>{city?.name || city?.display_name || "Selected city"} healthcare access baseline</h1>
          <p>
            {lowAccess.length.toLocaleString()} {isFacilityProxy ? "healthcare facilities" : "origin areas"} show lower access in the current baseline.
            {mostIsolated ? ` The most isolated listed location is ${mostIsolated.originName || mostIsolated.districtName}, about ${Math.round(Number(mostIsolated.nearestStopDistanceMeters)).toLocaleString()}m from the nearest stop.` : ""}
          </p>
        </div>
      </section>

      <div className="mc-overview-summary-grid">
        <KeyIndicators indicators={indicators} />
        <TopDistrictsTable districts={topDistricts} />
        <RecommendationsCard recommendations={recommendations} />
      </div>

      <section className="mc-card mc-ranking-card">
        <div className="mc-ranking-head">
          <div>
            <h2>{rankingTitle}</h2>
            <p>{rankingIntro}</p>
          </div>
          <div className="mc-ranking-actions">
            <div className="mc-ranking-stat">
              <span>Average stop distance</span>
              <strong>{filteredFacilities.length ? `${Math.round(avgStopDistance).toLocaleString()}m` : "Not available"}</strong>
            </div>
            <button type="button" className="mc-secondary-button" onClick={() => setBestFirst((prev) => !prev)}>
              {bestFirst ? "Show weakest first" : "Show strongest first"}
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="mc-empty-note">Loading baseline ranking...</div>
        ) : sortedFacilities.length ? (
          <div className="mc-facility-ranking-grid">
            {sortedFacilities.map((facility) => (
              <FacilityCard key={facility.id} facility={facility} />
            ))}
          </div>
        ) : (
          <div className="mc-empty-note">No baseline analysis rows are available for the selected city.</div>
        )}
      </section>
    </div>
  );
}
