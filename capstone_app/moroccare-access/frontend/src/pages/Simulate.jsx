import { useEffect, useMemo, useState } from "react";
import SimulationWorkspaceMap from "../components/simulation/SimulationWorkspaceMap";
import { useI18n } from "../i18n/I18nProvider";

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

function formatPercent(value, digits = 1, fallbackLabel = "Not available yet") {
  if (!Number.isFinite(value)) return fallbackLabel;
  return `${(value * 100).toFixed(digits)}%`;
}

function formatMinutes(value, fallbackLabel = "Not available yet") {
  if (!Number.isFinite(value)) return fallbackLabel;
  return `${value.toFixed(1)} min`;
}

function formatCount(value, fallbackLabel = "Not available yet") {
  if (!Number.isFinite(value)) return fallbackLabel;
  return Math.round(value).toLocaleString();
}

function formatDistance(value, fallbackLabel = "Awaiting placement") {
  if (!Number.isFinite(value)) return fallbackLabel;
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

function interventionMeta(option, t) {
  const id = option?.id || "";
  if (id === "add_transport_stop") return { icon: "S", description: t("simflow.chooseInterventionHint") };
  if (id === "add_healthcare_facility") return { icon: "H", description: t("simflow.choosePlacementHint") };
  return { icon: "A", description: t("simflow.chooseInterventionHint") };
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

function friendlyStopLabel(stop, t) {
  if (!stop) return t("simflow.nearestStopContextMissing");
  if (stop.stop_name) return stop.stop_name;
  if (Number.isFinite(stop.cluster_id)) return `Stop cluster ${stop.cluster_id}`;
  return t("simflow.nearbyTransportStop");
}

function hasUsableDistrict(row) {
  if (!row) return false;
  const district = String(row.districtName || "").trim();
  const origin = String(row.originName || "").trim();
  if (!district || ["service location", "unknown", "unassigned area"].includes(district.toLowerCase())) return false;
  return district !== origin;
}

function serviceContextFor(row, datasetAnalysisUnit = "", t) {
  const isFacilityProxy = row?.analysisUnit === "facility_proxy" || datasetAnalysisUnit === "facility_proxy";
  if (!row) {
    return {
      locationLabel: t("simflow.selectedLocation"),
      locationValue: t("simflow.mapLocation"),
      locationSubLabel: "",
      showDistrict: false,
      districtValue: "",
      analysisUnitLabel: t("simflow.locationBasedModel")
    };
  }
  return {
    locationLabel: isFacilityProxy ? t("simflow.nearestEvaluatedFacility") : t("simflow.nearestOriginArea"),
    locationValue: row.originName || row.districtName || t("simflow.mapLocation"),
    locationSubLabel: Number.isFinite(row.markerDistanceM) ? t("simflow.distanceFromNearestStop", { distance: formatDistance(row.markerDistanceM, t("simflow.pendingPlacement")) }) : "",
    showDistrict: hasUsableDistrict(row),
    districtValue: row.districtName,
    analysisUnitLabel: t("simflow.context")
  };
}

function populationContextFor(rows, placement, t) {
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
      value: t("simflow.populationContextMissing"),
      subLabel: t("simflow.scenarioImpactModelOnly")
    };
  }

  if (!placement) {
    return {
      supported: true,
      value: t("simflow.pendingPlacement"),
      subLabel: t("simflow.withinRadius", { distance: "10 km" })
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
      value: t("simflow.noNearbyPopulation"),
      subLabel: t("simflow.withinRadius", { distance: "10 km" })
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
    subLabel: t("simflow.withinRadius", { distance: "10 km" })
  };
}

function buildPayload({ selectedIntervention, placement, mode, advancedSettings, cityDefaults }) {
  if (!selectedIntervention || !placement) return null;
  const payload = {
    ...cityDefaults,
    ...selectedIntervention.scenarioPatch,
    transport_speed_kmh: Number(advancedSettings.transport_speed_kmh || cityDefaults.transport_speed_kmh || 18),
    max_travel_time_min: Number(advancedSettings.max_travel_time_min || cityDefaults.max_travel_time_min || 60),
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

function KpiSkeleton({ t }) {
  return (
    <div className="simulate-kpi-card is-neutral">
      <div className="simulate-kpi-label">{t("simflow.loadingOutput")}</div>
      <div className="simulate-skeleton" />
      <div className="simulate-kpi-before">{t("simflow.computingModelOutput")}</div>
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

function stakeholderWarningText(simulationResult, scenarioWarnings, t) {
  if (!simulationResult) return "";
  if (simulationResult.analysis_unit === "facility_proxy") {
    return t("simflow.districtComparisonUnavailable");
  }
  if (scenarioWarnings.length) {
    return t("simflow.comparisonViewsLimited");
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
  const { t } = useI18n();
  const [mode, setMode] = useState("basic");
  const [interventionType, setInterventionType] = useState("");
  const [placement, setPlacement] = useState(null);
  const [showInfluenceZone, setShowInfluenceZone] = useState(true);
  const [showBaselineStops, setShowBaselineStops] = useState(false);
  const [showBaselineFacilities, setShowBaselineFacilities] = useState(true);
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
  const unavailableText = t("simflow.notAvailableYet");

  useEffect(() => {
    setMode("basic");
    setInterventionType("");
    setPlacement(null);
    setShowInfluenceZone(true);
    setShowBaselineStops(false);
    setShowBaselineFacilities(true);
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

  const selectedContext = useMemo(() => serviceContextFor(selectedDistrict, analysisUnit, t), [selectedDistrict, analysisUnit, t]);
  const populationContext = useMemo(() => populationContextFor(baselineFacilities, placement, t), [baselineFacilities, placement, t]);
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
        label: row.intervention_type === "healthcare_facility" ? t("simflow.recommendedFacilitySite") : t("simflow.recommendedStopSite"),
        score: Number(row.score || 0)
      })),
    [recommendationRows, t]
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
  const impactLocationTerm = isFacilityLevelModel ? t("simflow.evaluatedLocationsImproved") : t("simflow.areasImproved");
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
  const fmtGini = (value) => (value != null && Number.isFinite(Number(value)) ? Number(value).toFixed(3) : t("analytics.na"));
  const fmtGiniDelta = (value) => {
    if (value == null || !Number.isFinite(Number(value))) return t("analytics.na");
    const numeric = Number(value);
    if (numeric === 0) return "0.000";
    const sign = numeric >= 0 ? "+" : "-";
    return `${sign}${Math.abs(numeric).toFixed(3)}`;
  };
  const fmtUnd = (value) => {
    if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
    return Math.round(value).toLocaleString();
  };
  const selectedInterventionLabel = interventionLabel(interventionType, interventionIndex);
  const scenarioStatus =
    accessDelta > 0.02
      ? { label: t("simflow.meaningfullyImproved"), tone: "positive" }
      : accessDelta < -0.02
      ? { label: t("simflow.potentialNegativeImpact"), tone: "negative" }
      : { label: t("simflow.smallEstimatedImpact"), tone: "neutral" };
  const runTimeLabel = hasResult ? lastRunTimeLabel || activeSimulationLabel || t("simflow.latestRun") : "";
  const summaryHeading = selectedInterventionLabel || t("simflow.scenarioOutcome");
  const summaryStatusLabel = hasResult ? t("simflow.evaluated") : simulationPending ? t("simflow.running") : placement ? t("simflow.ready") : t("simflow.setupRequired");
  const summaryHelperText = hasResult
    ? scenarioStatus.label
    : simulationPending
    ? t("simflow.evaluatingPlacedScenario")
    : placement
    ? t("simflow.runToCompare")
    : t("simflow.selectAndPlace");
  const summaryMetaText = [selectedInterventionLabel || t("simflow.noInterventionSelected"), placement ? t("simflow.markerPlaced") : t("simflow.noPlacement"), runTimeLabel || null]
    .filter(Boolean)
    .join(" | ");
  const metricSectionLabel = hasResult ? t("simflow.scenarioImpact") : t("simflow.baselineMetrics");
  const scenarioWarnings = Array.isArray(simulationResult?.warnings) ? simulationResult.warnings : [];
  const fallbackWarning = hasResult && (simulationResult?.analysis_unit === "facility_proxy" || scenarioWarnings.some((warning) => /origin|fallback|facility proxy/i.test(String(warning))));
  const warningMessage = stakeholderWarningText(simulationResult, scenarioWarnings, t);
  const showWarningToast = hasResult && Boolean(warningMessage) && !fallbackWarning;
  const mapInteractionHint = !interventionType
    ? t("simflow.chooseInterventionHint")
    : placement
    ? t("simflow.dragMarkerHint")
    : t("simflow.clickMapPlaceIntervention", { intervention: selectedInterventionLabel?.toLowerCase() || t("simflow.selectIntervention").toLowerCase() });
  const unsupportedPopulationMessage = !populationContext.supported ? populationContext.value : "";
  const settingsSummary = [
    t("simflow.settingsThreshold", { value: advancedSettings.max_travel_time_min }),
    t("simflow.settingsWalk", { value: advancedSettings.walking_distance_m }),
    t("simflow.settingsSpeed", { value: advancedSettings.transport_speed_kmh }),
    showAccessibilityLayer ? t("simflow.settingsSurfaceOn") : t("simflow.settingsSurfaceOff"),
    showInfluenceZone ? t("simflow.settingsInfluenceOn") : t("simflow.settingsInfluenceOff")
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
      label: t("simflow.nearestStop"),
      value: nearestTransportStop ? friendlyStopLabel(nearestTransportStop, t) : placement ? t("simflow.calculating") : t("simflow.pendingPlacement"),
      detail: nearestTransportStop ? formatDistance(nearestTransportStop.distanceM, t("simflow.pendingPlacement")) : null,
      variant: "stacked"
    },
    hasResult
      ? {
          label: isFacilityLevelModel ? t("simflow.evaluatedLocationsImproved") : t("simflow.areasImproved"),
          value: formatCount(improvedOriginCount, unavailableText),
          detail: null,
          variant: "compact"
        }
      : null,
    hasResult
      ? {
          label: isFacilityLevelModel ? t("simflow.contextsAffected") : t("simflow.districtsAffected"),
          value: formatCount(Math.max(0, impactedDistrictCount), unavailableText),
          detail: null,
          variant: "compact"
        }
      : null,
    hasResult && featureChangedOriginCount > 0
      ? {
          label: t("simflow.featureUpdatedOrigins"),
          value: formatCount(Math.max(0, featureChangedOriginCount), unavailableText),
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
        customLabel: selectedInterventionLabel || t("simulate.scenarioFallback")
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
      label: t("simflow.averageAccessibility"),
      value: hasResult ? fmtPct(accessAfter) : fmtPct(accessBefore),
      delta: hasResult ? fmtPp(accessDelta) : null
    },
    {
      emphasis: "primary",
      label: t("simflow.averageTravelTime"),
      value: hasResult ? fmtTime(timeAfter) : fmtTime(timeBefore),
      delta: hasResult ? timeDeltaText : null
    },
    {
      emphasis: "secondary",
      label: `${t("simflow.threshold")} ${maxTravelTime} min`,
      value: hasResult ? scenarioAccessibleCount.toLocaleString() : baselineAccessibleCount.toLocaleString(),
      delta: hasResult ? `${accessibleDelta >= 0 ? "+" : ""}${accessibleDelta.toLocaleString()}` : null
    },
    {
      emphasis: "secondary",
      label:
        Number.isFinite(baselineUnderservedPopulation) && Number.isFinite(simulatedUnderservedPopulation) && (baselineUnderservedPopulation > 0 || simulatedUnderservedPopulation > 0)
          ? t("simflow.underservedPopulation")
          : t("simflow.equityGini"),
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
            {t("simflow.dismissed")}
          </button>
        </div>
      ) : null}

      <div className="simflow-shell">
        <div className={`simflow-progress ${hasResult ? "is-condensed" : ""}`} aria-label={t("simflow.simulationProgress")}>
          {[
            { step: 1, title: t("simflow.selectIntervention"), meta: selectedInterventionLabel || t("simflow.chooseScenarioType") },
            { step: 2, title: t("simflow.placeOnMap"), meta: placement ? t("simflow.markerPlaced") : t("simflow.chooseLocation") },
            { step: 3, title: t("simflow.results"), meta: hasResult ? scenarioStatus.label : placement ? t("simflow.readyToReview") : t("simflow.waitingForPlacement") }
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
                <strong>{t("simflow.selectIntervention")}</strong>
                <span className="simflow-selector-head-dot" aria-hidden="true" />
                <span>{t("simflow.chooseScenarioType")}</span>
              </div>
            ) : null}

            <div className={`simflow-selector-strip ${!interventionType ? "simflow-selector-strip--selection" : ""}`}>
              {!interventionType ? (
                <div className="simflow-selector-list simflow-selector-list--strip" role="tablist" aria-label={t("simflow.interventionSelector")}>
                  {visibleInterventions.map((option) => {
                    const selected = interventionType === option.id;
                    const meta = interventionMeta(option, t);
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
                  <span className="simflow-selected-focus__icon">{interventionMeta(selectedIntervention, t).icon}</span>
                  <strong>{selectedInterventionLabel}</strong>
                </div>
              )}

              {interventionType ? (
                <div className="simflow-selector-inline-status" aria-live="polite">
                <span>{placement ? t("simflow.locationSelected") : t("simflow.clickMapChooseLocation")}</span>
                {placement && nearestTransportStop ? (
                  <>
                    <span className="simflow-inline-dot" aria-hidden="true">
                      •
                    </span>
                    <span>{t("simflow.distanceFromNearestStop", { distance: formatDistance(nearestTransportStop.distanceM, t("simflow.pendingPlacement")) })}</span>
                  </>
                ) : null}
                </div>
              ) : null}

              <div className={`simflow-utility-actions ${interventionType ? "simflow-utility-actions--strip" : "simflow-utility-actions--selection"}`}>
                {interventionType ? (
                  <button type="button" className="simflow-text-action" onClick={() => setInterventionType("")}>
                    {t("simflow.change")}
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
                      {t("simflow.clearPlacement")}
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
                      {t("simflow.reset")}
                    </button>
                  </>
                ) : null}
                <button type="button" className="simflow-text-action is-subtle" onClick={() => setAdvancedOpen((prev) => !prev)}>
                  {advancedOpen ? t("simflow.closeSettings") : t("simflow.advancedSettings")}
                </button>
              </div>
            </div>

            {advancedOpen ? (
              <div className="simflow-advanced-panel">
                <div className="simdash-advanced-area">
                  <label className="simdash-range">
                    <span>
                      {t("simflow.threshold")} <b>{advancedSettings.max_travel_time_min} min</b>
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
                        {t("simflow.walkingDistance")} <b>{advancedSettings.walking_distance_m} m</b>
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
                        {t("simflow.transportSpeed")} <b>{advancedSettings.transport_speed_kmh} km/h</b>
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
                      {t("simflow.showAccessibilitySurface")}
                    </label>
                    <label className="simdash-check">
                      <input type="checkbox" checked={showBaselineFacilities} onChange={(event) => setShowBaselineFacilities(event.target.checked)} />
                      {t("simflow.showHealthcareSupply")}
                    </label>
                    <label className="simdash-check">
                      <input type="checkbox" checked={showInfluenceZone} onChange={(event) => setShowInfluenceZone(event.target.checked)} />
                      {t("simflow.showInfluenceZone")}
                    </label>
                  </div>
                </div>
              </div>
            ) : interventionType ? (
              <div className="simflow-settings-summary" aria-label={t("simflow.selectedAdvancedSettings")}>
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
                loadingLabel={simulationPending ? t("simflow.evaluatingScenario") : t("map.loadingMap")}
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
                <p>{t("simflow.scenarioSummary")}</p>
                <h2>{summaryHeading}</h2>
              </div>
              <div className={`simflow-summary-status simflow-summary-status--${hasResult ? scenarioStatus.tone : simulationPending ? "running" : placement ? "ready" : "setup"}`}>
                <strong>{summaryStatusLabel}</strong>
                <span>{summaryHelperText}</span>
              </div>
              <p className="simflow-note">{summaryMetaText}</p>
              {workspaceStep === 3 ? (
                <div className="simflow-actions">
                  <button type="button" className="simflow-text-action" disabled title={t("simflow.saveUnavailable")}>
                    {t("simflow.save")}
                  </button>
                </div>
              ) : null}
              <div className="simflow-summary-divider" />
              <div className="simflow-panel-head simflow-panel-head--compact">
                <p>{metricSectionLabel}</p>
              </div>
              {simulationPending ? (
                <div className="simdash-kpi-grid simdash-kpi-grid--compact">
                  <KpiSkeleton t={t} />
                  <KpiSkeleton t={t} />
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
                    <p>{t("simflow.context")}</p>
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
