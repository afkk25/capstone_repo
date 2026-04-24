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

function formatSignedPp(value, digits = 2) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "0.00 pp";
  return `${numeric >= 0 ? "+" : ""}${(numeric * 100).toFixed(digits)} pp`;
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

function KpiSkeleton() {
  return (
    <div className="simulate-kpi-card is-neutral">
      <div className="simulate-kpi-label">Loading</div>
      <div className="simulate-skeleton" />
      <div className="simulate-kpi-before">computing model output</div>
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
  cities = [],
  selectedCityId = "",
  analysisUnit = "",
  baselineFacilities = [],
  simulatedFacilities = [],
  baselineSupplyFacilities = [],
  transportStops = [],
  recommendedPlacements = null,
  isLoading = false,
  onRunSimulation,
  simulationPending,
  simulationResult,
  comparisonResult,
  hasResult,
  activeSimulationLabel,
  onNavigate,
  onCityChange,
  onResetSimulation
}) {
  const [mode, setMode] = useState("basic");
  const [interventionType, setInterventionType] = useState("");
  const [placement, setPlacement] = useState(null);
  const [showInfluenceZone, setShowInfluenceZone] = useState(true);
  const [showBaselineStops, setShowBaselineStops] = useState(false);
  const [showBaselineFacilities, setShowBaselineFacilities] = useState(false);
  const [showAccessibilityLayer, setShowAccessibilityLayer] = useState(true);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [mapLayer, setMapLayer] = useState("baseline");
  const [advancedSettings, setAdvancedSettings] = useState(NEUTRAL_ADVANCED);
  const [lastRunSignature, setLastRunSignature] = useState("");
  const [lastRunTimeLabel, setLastRunTimeLabel] = useState("");
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
    setShowBaselineStops(false);
    setShowBaselineFacilities(false);
    setShowAccessibilityLayer(true);
    setAdvancedOpen(false);
    setMapLayer("baseline");
    setAdvancedSettings(citySimulationDefaults);
    setLastRunSignature("");
    setLastRunTimeLabel("");
    setWarningVisible(false);
  }, [cityKey, citySimulationDefaults]);

  useEffect(() => {
    if (!simulatedFacilities.length) setMapLayer("baseline");
  }, [simulatedFacilities.length]);

  useEffect(() => {
    if (simulationResult) setMapLayer("after");
  }, [simulationResult]);

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
  const recommendationRows = useMemo(() => {
    const rows = Array.isArray(recommendedPlacements?.placements) ? recommendedPlacements.placements : [];
    const expectedType =
      interventionType === "add_healthcare_facility"
        ? "healthcare_facility"
        : interventionType === "add_transport_stop"
        ? "transport_stop"
        : "";
    return rows
      .filter((row) => {
        if (!Number.isFinite(Number(row.latitude)) || !Number.isFinite(Number(row.longitude))) return false;
        return expectedType ? row.intervention_type === expectedType : true;
      })
      .slice()
      .sort((a, b) => Number(b.score || 0) - Number(a.score || 0))
      .slice(0, 3);
  }, [interventionType, recommendedPlacements]);
  const recommendedMapMarkers = useMemo(
    () =>
      recommendationRows.map((row) => ({
        latitude: Number(row.latitude),
        longitude: Number(row.longitude),
        interventionType: row.intervention_type,
        label: row.intervention_type === "healthcare_facility" ? "Recommended facility site" : "Recommended stop site",
        score: Number(row.score || 0)
      })),
    [recommendationRows]
  );

  const simulationOrigins = Array.isArray(simulationResult?.origins) ? simulationResult.origins : [];
  const simulationSummary = simulationResult?.summary || {};
  const featureChangedOriginCount = Number(simulationResult?.delta_summary?.feature_changed_origin_count || 0);
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
  const improvedOriginCount = simulationOrigins.filter((origin) => Number(origin.delta ?? 0) > MEANINGFUL_DELTA).length;
  const impactedDistrictCount = districtRows.filter((row) => Math.abs(Number(row.delta ?? 0)) >= MEANINGFUL_DELTA).length;
  const isFacilityLevelModel = analysisUnit === "facility_proxy" || simulationResult?.analysis_unit === "facility_proxy";
  const impactLocationTerm = isFacilityLevelModel ? "evaluated locations" : "areas";
  const baselineLocationRows = simulationOrigins.length ? simulationOrigins : baselineFacilities;
  const scenarioLocationRows = hasResult && simulationOrigins.length ? simulationOrigins : simulatedFacilities.length ? simulatedFacilities : baselineFacilities;
  const maxTravelTime = Number(advancedSettings.max_travel_time_min || 30);
  const baselineAccessibleCount = baselineLocationRows.filter((row) => rowTravelMinutes(row, "baseline") <= maxTravelTime).length;
  const scenarioAccessibleCount = scenarioLocationRows.filter((row) => rowTravelMinutes(row, hasResult ? "scenario" : "baseline") <= maxTravelTime).length;
  const accessibleDelta = scenarioAccessibleCount - baselineAccessibleCount;
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
  const scenarioStatus =
    accessDelta > 0.02
      ? { label: "Meaningful estimated improvement", tone: "positive" }
      : accessDelta < -0.02
      ? { label: "Potential negative impact", tone: "negative" }
      : { label: "Small estimated impact", tone: "neutral" };
  const runTimeLabel = hasResult ? lastRunTimeLabel || activeSimulationLabel || "latest run" : "";
  const summaryHeading = selectedInterventionLabel || "Scenario outcome";
  const summaryStatusLabel = hasResult ? "Evaluated" : simulationPending ? "Running" : placement ? "Ready" : "Setup required";
  const summaryHelperText = hasResult
    ? scenarioStatus.label
    : simulationPending
    ? "Evaluating the placed scenario."
    : placement
    ? "Run the scenario to compare against baseline."
    : "Select an intervention and place it on the map.";
  const summaryMetaText = [selectedInterventionLabel || "No intervention selected", placement ? "Marker placed" : "No placement", runTimeLabel || null]
    .filter(Boolean)
    .join(" | ");
  const metricSectionLabel = hasResult ? "Scenario impact" : "Baseline metrics";
  const scenarioWarnings = Array.isArray(simulationResult?.warnings) ? simulationResult.warnings : [];
  const fallbackWarning = hasResult && (simulationResult?.analysis_unit === "facility_proxy" || scenarioWarnings.some((warning) => /origin|fallback|facility proxy/i.test(String(warning))));
  const warningMessage = stakeholderWarningText(simulationResult, scenarioWarnings);
  const showWarningToast = hasResult && Boolean(warningMessage) && !fallbackWarning;
  const mapInteractionHint = !interventionType
    ? "Choose an intervention in the left panel to activate map placement."
    : placement
    ? "Drag the highlighted intervention marker to refine the tested location."
    : `Click on the map to place the ${selectedInterventionLabel?.toLowerCase() || "intervention"}.`;
  const unsupportedPopulationMessage = !populationContext.supported ? populationContext.value : "";
  const settingsSummary = [
    `Threshold ${advancedSettings.max_travel_time_min} min`,
    `Walk ${advancedSettings.walking_distance_m} m`,
    `Speed ${advancedSettings.transport_speed_kmh} km/h`,
    showAccessibilityLayer ? "Surface on" : "Surface off",
    showInfluenceZone ? "Influence on" : "Influence off"
  ];
  const contextRows = [
    placement
      ? {
          label: selectedContext.locationLabel,
          value: selectedContext.locationValue,
          detail: selectedContext.locationSubLabel || null,
          variant: "stacked"
        }
      : null,
    {
      label: "Nearest stop",
      value: nearestTransportStop ? friendlyStopLabel(nearestTransportStop) : placement ? "Calculating" : "Pending placement",
      detail: nearestTransportStop ? formatDistance(nearestTransportStop.distanceM) : null,
      variant: "stacked"
    },
    hasResult
      ? {
          label: isFacilityLevelModel ? "Evaluated locations improved" : "Areas improved",
          value: formatCount(improvedOriginCount),
          detail: null,
          variant: "compact"
        }
      : null,
    hasResult
      ? {
          label: isFacilityLevelModel ? "Contexts affected" : "Districts affected",
          value: formatCount(Math.max(0, impactedDistrictCount)),
          detail: null,
          variant: "compact"
        }
      : null,
    hasResult && featureChangedOriginCount > 0
      ? {
          label: "Feature-updated origins",
          value: formatCount(Math.max(0, featureChangedOriginCount)),
          detail: null,
          variant: "compact"
        }
      : null
  ].filter(Boolean);

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
    if (hasResult) onResetSimulation();
  };

  const useRecommendedPlacement = (row) => {
    const optionId = row.intervention_type === "healthcare_facility" ? "add_healthcare_facility" : "add_transport_stop";
    setInterventionType(optionId);
    setPlacement({
      latitude: Number(row.latitude),
      longitude: Number(row.longitude)
    });
    setMapLayer("baseline");
    setLastRunSignature("");
    setLastRunTimeLabel("");
    if (hasResult) onResetSimulation();
  };

  const workspaceStep = !interventionType ? 1 : !placement ? 2 : 3;
  const insightMetrics = [
    {
      emphasis: "primary",
      label: "Average accessibility",
      value: hasResult ? fmtPct(accessAfter) : fmtPct(accessBefore),
      delta: hasResult ? fmtPp(accessDelta) : null
    },
    {
      emphasis: "primary",
      label: "Average travel time",
      value: hasResult ? fmtTime(timeAfter) : fmtTime(timeBefore),
      delta: hasResult ? timeDeltaText : null
    },
    {
      emphasis: "secondary",
      label: `Within ${maxTravelTime} min`,
      value: hasResult ? scenarioAccessibleCount.toLocaleString() : baselineAccessibleCount.toLocaleString(),
      delta: hasResult ? `${accessibleDelta >= 0 ? "+" : ""}${accessibleDelta.toLocaleString()}` : null
    },
    {
      emphasis: "secondary",
      label: Number.isFinite(baselineUnderservedPopulation) && Number.isFinite(simulatedUnderservedPopulation) && (baselineUnderservedPopulation > 0 || simulatedUnderservedPopulation > 0) ? "Underserved population" : "Equity (Gini)",
      value:
        Number.isFinite(baselineUnderservedPopulation) && Number.isFinite(simulatedUnderservedPopulation) && (baselineUnderservedPopulation > 0 || simulatedUnderservedPopulation > 0)
          ? hasResult
            ? fmtUnd(simulatedUnderservedPopulation)
            : fmtUnd(baselineUnderservedPopulation)
          : hasResult
          ? fmtGini(giniAfter)
          : fmtGini(giniBefore),
      delta:
        Number.isFinite(baselineUnderservedPopulation) && Number.isFinite(simulatedUnderservedPopulation) && (baselineUnderservedPopulation > 0 || simulatedUnderservedPopulation > 0)
          ? hasResult
            ? `${underservedPopulationDelta >= 0 ? "+" : ""}${fmtUnd(underservedPopulationDelta)}`
            : null
          : hasResult
          ? fmtGiniDelta(giniDeltaRaw)
          : null
    }
  ];
  const visibleInterventions = interventionType
    ? interventionOptions.filter((option) => option.id === interventionType)
    : interventionOptions;

  return (
    <section className="simcmd-page">
      {warningVisible ? (
        <div className="simulate-warning-toast simdash-warning-toast">
          <div>{warningMessage}</div>
          <button type="button" onClick={() => setWarningVisible(false)}>
            Dismiss
          </button>
        </div>
      ) : null}

      <div className="simflow-shell">
        <div className="simflow-progress" aria-label="Simulation progress">
          {[
            { step: 1, title: "Select intervention", meta: selectedInterventionLabel || "Choose a scenario" },
            { step: 2, title: "Place on map", meta: placement ? "Marker placed" : "Choose a location" },
            { step: 3, title: "Results", meta: hasResult ? scenarioStatus.label : placement ? "Ready to review" : "Waiting for placement" }
          ].map((item) => {
            const isComplete = item.step < workspaceStep || (item.step === 3 && hasResult);
            const isCurrent = item.step === workspaceStep && !(item.step === 3 && hasResult);
            return (
              <div key={item.step} className={`simflow-progress-step ${isCurrent ? "is-current" : ""} ${isComplete ? "is-complete" : ""}`}>
                <div className="simflow-progress-index">{isComplete ? "OK" : item.step}</div>
                <div>
                  <strong>{item.title}</strong>
                  <span>{item.meta}</span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="simflow-selector-row">
          <div className="simflow-selector-block">
            {!interventionType ? (
              <div className="simflow-selector-head">
                <strong>Select intervention</strong>
                <span className="simflow-selector-head-dot" aria-hidden="true" />
                <span>Choose a scenario type</span>
              </div>
            ) : null}

            <div className={`simflow-selector-strip ${!interventionType ? "simflow-selector-strip--selection" : ""}`}>
              {!interventionType ? (
                <div className="simflow-selector-list simflow-selector-list--strip" role="tablist" aria-label="Intervention selector">
                  {visibleInterventions.map((option) => {
                    const selected = interventionType === option.id;
                    const meta = interventionMeta(option);
                    return (
                      <button
                        key={option.id}
                        type="button"
                        className={`simflow-selector-pill simflow-selector-pill--option ${selected ? "is-selected" : ""}`}
                        onClick={() => chooseIntervention(option.id)}
                        aria-pressed={selected}
                      >
                        <span>{meta.icon}</span>
                        <strong>{option.label}</strong>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="simflow-selected-focus" aria-live="polite">
                  <span className="simflow-selected-focus__icon">{interventionMeta(selectedIntervention).icon}</span>
                  <strong>{selectedInterventionLabel}</strong>
                </div>
              )}

              {interventionType ? (
                <div className="simflow-selector-inline-status" aria-live="polite">
                <span>{placement ? "Location selected" : "Click on the map to choose a location"}</span>
                {placement && nearestTransportStop ? (
                  <>
                    <span className="simflow-inline-dot" aria-hidden="true">
                      •
                    </span>
                    <span>{`${formatDistance(nearestTransportStop.distanceM)} from nearest stop`}</span>
                  </>
                ) : null}
                </div>
              ) : null}

              <div className={`simflow-utility-actions ${interventionType ? "simflow-utility-actions--strip" : "simflow-utility-actions--selection"}`}>
                {interventionType ? (
                  <button type="button" className="simflow-text-action" onClick={() => setInterventionType("")}>
                    Change
                  </button>
                ) : null}
                {interventionType ? (
                  <>
                    <button
                      type="button"
                      className="simflow-text-action"
                      disabled={!placement}
                      onClick={() => {
                        setPlacement(null);
                        setLastRunSignature("");
                        setLastRunTimeLabel("");
                        if (hasResult) onResetSimulation();
                      }}
                    >
                      Clear placement
                    </button>
                    <button
                      type="button"
                      className="simflow-text-action"
                      disabled={!placement && !hasResult}
                      onClick={() => {
                        onResetSimulation();
                        setPlacement(null);
                        setLastRunSignature("");
                        setLastRunTimeLabel("");
                      }}
                    >
                      Reset
                    </button>
                  </>
                ) : null}
                <button type="button" className="simflow-text-action is-subtle" onClick={() => setAdvancedOpen((prev) => !prev)}>
                  {advancedOpen ? "Close settings" : "Advanced settings"}
                </button>
              </div>
            </div>

            {advancedOpen ? (
              <div className="simflow-advanced-panel">
                <div className="simdash-advanced-area">
                  <label className="simdash-range">
                    <span>
                      Threshold <b>{advancedSettings.max_travel_time_min} min</b>
                    </span>
                    <input
                      type="range"
                      min="10"
                      max="60"
                      step="5"
                      value={advancedSettings.max_travel_time_min}
                      onChange={(event) => setAdvancedSettings((prev) => ({ ...prev, max_travel_time_min: Number(event.target.value) }))}
                    />
                  </label>
                  <label className="simdash-range">
                    <span>
                      Walking distance <b>{advancedSettings.walking_distance_m} m</b>
                    </span>
                    <input
                      type="range"
                      min="200"
                      max="1200"
                      step="100"
                      value={advancedSettings.walking_distance_m}
                      onChange={(event) => setAdvancedSettings((prev) => ({ ...prev, walking_distance_m: Number(event.target.value) }))}
                    />
                  </label>
                  <label className="simdash-range">
                    <span>
                      Transport speed <b>{advancedSettings.transport_speed_kmh} km/h</b>
                    </span>
                    <input
                      type="range"
                      min="8"
                      max="35"
                      step="1"
                      value={advancedSettings.transport_speed_kmh}
                      onChange={(event) => setAdvancedSettings((prev) => ({ ...prev, transport_speed_kmh: Number(event.target.value) }))}
                    />
                  </label>
                  <div className="simdash-display-options">
                    <label className="simdash-check">
                      <input type="checkbox" checked={showAccessibilityLayer} onChange={(event) => setShowAccessibilityLayer(event.target.checked)} />
                      Show accessibility surface
                    </label>
                    <label className="simdash-check">
                      <input type="checkbox" checked={showBaselineFacilities} onChange={(event) => setShowBaselineFacilities(event.target.checked)} />
                      Show healthcare supply
                    </label>
                    <label className="simdash-check">
                      <input type="checkbox" checked={showInfluenceZone} onChange={(event) => setShowInfluenceZone(event.target.checked)} />
                      Show influence zone
                    </label>
                  </div>
                </div>
              </div>
            ) : interventionType ? (
              <div className="simflow-settings-summary" aria-label="Selected advanced settings">
                {settingsSummary.map((item) => (
                  <span key={item}>{item}</span>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div className="simflow-grid">
          <section className="simflow-main">
            <div className="simflow-map-frame">
              <SimulationWorkspaceMap
                city={city}
                baselineFacilities={baselineFacilities}
                simulatedFacilities={simulatedFacilities}
                transportStops={transportStops}
                baselineSupplyFacilities={baselineSupplyFacilities}
                scenarioAddedFacilities={(Array.isArray(simulationResult?.added_facilities) ? simulationResult.added_facilities : []).filter((row) => Number.isFinite(Number(row.latitude)) && Number.isFinite(Number(row.longitude)))}
                scenarioAddedStops={(Array.isArray(simulationResult?.added_transport_stops) ? simulationResult.added_transport_stops : []).filter((row) => Number.isFinite(Number(row.latitude)) && Number.isFinite(Number(row.longitude)))}
                recommendedPlacementMarkers={placement ? [] : recommendedMapMarkers}
                interventionType={interventionType}
                placement={placement}
                onPlacementChange={setPlacement}
                selectedDistrictId={selectedDistrict?.id || null}
                impactedDistrictIds={(Array.isArray(simulationResult?.impacted_origin_ids) ? simulationResult.impacted_origin_ids : []).map(String)}
                mapLayer={mapLayer}
                onMapLayerChange={setMapLayer}
                showBaselineStops={showBaselineStops}
                onShowBaselineStopsChange={setShowBaselineStops}
                showBaselineFacilities={showBaselineFacilities}
                showAccessibilityLayer={showAccessibilityLayer}
                showMapLegend={false}
                showInfluenceZone={showInfluenceZone}
                isLoading={isLoading || simulationPending}
                loadingLabel={simulationPending ? "Evaluating scenario..." : "Loading map data..."}
                interactionHint={mapInteractionHint}
                selectedInterventionLabel={selectedInterventionLabel}
                onRecommendedPlacementSelect={(marker) =>
                  useRecommendedPlacement({
                    intervention_type: marker.interventionType,
                    latitude: marker.latitude,
                    longitude: marker.longitude,
                    score: marker.score
                  })
                }
              />
            </div>
          </section>

          <aside className="simflow-insights">
            <section className={`simflow-panel simflow-panel--status simflow-panel--summary is-${scenarioStatus.tone}`}>
              <div className="simflow-panel-head">
                <p>Scenario summary</p>
                <h2>{summaryHeading}</h2>
              </div>
              <div className={`simflow-summary-status simflow-summary-status--${hasResult ? scenarioStatus.tone : simulationPending ? "running" : placement ? "ready" : "setup"}`}>
                <strong>{summaryStatusLabel}</strong>
                <span>{summaryHelperText}</span>
              </div>
              <p className="simflow-note">{summaryMetaText}</p>
              {workspaceStep === 3 ? (
                <div className="simflow-actions">
                  <button type="button" className="simflow-text-action" disabled title="Scenario saving is not configured for this dataset.">
                    Save
                  </button>
                </div>
              ) : null}
              <div className="simflow-summary-divider" />
              <div className="simflow-panel-head simflow-panel-head--compact">
                <p>{metricSectionLabel}</p>
              </div>
              {simulationPending ? (
                <div className="simdash-kpi-grid simdash-kpi-grid--compact">
                  <KpiSkeleton />
                  <KpiSkeleton />
                </div>
              ) : (
                <div className="simflow-metric-list simflow-metric-list--compact">
                  {insightMetrics.map((item) => (
                    <div key={item.label} className={`simflow-metric simflow-metric--${item.emphasis}`}>
                      <span className="simflow-metric-label">{item.label}</span>
                      <strong>{item.value}</strong>
                      <em>{item.delta || "—"}</em>
                    </div>
                  ))}
                </div>
              )}
              {contextRows.length ? (
                <>
                  <div className="simflow-summary-divider" />
                  <div className="simflow-panel-head simflow-panel-head--compact">
                    <p>Context</p>
                  </div>
                  <div className="simflow-context-list">
                    {contextRows.map((item) => (
                      <div key={`${item.label}-${item.value}`} className={`simflow-context-row simflow-context-row--${item.variant || "compact"}`}>
                        <span className="simflow-context-label">{item.label}</span>
                        <strong>{item.value}</strong>
                        <em>{item.detail || " "}</em>
                      </div>
                    ))}
                  </div>
                </>
              ) : null}
              {unsupportedPopulationMessage ? <p className="simflow-summary-footer">{unsupportedPopulationMessage}</p> : null}
            </section>
          </aside>
        </div>
      </div>
    </section>
  );
}
