import { useEffect, useMemo, useState } from "react";
import SimulationWorkspaceMap from "../components/simulation/SimulationWorkspaceMap";

const NEUTRAL_ADVANCED = {
  stop_density_multiplier: 1.0,
  reduce_nearest_stop_distance_pct: 0.0,
  add_facilities: 0,
  max_travel_time_min: 30,
  walking_distance_m: 600,
  transport_speed_kmh: 18
};

const MEANINGFUL_DELTA = 0.005;

const FALLBACK_INTERVENTIONS = [
  {
    id: "add_transport_stop",
    label: "Add a transport stop",
    backendInterventionType: "transport_stop",
    placementTarget: "transport_stop_locations",
    scenarioPatch: { add_facilities: 0 },
    aliases: ["transport_stop"]
  },
  {
    id: "add_healthcare_facility",
    label: "Add a healthcare facility",
    backendInterventionType: "healthcare_facility",
    placementTarget: "facility_locations",
    scenarioPatch: { add_facilities: 0 },
    aliases: ["healthcare_facility"]
  },
  {
    id: "improve_service",
    label: "Improve access near a stop",
    backendInterventionType: "transport_stop",
    placementTarget: "transport_stop_locations",
    scenarioPatch: { add_facilities: 0 },
    aliases: []
  }
];

function haversineMeters(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const earthRadiusMeters = 6371e3;
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const dPhi = toRad(lat2 - lat1);
  const dLambda = toRad(lon2 - lon1);
  const a = Math.sin(dPhi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2;
  return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function average(items, selector) {
  if (!items.length) return 0;
  return items.reduce((sum, item) => sum + selector(item), 0) / items.length;
}

function scorePercentToRatio(value) {
  if (!Number.isFinite(Number(value))) return NaN;
  return Math.max(0, Math.min(1, Number(value) / 100));
}

function formatPercent(value, digits = 1) {
  if (!Number.isFinite(value)) return "Not available yet";
  return `${(value * 100).toFixed(digits)}%`;
}

function formatMinutes(value) {
  if (!Number.isFinite(value)) return "Not available yet";
  return `${value.toFixed(1)} min`;
}

function formatCount(value) {
  if (!Number.isFinite(value)) return "Not available yet";
  return Math.round(value).toLocaleString();
}

function formatDistance(value) {
  if (!Number.isFinite(value)) return "Awaiting placement";
  if (value < 1000) return `${Math.round(value)} m`;
  return `${(value / 1000).toFixed(value < 5000 ? 1 : 0)} km`;
}

function normalizeScoreValue(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return NaN;
  return numeric > 1.5 ? numeric / 100 : numeric;
}

function scoreToTravelMinutes(score) {
  const normalized = normalizeScoreValue(score);
  if (!Number.isFinite(normalized)) return NaN;
  return (1 - Math.max(0, Math.min(1, normalized))) * 60;
}

function rowTravelMinutes(row, mode = "baseline") {
  const explicit = Number(mode === "scenario" ? row.travel_time_min ?? row.after_travel_time_min : row.before_travel_time_min ?? row.travel_time_min);
  if (Number.isFinite(explicit)) return explicit;
  const score = mode === "scenario" ? row.simulated_score ?? row.after_score ?? row.accessibility_score : row.baseline_score ?? row.before_score ?? row.accessibility_score;
  return scoreToTravelMinutes(score);
}

function summarizeRows(rows, mode = "accessibility") {
  const safeRows = Array.isArray(rows) ? rows : [];
  const scores = safeRows
    .map((row) =>
      normalizeScoreValue(
        mode === "baseline"
          ? row.before_score ?? row.baseline_score ?? row.accessibility_score
          : row.after_score ?? row.simulated_score ?? row.accessibility_score
      )
    )
    .filter(Number.isFinite);
  const travelTimes = safeRows
    .map((row) => {
      const explicit = Number(mode === "baseline" ? row.before_travel_time_min ?? row.travel_time_min : row.travel_time_min);
      if (Number.isFinite(explicit)) return explicit;
      return scoreToTravelMinutes(mode === "baseline" ? row.before_score ?? row.baseline_score ?? row.accessibility_score : row.after_score ?? row.simulated_score ?? row.accessibility_score);
    })
    .filter(Number.isFinite);
  const underservedPopulation = safeRows.reduce((sum, row) => {
    const score = normalizeScoreValue(mode === "baseline" ? row.before_score ?? row.baseline_score ?? row.accessibility_score : row.after_score ?? row.simulated_score ?? row.accessibility_score);
    if (!Number.isFinite(score) || score >= 0.5) return sum;
    return sum + (Number(row.population) || 0);
  }, 0);
  return {
    avg_accessibility_score: scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : NaN,
    avg_travel_time: travelTimes.length ? travelTimes.reduce((sum, time) => sum + time, 0) / travelTimes.length : NaN,
    underserved_population: underservedPopulation
  };
}

function deltaMeta(value, { multiplier = 1, decimals = 1, unit = "", epsilon = 0.0005, positiveIsGood = true, useGrouping = false } = {}) {
  if (!Number.isFinite(value) || Math.abs(value * multiplier) < epsilon) {
    return { text: "0", tone: "neutral", direction: "neutral" };
  }
  const scaled = value * multiplier;
  const sign = scaled > 0 ? "+" : "";
  const good = positiveIsGood ? scaled > 0 : scaled < 0;
  const formattedValue = useGrouping ? Math.abs(Math.round(scaled)).toLocaleString() : Math.abs(scaled).toFixed(decimals);
  return {
    text: `${scaled < 0 ? "-" : sign}${formattedValue}${unit}`,
    tone: good ? "positive" : "negative",
    direction: scaled > 0 ? "positive" : "negative"
  };
}

function interventionLabel(interventionType, interventionIndex) {
  if (!interventionType) return "";
  return interventionIndex.get(interventionType)?.label || interventionType;
}

function interventionMeta(option) {
  const id = option?.id || "";
  if (id === "add_transport_stop") return { icon: "S", description: "Improve public transport reach near underserved origins." };
  if (id === "add_healthcare_facility") return { icon: "H", description: "Test a new healthcare access point at a candidate location." };
  return { icon: "A", description: "Improve access conditions around an existing stop area." };
}

function getSimulationDefaults(city) {
  const defaults = city?.simulation?.default_parameters || {};
  return {
    stop_density_multiplier: Number.isFinite(Number(defaults.stop_density_multiplier)) ? Number(defaults.stop_density_multiplier) : 1.0,
    reduce_nearest_stop_distance_pct: Number.isFinite(Number(defaults.reduce_nearest_stop_distance_pct)) ? Number(defaults.reduce_nearest_stop_distance_pct) : 0.0,
    add_facilities: Number.isFinite(Number(defaults.add_facilities)) ? Number(defaults.add_facilities) : 0,
    max_travel_time_min: Number.isFinite(Number(defaults.max_travel_time_min)) ? Number(defaults.max_travel_time_min) : 30,
    walking_distance_m: Number.isFinite(Number(defaults.walking_distance_m)) ? Number(defaults.walking_distance_m) : 600,
    transport_speed_kmh: Number.isFinite(Number(defaults.transport_speed_kmh)) ? Number(defaults.transport_speed_kmh) : 18
  };
}

function getAvailableInterventions(city) {
  const configured = Array.isArray(city?.simulation?.interventions) ? city.simulation.interventions : [];
  const supportedTypes = new Set((city?.supported_intervention_types || ["healthcare_facility", "transport_stop"]).map((item) => String(item).toLowerCase()));

  if (configured.length) {
    return configured
      .map((item, index) => {
        const id = String(item?.id || "").trim();
        if (!id) return null;
        const backendInterventionType = String(item?.backend_intervention_type || "").toLowerCase();
        if (backendInterventionType && !supportedTypes.has(backendInterventionType)) return null;
        return {
          id,
          label: String(item?.label || id.replace(/_/g, " ")),
          backendInterventionType: backendInterventionType || "transport_stop",
          placementTarget: item?.placement_target === "facility_locations" ? "facility_locations" : "transport_stop_locations",
          scenarioPatch: item?.scenario_patch && typeof item.scenario_patch === "object" ? item.scenario_patch : {},
          aliases: Array.isArray(item?.aliases) ? item.aliases.map((alias) => String(alias).toLowerCase()) : [],
          rank: index
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.rank - b.rank);
  }

  return FALLBACK_INTERVENTIONS.filter((item) => supportedTypes.has(item.backendInterventionType));
}

function friendlyStopLabel(stop) {
  if (!stop) return "No stop context";
  if (stop.stop_name) return stop.stop_name;
  if (Number.isFinite(stop.cluster_id)) return `Stop cluster ${stop.cluster_id}`;
  return "Nearby transport stop";
}

function hasUsableDistrict(row) {
  if (!row) return false;
  const district = String(row.districtName || "").trim();
  const origin = String(row.originName || "").trim();
  if (!district || ["service location", "unknown", "unassigned area"].includes(district.toLowerCase())) return false;
  return district !== origin;
}

function serviceContextFor(row, datasetAnalysisUnit = "") {
  const isFacilityProxy = row?.analysisUnit === "facility_proxy" || datasetAnalysisUnit === "facility_proxy";
  if (!row) {
    return {
      locationLabel: "Selected location",
      locationValue: "Map location",
      locationSubLabel: "",
      showDistrict: false,
      districtValue: "",
      analysisUnitLabel: "Location-based model"
    };
  }
  return {
    locationLabel: isFacilityProxy ? "Nearest evaluated facility" : "Nearest origin area",
    locationValue: row.originName || row.districtName || "Map location",
    locationSubLabel: Number.isFinite(row.markerDistanceM) ? `${formatDistance(row.markerDistanceM)} from placement` : "",
    showDistrict: hasUsableDistrict(row),
    districtValue: row.districtName,
    analysisUnitLabel: isFacilityProxy ? "Facility-level context" : "Area-level context"
  };
}

function populationContextFor(rows, placement) {
  const rowsWithPopulation = (Array.isArray(rows) ? rows : []).filter((row) => {
    const population = Number(row.population);
    return (
      Number.isFinite(population) &&
      population > 0 &&
      Number.isFinite(Number(row.latitude)) &&
      Number.isFinite(Number(row.longitude))
    );
  });

  if (!rowsWithPopulation.length) {
    return {
      supported: false,
      value: "Population context is not included in this city package.",
      subLabel: "Scenario impact remains based on the accessibility model."
    };
  }

  if (!placement) {
    return {
      supported: true,
      value: "Awaiting placement",
      subLabel: "within 10 km"
    };
  }

  const nearbyPopulation = rowsWithPopulation
    .map((row) => ({
      ...row,
      distanceM: haversineMeters(placement.latitude, placement.longitude, row.latitude, row.longitude)
    }))
    .filter((row) => row.distanceM <= 10_000)
    .reduce((sum, row) => sum + Number(row.population || 0), 0);

  if (nearbyPopulation <= 0) {
    return {
      supported: true,
      value: "No nearby population",
      subLabel: "within 10 km"
    };
  }

  return {
    supported: true,
    value:
      nearbyPopulation >= 1000000
        ? `${(nearbyPopulation / 1000000).toFixed(1)}M`
        : nearbyPopulation >= 1000
        ? `${Math.round(nearbyPopulation / 1000)}k`
        : Math.round(nearbyPopulation).toLocaleString(),
    subLabel: "within 10 km"
  };
}

function buildPayload({ selectedIntervention, placement, mode, advancedSettings, cityDefaults }) {
  if (!selectedIntervention || !placement) return null;
  const payload = {
    ...cityDefaults,
    ...selectedIntervention.scenarioPatch,
    transport_speed_kmh: Number(advancedSettings.transport_speed_kmh || cityDefaults.transport_speed_kmh || 18),
    facility_locations: [],
    transport_stop_locations: []
  };
  const location = {
    latitude: Number(placement.latitude.toFixed(6)),
    longitude: Number(placement.longitude.toFixed(6))
  };
  if (selectedIntervention.placementTarget === "facility_locations") {
    payload.facility_locations = [location];
    payload.add_facilities = Math.max(0, Number(payload.add_facilities || 0));
  } else {
    payload.transport_stop_locations = [location];
  }
  return payload;
}

function StepCard({ step, title, status, id, compact = false, children }) {
  const runClass = id === "step-run" ? " step-run-section" : "";
  return (
    <section id={id} className={`simulate-step-card step-section step-card${runClass} ${compact ? "is-compact" : ""} is-${status}`}>
      <div className="simulate-step-card-head">
        <div className="simulate-step-label step-label"><span>{step}</span> {title}</div>
      </div>
      {children}
    </section>
  );
}

function ContextChip({ label, value, subLabel }) {
  return (
    <div className="simulate-context-chip ctx-card">
      <div className="ctx-label">{label}</div>
      <strong className="ctx-value">{value}</strong>
      {subLabel ? <small>{subLabel}</small> : null}
    </div>
  );
}

function KpiSkeleton() {
  return (
    <div className="simulate-kpi-card is-neutral">
      <div className="simulate-kpi-label">Loading</div>
      <div className="simulate-skeleton" />
      <div className="simulate-kpi-before">computing model output</div>
    </div>
  );
}

function KpiCard({ label, value, before, beforeHint = "", delta, positiveIsGood = true, unit = "", deltaOptions = {}, deltaText = null, tone = null, deltaTitle = "" }) {
  const meta = deltaText == null ? deltaMeta(delta, { multiplier: 1, decimals: 1, unit, positiveIsGood, ...deltaOptions }) : { text: deltaText, tone };
  return (
    <div className={`simulate-kpi-card kpi-card is-${meta.tone}`}>
      <div className="simulate-kpi-label">{label}</div>
      <div className="simulate-kpi-value-row kpi-value-row">
        <strong className="kpi-main-value">{value}</strong>
        <span className={`simulate-delta-pill kpi-delta-badge is-${meta.tone}`} title={deltaTitle}>{meta.text}</span>
      </div>
      <div className="simulate-kpi-before">was {before}{beforeHint ? <span className="kpi-before-hint"> {beforeHint}</span> : null}</div>
    </div>
  );
}

function PlayEmptyState() {
  return (
    <div className="simulate-empty-state">
      <div className="simulate-empty-play-icon" aria-hidden="true" />
      <h3>No scenario run yet</h3>
      <p>Select an intervention, place it on the map, and run the scenario to see before-and-after outcomes here.</p>
    </div>
  );
}

function sortDistrictRows(beforeRows = [], afterRows = []) {
  const beforeByName = new Map(beforeRows.map((row) => [String(row.district_name), row]));
  return afterRows
    .map((after) => {
      const name = String(after.district_name || "District");
      const before = beforeByName.get(name);
      if (!before) return null;
      const beforeScore = Number(before.avg_accessibility_score);
      const afterScore = Number(after.avg_accessibility_score);
      if (!Number.isFinite(beforeScore) || !Number.isFinite(afterScore)) return null;
      return { name, before: beforeScore, after: afterScore, delta: afterScore - beforeScore };
    })
    .filter(Boolean)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

function summaryScore(value, fallback = NaN) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return numeric > 1.5 ? numeric / 100 : numeric;
}

function buildInterpretation(accessDelta, giniDelta, improvedCount, totalLocations, locationTerm = "areas") {
  const improvedPct = totalLocations > 0 ? improvedCount / totalLocations : 0;
  if (accessDelta < 0.005 && giniDelta < 0.005) {
    return `This scenario produces limited system-wide change (delta accessibility: ${(accessDelta * 100).toFixed(1)}pp). The placement may be outside the current service network or in an already well-served area. Try placing the intervention in an orange or red zone on the map for stronger impact.`;
  }
  if (accessDelta >= 0.02 && giniDelta >= 0.01) {
    return `Strong scenario: accessibility improves by ${(accessDelta * 100).toFixed(1)}pp and inequality reduces by ${giniDelta.toFixed(3)} Gini points, benefiting ${improvedCount.toLocaleString()} ${locationTerm} (${(improvedPct * 100).toFixed(0)}% of the network). This is a high-priority candidate for adoption.`;
  }
  if (accessDelta >= 0.01) {
    return `Moderate improvement: ${(accessDelta * 100).toFixed(1)}pp average gain across ${improvedCount.toLocaleString()} ${locationTerm}. Equity impact is limited; compare with another placement before prioritizing investment.`;
  }
  return "Results are mixed. Review the location-level impact below before drawing conclusions.";
}

function decisionSummary({ hasResult, simulationPending, placement, selectedInterventionLabel, accessDelta, timeDelta, accessibleDelta, locationTerm }) {
  if (simulationPending) return "Evaluating the selected location. Results will update once the model finishes.";
  if (!placement) return "Select an intervention, then click the map to test how accessibility changes.";
  if (!hasResult) return `${selectedInterventionLabel || "The intervention"} is placed. Run or wait for evaluation to review the estimated impact.`;
  if (accessDelta >= 0.02 || accessibleDelta > 0) {
    return `Promising option: accessibility improves by ${(accessDelta * 100).toFixed(1)} percentage points and ${Math.max(0, accessibleDelta).toLocaleString()} more ${locationTerm} fall within the selected travel-time threshold.`;
  }
  if (timeDelta < -1) {
    return `Modest travel-time benefit: average travel time improves by ${Math.abs(timeDelta).toFixed(1)} minutes, but network-wide access changes remain limited.`;
  }
  if (accessDelta < -0.01) {
    return "This placement appears to reduce estimated accessibility. Compare another location before prioritizing it.";
  }
  return "Small estimated impact: this placement does not materially change citywide access. Try a lower-access area or a different intervention type.";
}

function stakeholderWarningText(simulationResult, scenarioWarnings) {
  if (!simulationResult) return "";
  if (simulationResult.analysis_unit === "facility_proxy") {
    return "District-level comparison is not available for the current dataset. This city currently supports impact analysis at representative service locations.";
  }
  if (scenarioWarnings.length) {
    return "Some comparison views are limited by the available city dataset. The scenario summary remains based on supported model outputs.";
  }
  return "";
}

export default function Simulate({
  city,
  analysisUnit = "",
  baselineFacilities = [],
  simulatedFacilities = [],
  baselineSupplyFacilities = [],
  transportStops = [],
  isLoading = false,
  onRunSimulation,
  simulationPending,
  simulationResult,
  comparisonResult,
  hasResult,
  activeSimulationLabel,
  onResetSimulation
}) {
  const [mode, setMode] = useState("basic");
  const [interventionType, setInterventionType] = useState("");
  const [placement, setPlacement] = useState(null);
  const [showInfluenceZone, setShowInfluenceZone] = useState(true);
  const [showBaselineStops, setShowBaselineStops] = useState(true);
  const [showBaselineFacilities, setShowBaselineFacilities] = useState(true);
  const [showRoutes, setShowRoutes] = useState(false);
  const [showAccessibilityLayer, setShowAccessibilityLayer] = useState(true);
  const [compareMode, setCompareMode] = useState(false);
  const [setupCollapsed, setSetupCollapsed] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [mapLayer, setMapLayer] = useState("baseline");
  const [advancedSettings, setAdvancedSettings] = useState(NEUTRAL_ADVANCED);
  const [lastRunSignature, setLastRunSignature] = useState("");
  const [lastRunTimeLabel, setLastRunTimeLabel] = useState("");
  const [showAllAreas, setShowAllAreas] = useState(false);
  const [warningVisible, setWarningVisible] = useState(false);

  const cityKey = city?.id || city?.city_id || "";
  const interventionOptions = useMemo(() => getAvailableInterventions(city), [city]);
  const interventionIndex = useMemo(() => new Map(interventionOptions.map((option) => [option.id, option])), [interventionOptions]);
  const selectedIntervention = interventionIndex.get(interventionType) || null;
  const citySimulationDefaults = useMemo(() => getSimulationDefaults(city), [city]);

  useEffect(() => {
    setMode("basic");
    setInterventionType("");
    setPlacement(null);
    setShowInfluenceZone(true);
    setShowBaselineStops(true);
    setShowBaselineFacilities(true);
    setShowRoutes(false);
    setShowAccessibilityLayer(true);
    setCompareMode(false);
    setSetupCollapsed(false);
    setAdvancedOpen(false);
    setMapLayer("baseline");
    setAdvancedSettings(citySimulationDefaults);
    setLastRunSignature("");
    setLastRunTimeLabel("");
    setShowAllAreas(false);
    setWarningVisible(false);
  }, [cityKey, citySimulationDefaults]);

  useEffect(() => {
    if (!simulatedFacilities.length) setMapLayer("baseline");
  }, [simulatedFacilities.length]);

  useEffect(() => {
    if (simulationResult) setMapLayer(compareMode ? "impact" : "after");
  }, [compareMode, simulationResult]);

  const payload = useMemo(
    () =>
      buildPayload({
        selectedIntervention,
        placement,
        mode,
        advancedSettings,
        cityDefaults: citySimulationDefaults
      }),
    [selectedIntervention, placement, mode, advancedSettings, citySimulationDefaults]
  );

  const payloadSignature = useMemo(() => (payload ? JSON.stringify(payload) : ""), [payload]);
  const canRunSimulation = Boolean(payload && interventionType && placement);
  const resultsOutdated = Boolean(hasResult && lastRunSignature && payloadSignature && payloadSignature !== lastRunSignature);

  const selectedDistrict = useMemo(() => {
    if (!placement || !baselineFacilities.length) return null;
    let nearest = null;
    let nearestDistance = Number.POSITIVE_INFINITY;
    baselineFacilities.forEach((row) => {
      if (!Number.isFinite(Number(row.latitude)) || !Number.isFinite(Number(row.longitude))) return;
      const distance = haversineMeters(placement.latitude, placement.longitude, row.latitude, row.longitude);
      if (distance < nearestDistance) {
        nearest = row;
        nearestDistance = distance;
      }
    });
    return nearest ? { ...nearest, markerDistanceM: nearestDistance } : null;
  }, [baselineFacilities, placement]);

  const nearestTransportStop = useMemo(() => {
    if (!placement || !transportStops.length) return null;
    let nearest = null;
    let nearestDistance = Number.POSITIVE_INFINITY;
    transportStops.forEach((stop) => {
      const latitude = Number(stop.latitude);
      const longitude = Number(stop.longitude);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
      const distance = haversineMeters(placement.latitude, placement.longitude, latitude, longitude);
      if (distance < nearestDistance) {
        nearest = stop;
        nearestDistance = distance;
      }
    });
    return nearest ? { ...nearest, distanceM: nearestDistance } : null;
  }, [placement, transportStops]);

  const selectedContext = useMemo(() => serviceContextFor(selectedDistrict, analysisUnit), [selectedDistrict, analysisUnit]);
  const populationContext = useMemo(() => populationContextFor(baselineFacilities, placement), [baselineFacilities, placement]);

  const simulationOrigins = Array.isArray(simulationResult?.origins) ? simulationResult.origins : [];
  const simulationSummary = simulationResult?.summary || {};
  const accessBefore = summaryScore(
    simulationSummary.avg_score_before ?? simulationSummary.city_before_avg_score,
    simulationOrigins.length ? average(simulationOrigins, (row) => normalizeScoreValue(row.baseline_score ?? row.before_score)) : average(baselineFacilities, (row) => row.accessibilityScore)
  );
  const accessAfter = summaryScore(
    simulationSummary.avg_score_after ?? simulationSummary.city_after_avg_score,
    simulationOrigins.length ? average(simulationOrigins, (row) => normalizeScoreValue(row.simulated_score ?? row.after_score ?? row.accessibility_score)) : average(simulatedFacilities, (row) => row.accessibilityScore)
  );
  const accessDelta = accessAfter - accessBefore;
  const timeBefore = Number.isFinite(Number(simulationSummary.avg_travel_time_before ?? simulationSummary.city_before_avg_tt))
    ? Number(simulationSummary.avg_travel_time_before ?? simulationSummary.city_before_avg_tt)
    : (1 - accessBefore) * 60;
  const timeAfter = Number.isFinite(Number(simulationSummary.avg_travel_time_after ?? simulationSummary.city_after_avg_tt))
    ? Number(simulationSummary.avg_travel_time_after ?? simulationSummary.city_after_avg_tt)
    : (1 - accessAfter) * 60;
  const timeDelta = timeAfter - timeBefore;
  const giniBefore = simulationResult?.equity?.gini_before ?? null;
  const giniAfter = simulationResult?.equity?.gini_after ?? simulationResult?.equity?.gini_coefficient ?? null;
  const giniDeltaRaw = giniBefore != null && giniAfter != null ? Number(giniAfter) - Number(giniBefore) : null;
  const giniImprovement = giniBefore != null && giniAfter != null ? Number(giniBefore) - Number(giniAfter) : null;
  const baselineUnderservedPopulation = simulationOrigins
    .filter((origin) => normalizeScoreValue(origin.baseline_score ?? origin.before_score) < 0.5)
    .reduce((sum, origin) => sum + (Number(origin.population) || 0), 0);
  const simulatedUnderservedPopulation = simulationOrigins
    .filter((origin) => normalizeScoreValue(origin.simulated_score ?? origin.after_score ?? origin.accessibility_score) < 0.5)
    .reduce((sum, origin) => sum + (Number(origin.population) || 0), 0);
  const underservedPopulationDelta = simulatedUnderservedPopulation - baselineUnderservedPopulation;
  const districtsBefore = Array.isArray(simulationResult?.district_summaries_before) ? simulationResult.district_summaries_before : [];
  const districtsAfter = Array.isArray(simulationResult?.district_summaries_after) ? simulationResult.district_summaries_after : [];
  const districtRows = useMemo(() => sortDistrictRows(districtsBefore, districtsAfter), [districtsBefore, districtsAfter]);
  const originRows = useMemo(() => {
    const rows = Array.isArray(simulationResult?.origins) ? simulationResult.origins : [];
    return rows
      .filter((row) => Math.abs(Number(row.delta ?? 0)) >= MEANINGFUL_DELTA)
      .map((row, index) => {
        const before = normalizeScoreValue(row.baseline_score ?? row.before_score);
        const after = normalizeScoreValue(row.simulated_score ?? row.after_score ?? row.accessibility_score);
        const area = String(row.origin_name ?? row.name ?? row.origin_id ?? `Area ${index + 1}`);
        const rawDistrict = String(row.district_name ?? "");
        const rowAnalysisUnit = String(row.analysis_unit ?? simulationResult?.analysis_unit ?? "");
        const district =
          rowAnalysisUnit === "facility_proxy" || !rawDistrict || rawDistrict === area || rawDistrict.toLowerCase() === "unknown"
            ? "Service location"
            : rawDistrict;
        return {
          id: String(row.id ?? row.origin_id ?? index),
          area,
          district,
          before,
          after,
          delta: Number.isFinite(Number(row.delta)) ? Number(row.delta) : after - before
        };
      })
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  }, [simulationResult]);

  const visibleOriginRows = showAllAreas ? originRows : originRows.slice(0, 10);
  const improvedOriginCount = simulationOrigins.filter((origin) => Number(origin.delta ?? 0) > MEANINGFUL_DELTA).length;
  const impactedDistrictCount = districtRows.filter((row) => Math.abs(Number(row.delta ?? 0)) >= MEANINGFUL_DELTA).length;
  const isFacilityLevelModel = analysisUnit === "facility_proxy" || simulationResult?.analysis_unit === "facility_proxy";
  const impactLocationTerm = isFacilityLevelModel ? "evaluated locations" : "areas";
  const impactLocationSingular = isFacilityLevelModel ? "Location" : "Area";
  const districtColumnLabel = isFacilityLevelModel ? "Context" : "District";
  const baselineLocationRows = simulationOrigins.length ? simulationOrigins : baselineFacilities;
  const scenarioLocationRows = hasResult && simulationOrigins.length ? simulationOrigins : simulatedFacilities.length ? simulatedFacilities : baselineFacilities;
  const maxTravelTime = Number(advancedSettings.max_travel_time_min || 30);
  const baselineAccessibleCount = baselineLocationRows.filter((row) => rowTravelMinutes(row, "baseline") <= maxTravelTime).length;
  const scenarioAccessibleCount = scenarioLocationRows.filter((row) => rowTravelMinutes(row, hasResult ? "scenario" : "baseline") <= maxTravelTime).length;
  const accessibleDelta = scenarioAccessibleCount - baselineAccessibleCount;
  const scoreDeltaText = `${accessDelta >= 0 ? "+" : ""}${(accessDelta * 100).toFixed(1)}%`;
  const timeDeltaText = `${timeDelta <= 0 ? "" : "+"}${timeDelta.toFixed(1)} min`;
  const fmtPct = (value) => `${(value * 100).toFixed(1)}%`;
  const fmtPp = (value) => `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)} pp`;
  const fmtTime = (value) => `${value.toFixed(1)} min`;
  const fmtGini = (value) => (value != null && Number.isFinite(Number(value)) ? Number(value).toFixed(3) : "N/A");
  const fmtGiniDelta = (value) => {
    if (value == null || !Number.isFinite(Number(value))) return "N/A";
    const numeric = Number(value);
    if (numeric === 0) return "0.000";
    const direction = numeric < 0 ? "reduced" : "increased";
    const sign = numeric >= 0 ? "+" : "-";
    return `${direction} ${sign}${Math.abs(numeric).toFixed(3)}`;
  };
  const fmtUnd = (value) => {
    if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
    return Math.round(value).toLocaleString();
  };
  const selectedInterventionLabel = interventionLabel(interventionType, interventionIndex);
  const interpretation = buildInterpretation(accessDelta, giniImprovement ?? 0, improvedOriginCount, simulationOrigins.length, impactLocationTerm);
  const scenarioStatus =
    accessDelta > 0.02
      ? { label: "Meaningful estimated improvement", tone: "positive" }
      : accessDelta < -0.02
      ? { label: "Potential negative impact", tone: "negative" }
      : { label: "Small estimated impact", tone: "neutral" };
  const plannerDecisionSummary = decisionSummary({
    hasResult,
    simulationPending,
    placement,
    selectedInterventionLabel,
    accessDelta,
    timeDelta,
    accessibleDelta,
    locationTerm: impactLocationTerm
  });
  const runTimeLabel = hasResult ? lastRunTimeLabel || activeSimulationLabel || "latest run" : "";
  const activeStep = !interventionType ? 1 : !placement ? 2 : !hasResult && !simulationPending ? 4 : hasResult ? 5 : 4;
  const scenarioWarnings = Array.isArray(simulationResult?.warnings) ? simulationResult.warnings : [];
  const fallbackWarning = hasResult && (simulationResult?.analysis_unit === "facility_proxy" || scenarioWarnings.some((warning) => /origin|fallback|facility proxy/i.test(String(warning))));
  const warningMessage = stakeholderWarningText(simulationResult, scenarioWarnings);
  const showWarningToast = hasResult && Boolean(warningMessage) && !fallbackWarning;

  useEffect(() => {
    if (!showWarningToast) {
      setWarningVisible(false);
      return;
    }
    setWarningVisible(true);
  }, [showWarningToast]);

  useEffect(() => {
    if (!warningVisible) return;
    const timeout = window.setTimeout(() => setWarningVisible(false), 7000);
    return () => window.clearTimeout(timeout);
  }, [warningVisible]);

  useEffect(() => {
    if (placement) setSetupCollapsed(true);
  }, [placement]);

  const runScenario = () => {
    if (!payload || !canRunSimulation || simulationPending) return;
    onRunSimulation({
      customPayload: payload,
      customLabel: selectedInterventionLabel || "Custom scenario"
    });
    setLastRunSignature(payloadSignature);
    setLastRunTimeLabel(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
  };

  useEffect(() => {
    if (!payload || !canRunSimulation || simulationPending || payloadSignature === lastRunSignature) return;
    const timeout = window.setTimeout(() => {
      onRunSimulation({
        customPayload: payload,
        customLabel: selectedInterventionLabel || "Custom scenario"
      });
      setLastRunSignature(payloadSignature);
      setLastRunTimeLabel(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    }, 600);
    return () => window.clearTimeout(timeout);
  }, [canRunSimulation, lastRunSignature, onRunSimulation, payload, payloadSignature, selectedInterventionLabel, simulationPending]);

  const chooseIntervention = (optionId) => {
    const nextValue = interventionType === optionId ? "" : optionId;
    setInterventionType(nextValue);
    setPlacement(null);
    setMapLayer("baseline");
    setLastRunSignature("");
    setLastRunTimeLabel("");
    setShowAllAreas(false);
    if (hasResult) onResetSimulation();
  };

  const statusFor = (step) => {
    if (activeStep > step) return "complete";
    if (activeStep === step) return "active";
    return "future";
  };

  const planningSummary = placement
    ? `${selectedInterventionLabel || "Selected intervention"} will be evaluated near ${selectedContext.locationValue || "the selected map location"}. The closest stop is ${friendlyStopLabel(nearestTransportStop)}${nearestTransportStop ? ` (${formatDistance(nearestTransportStop.distanceM)})` : ""}.`
    : "Select an intervention and place it on the map to review local planning context.";

  return (
    <section className="simdash-page">
      <header className="simdash-topbar">
        <div>
          <p>Planning tool</p>
          <h1>Accessibility Simulator</h1>
        </div>
        <div className="simdash-topbar-actions">
          <span className="simdash-city">{city?.display_name || city?.name || city?.id || "Selected city"}</span>
          <button type="button" onClick={() => { onResetSimulation(); setPlacement(null); setLastRunSignature(""); setLastRunTimeLabel(""); }}>
            Reset
          </button>
          <button type="button" disabled title="Scenario saving is not configured for this dataset.">
            Save scenario
          </button>
          <label className="simdash-toggle">
            <input type="checkbox" checked={compareMode} disabled={!hasResult} onChange={(event) => setCompareMode(event.target.checked)} />
            <span>Compare mode</span>
          </label>
        </div>
      </header>

      <div className={`simdash-grid ${setupCollapsed ? "is-setup-collapsed" : ""}`}>
        <aside className="simdash-panel simdash-left-panel">
          <div className="simdash-sidebar-tools">
            <button type="button" onClick={() => setSetupCollapsed((prev) => !prev)}>
              {setupCollapsed ? "Show setup" : "Hide setup"}
            </button>
          </div>
          <section className="simdash-section simdash-primary-section">
            <div className="simdash-section-head">
              <span>1</span>
              <h2>Select intervention</h2>
            </div>
            <div className="simdash-action-stack">
              {interventionOptions
                .filter((option) => ["add_transport_stop", "add_healthcare_facility"].includes(option.id))
                .map((option) => {
                  const selected = interventionType === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      className={`simdash-add-button ${selected ? "is-selected" : ""}`}
                      onClick={() => chooseIntervention(option.id)}
                    >
                      <span>{option.id === "add_transport_stop" ? "+" : "+"}</span>
                      <strong>{option.label}</strong>
                    </button>
                  );
                })}
            </div>
            <p className="simdash-helper">
              {interventionType ? "Click the map to place the selected intervention. Drag the marker to refine it." : "Choose an intervention, then place it directly on the map."}
            </p>
          </section>

          <section className="simdash-section simdash-place-section">
            <div className="simdash-section-head">
              <span>2</span>
              <h2>Place and evaluate</h2>
            </div>
            <label className="simdash-range">
              <span>Max travel time <b>{advancedSettings.max_travel_time_min} min</b></span>
              <input type="range" min="10" max="60" step="5" value={advancedSettings.max_travel_time_min} onChange={(event) => setAdvancedSettings((prev) => ({ ...prev, max_travel_time_min: Number(event.target.value) }))} />
            </label>
            <button type="button" className="simdash-run-cta" disabled={!canRunSimulation || simulationPending} onClick={runScenario}>
              {simulationPending ? "Evaluating..." : hasResult ? "Re-evaluate location" : "Evaluate scenario"}
            </button>
            <button type="button" className="simdash-advanced-toggle" onClick={() => setAdvancedOpen((prev) => !prev)}>
              {advancedOpen ? "Hide advanced settings" : "Advanced settings"}
            </button>
            {advancedOpen ? (
              <div className="simdash-advanced-area">
                <label className="simdash-range">
                  <span>Walking distance to stops <b>{advancedSettings.walking_distance_m} m</b></span>
                  <input type="range" min="200" max="1200" step="100" value={advancedSettings.walking_distance_m} onChange={(event) => setAdvancedSettings((prev) => ({ ...prev, walking_distance_m: Number(event.target.value) }))} />
                </label>
                <label className="simdash-range">
                  <span>Transport speed <b>{advancedSettings.transport_speed_kmh} km/h</b></span>
                  <input type="range" min="8" max="35" step="1" value={advancedSettings.transport_speed_kmh} onChange={(event) => setAdvancedSettings((prev) => ({ ...prev, transport_speed_kmh: Number(event.target.value) }))} />
                </label>
                <small className="simdash-note">Transport speed is sent to the model. Other settings summarize and guide interpretation.</small>
              </div>
            ) : null}
          </section>

          <section className="simdash-section">
            <div className="simdash-section-head">
              <span>3</span>
              <h2>Map layers</h2>
            </div>
            <label className="simdash-check"><input type="checkbox" checked={showBaselineFacilities} onChange={(event) => setShowBaselineFacilities(event.target.checked)} /> Show facilities</label>
            <label className="simdash-check"><input type="checkbox" checked={showBaselineStops} onChange={(event) => setShowBaselineStops(event.target.checked)} /> Show transport stops</label>
            <label className="simdash-check is-disabled"><input type="checkbox" checked={showRoutes} disabled onChange={(event) => setShowRoutes(event.target.checked)} /> Show routes <small>not available</small></label>
            <label className="simdash-check"><input type="checkbox" checked={showAccessibilityLayer} onChange={(event) => setShowAccessibilityLayer(event.target.checked)} /> Show accessibility heatmap</label>
          </section>

        </aside>

        <main className="simdash-map-panel">
          <SimulationWorkspaceMap
            city={city}
            baselineFacilities={baselineFacilities}
            simulatedFacilities={simulatedFacilities}
            transportStops={transportStops}
            baselineSupplyFacilities={baselineSupplyFacilities}
            scenarioAddedFacilities={(Array.isArray(simulationResult?.added_facilities) ? simulationResult.added_facilities : []).filter((row) => Number.isFinite(Number(row.latitude)) && Number.isFinite(Number(row.longitude)))}
            scenarioAddedStops={(Array.isArray(simulationResult?.added_transport_stops) ? simulationResult.added_transport_stops : []).filter((row) => Number.isFinite(Number(row.latitude)) && Number.isFinite(Number(row.longitude)))}
            interventionType={interventionType}
            placement={placement}
            onPlacementChange={setPlacement}
            selectedDistrictId={selectedDistrict?.id || null}
            impactedDistrictIds={(Array.isArray(simulationResult?.impacted_origin_ids) ? simulationResult.impacted_origin_ids : []).map(String)}
            mapLayer={mapLayer}
            onMapLayerChange={setMapLayer}
            showBaselineStops={showBaselineStops}
            showBaselineFacilities={showBaselineFacilities}
            showAccessibilityLayer={showAccessibilityLayer}
            showMapLegend
            showInfluenceZone={showInfluenceZone}
            isLoading={isLoading || simulationPending}
            loadingLabel={simulationPending ? "Evaluating scenario..." : "Loading map data..."}
          />
          <div className="simdash-map-status">
            <strong>{placement ? "Placement selected" : "Click map to place"}</strong>
            <span>{placement ? `${selectedContext.locationValue}${nearestTransportStop ? `, ${formatDistance(nearestTransportStop.distanceM)} from nearest stop` : ""}` : "Select an intervention, then click the map."}</span>
          </div>
        </main>

        <aside className="simdash-panel simdash-right-panel">
          <section className={`simdash-section simdash-decision is-${scenarioStatus.tone}`}>
            <div className="simdash-results-head">
              <div>
                <p>Decision summary</p>
                <h2>{hasResult ? scenarioStatus.label : simulationPending ? "Evaluating scenario" : "Ready to test"}</h2>
              </div>
              {runTimeLabel ? <span>{runTimeLabel}</span> : null}
            </div>
            <p>{plannerDecisionSummary}</p>
          </section>

          <section className="simdash-section">
            <div className="simdash-results-head">
              <div>
                <p>Key metrics</p>
                <h2>Estimated access change</h2>
              </div>
            </div>
            <div className="simdash-metrics">
              <div className="simdash-metric">
                <span>Average accessibility</span>
                <strong>{fmtPct(hasResult ? accessAfter : accessBefore)}</strong>
                <em className={accessDelta >= 0 ? "is-positive" : "is-negative"}>{hasResult ? scoreDeltaText : "baseline"}</em>
              </div>
              <div className="simdash-metric">
                <span>Average travel time</span>
                <strong>{fmtTime(hasResult ? timeAfter : timeBefore)}</strong>
                <em className={timeDelta <= 0 ? "is-positive" : "is-negative"}>{hasResult ? timeDeltaText : "baseline"}</em>
              </div>
              <div className="simdash-metric">
                <span>Locations within {maxTravelTime} min</span>
                <strong>{scenarioAccessibleCount.toLocaleString()}</strong>
                <em className={accessibleDelta >= 0 ? "is-positive" : "is-negative"}>{hasResult ? `${accessibleDelta >= 0 ? "+" : ""}${accessibleDelta}` : "locations"}</em>
              </div>
            </div>
          </section>

          <section className="simdash-section">
            <div className="simdash-section-head">
              <span>B</span>
              <h2>Before vs After</h2>
            </div>
            <div className="simdash-compare-row">
              <span>Before</span>
              <b>{fmtPct(accessBefore)}</b>
              <i style={{ width: `${Math.max(2, accessBefore * 100)}%` }} />
            </div>
            <div className="simdash-compare-row">
              <span>After</span>
              <b>{hasResult ? fmtPct(accessAfter) : "Run scenario"}</b>
              <i className="is-after" style={{ width: `${Math.max(2, (hasResult ? accessAfter : accessBefore) * 100)}%` }} />
            </div>
            {hasResult ? <div className={`simdash-change ${accessDelta >= 0 ? "is-positive" : "is-negative"}`}>Change {fmtPp(accessDelta)}</div> : null}
          </section>

          <section className="simdash-section">
            <div className="simdash-section-head">
              <span>C</span>
              <h2>Insights</h2>
            </div>
            <ul className="simdash-insights">
              <li>{hasResult ? interpretation : "Select an intervention and place it on the map to generate before-and-after insights."}</li>
              {placement ? <li>Scenario evaluated near {selectedContext.locationValue}.</li> : null}
              {hasResult ? <li>{accessibleDelta >= 0 ? `${accessibleDelta.toLocaleString()} additional ${impactLocationTerm} meet the ${maxTravelTime}-minute threshold.` : `${Math.abs(accessibleDelta).toLocaleString()} fewer ${impactLocationTerm} meet the ${maxTravelTime}-minute threshold.`}</li> : null}
              {!populationContext.supported ? <li>{populationContext.value}</li> : null}
            </ul>
          </section>

        </aside>
      </div>
    </section>
  );
}
