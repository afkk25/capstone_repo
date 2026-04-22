import { useEffect, useMemo, useState } from "react";
import SimulationWorkspaceMap from "../components/simulation/SimulationWorkspaceMap";
import { useI18n } from "../i18n/I18nProvider";

const NEUTRAL_ADVANCED = {
  stop_density_multiplier: 1.0,
  reduce_nearest_stop_distance_pct: 0.0,
  add_facilities: 0
};

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

function formatPercent(value) {
  if (!Number.isFinite(value)) return "Unavailable";
  return `${(value * 100).toFixed(1)}%`;
}

function scorePercentToRatio(value) {
  if (!Number.isFinite(Number(value))) return NaN;
  return Math.max(0, Math.min(1, Number(value) / 100));
}

function formatMinutes(value) {
  if (!Number.isFinite(value)) return "Unavailable";
  return `${value.toFixed(1)} min`;
}

function formatCount(value) {
  if (!Number.isFinite(value)) return "Unavailable";
  return Math.round(value).toLocaleString();
}

function formatDistance(value) {
  if (!Number.isFinite(value)) return "Unavailable";
  if (value < 1000) return `${Math.round(value)} m`;
  return `${(value / 1000).toFixed(value < 5000 ? 1 : 0)} km`;
}

function formatMeaningfulDelta(value, { multiplier = 1, decimals = 1, unit = "", epsilon = 0.0005, positiveIsGood = true } = {}) {
  if (!Number.isFinite(value)) return { text: "Unavailable", tone: "neutral" };
  const scaled = value * multiplier;
  if (Math.abs(scaled) < epsilon) return { text: "No meaningful change", tone: "neutral" };
  const sign = scaled > 0 ? "+" : "";
  const good = positiveIsGood ? scaled > 0 : scaled < 0;
  return { text: `${sign}${scaled.toFixed(decimals)}${unit}`, tone: good ? "good" : "watch" };
}

function interventionLabel(interventionType, interventionIndex) {
  if (!interventionType) return "";
  return interventionIndex.get(interventionType)?.label || interventionType;
}

function interventionDescription(option) {
  if (!option) return "";
  if (option.placementTarget === "facility_locations") {
    return "Test a new care location and estimate which nearby origin areas improve.";
  }
  if (option.id === "improve_service") {
    return "Target a stop-access improvement area and estimate travel-time impact.";
  }
  return "Place a new public transport access point and estimate nearby benefits.";
}

function getSimulationDefaults(city) {
  const defaults = city?.simulation?.default_parameters || {};
  return {
    stop_density_multiplier: Number.isFinite(Number(defaults.stop_density_multiplier)) ? Number(defaults.stop_density_multiplier) : 1.0,
    reduce_nearest_stop_distance_pct: Number.isFinite(Number(defaults.reduce_nearest_stop_distance_pct)) ? Number(defaults.reduce_nearest_stop_distance_pct) : 0.0,
    add_facilities: Number.isFinite(Number(defaults.add_facilities)) ? Number(defaults.add_facilities) : 0
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
        const placementTarget = item?.placement_target === "facility_locations" ? "facility_locations" : "transport_stop_locations";
        return {
          id,
          label: String(item?.label || id.replace(/_/g, " ")),
          backendInterventionType: backendInterventionType || "transport_stop",
          placementTarget,
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
  if (!stop) return "";
  if (stop.stop_name) return stop.stop_name;
  if (Number.isFinite(stop.cluster_id)) return `Stop cluster ${stop.cluster_id}`;
  return "Nearby transport stop";
}

function friendlyAreaStatus(district) {
  if (!district) return "Area context will appear after a map location is selected.";
  if (district.accessibilityScore < 0.45 || district.underserved) return "This area appears underserved and may merit priority attention.";
  if (district.accessibilityScore < 0.65) return "This area has moderate access and may benefit from targeted support.";
  return "This area is relatively well served; review whether investment should target lower-access areas.";
}

function buildPayload({ selectedIntervention, placement, mode, advancedSettings, cityDefaults }) {
  if (!selectedIntervention || !placement) return null;
  const payload = {
    ...cityDefaults,
    ...selectedIntervention.scenarioPatch,
    ...(mode === "advanced" ? advancedSettings : {}),
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

function toneClass(tone) {
  if (tone === "good") return "text-[#0F6E56]";
  if (tone === "watch") return "text-[#B45309]";
  return "text-slate-600";
}

function DeltaValue({ delta, options }) {
  const formatted = formatMeaningfulDelta(delta, options);
  return <span className={`font-semibold ${toneClass(formatted.tone)}`}>{formatted.text}</span>;
}

export default function Simulate({
  city,
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
  const { isRtl } = useI18n();
  const [mode, setMode] = useState("basic");
  const [interventionType, setInterventionType] = useState("");
  const [placement, setPlacement] = useState(null);
  const [showInfluenceZone, setShowInfluenceZone] = useState(true);
  const [showBaselineStops, setShowBaselineStops] = useState(true);
  const [showBaselineFacilities, setShowBaselineFacilities] = useState(false);
  const [mapLayer, setMapLayer] = useState("baseline");
  const [advancedSettings, setAdvancedSettings] = useState(NEUTRAL_ADVANCED);
  const [lastRunSignature, setLastRunSignature] = useState("");

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
    setShowBaselineFacilities(false);
    setMapLayer("baseline");
    setAdvancedSettings(citySimulationDefaults);
    setLastRunSignature("");
  }, [cityKey, citySimulationDefaults]);

  useEffect(() => {
    if (!simulatedFacilities.length) setMapLayer("baseline");
  }, [simulatedFacilities.length]);

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
      const distance = haversineMeters(placement.latitude, placement.longitude, row.latitude, row.longitude);
      if (distance < nearestDistance) {
        nearest = row;
        nearestDistance = distance;
      }
    });
    return nearest ? { ...nearest, markerDistanceM: nearestDistance } : null;
  }, [baselineFacilities, placement]);

  const nearbyDistricts = useMemo(() => {
    if (!placement || !baselineFacilities.length) return [];
    return baselineFacilities
      .map((row) => ({
        ...row,
        distanceM: haversineMeters(placement.latitude, placement.longitude, row.latitude, row.longitude)
      }))
      .filter((row) => row.distanceM <= 10_000)
      .sort((a, b) => a.distanceM - b.distanceM)
      .slice(0, 5);
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

  const simulationSummary = simulationResult?.summary || null;
  const simulationDistrictRows = useMemo(() => (Array.isArray(simulationResult?.districts) ? simulationResult.districts : []), [simulationResult]);

  const districtImpacts = useMemo(() => {
    if (simulationDistrictRows.length) {
      return simulationDistrictRows
        .map((row, index) => ({
          id: String(row.district_name ?? index),
          districtName: String(row.district_name ?? `District ${index + 1}`),
          delta: Number(row.score_delta || 0) / 100,
          population: Number(row.pop_improved || 0),
          originsImproved: Number(row.origins_improved || 0)
        }))
        .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    }
    if (!simulatedFacilities.length) return [];
    const simulatedById = new Map(simulatedFacilities.map((row) => [row.id, row]));
    return baselineFacilities
      .map((row) => {
        const simulated = simulatedById.get(row.id);
        if (!simulated) return null;
        return {
          id: row.id,
          districtName: row.districtName,
          delta: simulated.accessibilityScore - row.accessibilityScore,
          population: Number(row.population) || 0,
          originsImproved: simulated.accessibilityScore > row.accessibilityScore ? 1 : 0
        };
      })
      .filter(Boolean)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  }, [baselineFacilities, simulatedFacilities, simulationDistrictRows]);

  const impactedDistrictIds = useMemo(() => districtImpacts.filter((row) => Math.abs(row.delta) >= 0.005).map((row) => row.id), [districtImpacts]);
  const impactedOriginIds = useMemo(() => {
    const explicit = Array.isArray(simulationResult?.impacted_origin_ids) ? simulationResult.impacted_origin_ids : [];
    if (explicit.length) return explicit.map((id) => String(id));
    return impactedDistrictIds.map((id) => String(id));
  }, [simulationResult, impactedDistrictIds]);

  const scenarioAddedFacilities = useMemo(
    () =>
      (Array.isArray(simulationResult?.added_facilities) ? simulationResult.added_facilities : []).filter(
        (row) => Number.isFinite(Number(row.latitude)) && Number.isFinite(Number(row.longitude))
      ),
    [simulationResult]
  );

  const scenarioAddedStops = useMemo(
    () =>
      (Array.isArray(simulationResult?.added_transport_stops) ? simulationResult.added_transport_stops : []).filter(
        (row) => Number.isFinite(Number(row.latitude)) && Number.isFinite(Number(row.longitude))
      ),
    [simulationResult]
  );

  const baselineAvgAccessibility = useMemo(
    () =>
      Number.isFinite(Number(simulationSummary?.city_before_avg_score))
        ? scorePercentToRatio(simulationSummary.city_before_avg_score)
        : average(baselineFacilities, (row) => row.accessibilityScore),
    [baselineFacilities, simulationSummary]
  );
  const simulatedAvgAccessibility = useMemo(
    () =>
      Number.isFinite(Number(simulationSummary?.city_after_avg_score))
        ? scorePercentToRatio(simulationSummary.city_after_avg_score)
        : average(simulatedFacilities, (row) => row.accessibilityScore),
    [simulatedFacilities, simulationSummary]
  );
  const baselineAvgTravel = useMemo(
    () =>
      Number.isFinite(Number(simulationSummary?.city_before_avg_tt))
        ? Number(simulationSummary.city_before_avg_tt)
        : average(baselineFacilities, (row) => row.travelTimeMin),
    [baselineFacilities, simulationSummary]
  );
  const simulatedAvgTravel = useMemo(
    () =>
      Number.isFinite(Number(simulationSummary?.city_after_avg_tt))
        ? Number(simulationSummary.city_after_avg_tt)
        : average(simulatedFacilities, (row) => row.travelTimeMin),
    [simulatedFacilities, simulationSummary]
  );

  const comparison = comparisonResult?.comparison || null;
  const deltaAccessibility =
    Number.isFinite(Number(simulationSummary?.city_after_avg_score)) && Number.isFinite(Number(simulationSummary?.city_before_avg_score))
      ? scorePercentToRatio(simulationSummary.city_after_avg_score) - scorePercentToRatio(simulationSummary.city_before_avg_score)
      : Number.isFinite(comparison?.delta_accessibility)
      ? comparison.delta_accessibility
      : simulatedAvgAccessibility - baselineAvgAccessibility;
  const deltaTravel =
    Number.isFinite(Number(simulationSummary?.city_after_avg_tt)) && Number.isFinite(Number(simulationSummary?.city_before_avg_tt))
      ? Number(simulationSummary.city_after_avg_tt) - Number(simulationSummary.city_before_avg_tt)
      : Number.isFinite(comparison?.delta_travel_time)
      ? comparison.delta_travel_time
      : simulatedAvgTravel - baselineAvgTravel;
  const inequalityChange = Number.isFinite(comparison?.inequality_change) ? comparison.inequality_change : null;
  const districtsImproved = simulationDistrictRows.length
    ? simulationDistrictRows.filter((row) => Number(row.score_delta || 0) > 0).length
    : Number.isFinite(comparisonResult?.districts_improved)
    ? comparisonResult.districts_improved
    : districtImpacts.filter((row) => row.delta > 0.001).length;
  const districtsTotal = simulationDistrictRows.length || (Number.isFinite(comparisonResult?.districts_total) ? comparisonResult.districts_total : baselineFacilities.length);
  const populationAffected = Number.isFinite(Number(simulationSummary?.total_pop_improved))
    ? Number(simulationSummary.total_pop_improved)
    : Number.isFinite(comparisonResult?.population_affected)
    ? comparisonResult.population_affected
    : 0;
  const originsImproved = Number.isFinite(Number(simulationSummary?.total_origins_improved)) ? Number(simulationSummary.total_origins_improved) : null;

  const baselineUnderservedPopulation = useMemo(() => baselineFacilities.reduce((sum, row) => sum + (row.underserved ? Number(row.population) || 0 : 0), 0), [baselineFacilities]);
  const simulatedUnderservedPopulation = useMemo(() => simulatedFacilities.reduce((sum, row) => sum + (row.underserved ? Number(row.population) || 0 : 0), 0), [simulatedFacilities]);
  const underservedPopulationDelta = simulatedUnderservedPopulation - baselineUnderservedPopulation;

  const selectedAreaLabel = selectedDistrict?.districtName || "Selected map location";
  const nearbyPopulationEstimate = nearbyDistricts.length ? nearbyDistricts.reduce((sum, row) => sum + (Number(row.population) || 0), 0) : Number(selectedDistrict?.population) || 0;
  const selectedInterventionLabel = interventionLabel(interventionType, interventionIndex);
  const planningStep = !interventionType ? 1 : !placement ? 2 : !hasResult ? 4 : 5;
  const mapInstruction = !interventionType
    ? "Select an intervention to activate map placement."
    : !placement
    ? "Click the map to place the intervention. Drag the marker to refine it."
    : "Location selected. Review the area context, then evaluate the scenario.";

  const technicalPayload = payload ? JSON.stringify(payload, null, 2) : "Select an intervention and place it on the map to generate the backend scenario payload.";

  const scenarioNarrative = useMemo(() => {
    if (!interventionType) return "Select an intervention and click the map to begin.";
    if (!placement) return `${selectedInterventionLabel} is selected. Click the map where the intervention should be tested.`;
    const stopContext = nearestTransportStop ? ` The closest existing stop is ${friendlyStopLabel(nearestTransportStop)} (${formatDistance(nearestTransportStop.distanceM)} away).` : "";
    return `${selectedInterventionLabel} will be evaluated near ${selectedAreaLabel}.${stopContext}`;
  }, [interventionType, placement, selectedInterventionLabel, selectedAreaLabel, nearestTransportStop]);

  const resultHeadline = useMemo(() => {
    if (!hasResult) return "Scenario impact will appear here after evaluation.";
    if (deltaAccessibility > 0.005) return "The evaluated scenario improves average accessibility across affected origin areas.";
    if (deltaAccessibility < -0.005) return "The evaluated scenario may reduce accessibility for some areas; review the map before using it for planning.";
    return "The evaluated scenario shows limited citywide change; inspect local impacts on the map.";
  }, [deltaAccessibility, hasResult]);

  const runScenario = () => {
    if (!payload || !canRunSimulation || simulationPending) return;
    const label = `${mode === "basic" ? "Guided" : "Advanced"} evaluation: ${selectedInterventionLabel}`;
    onRunSimulation({
      customPayload: payload,
      customLabel: label
    });
    setLastRunSignature(payloadSignature);
    setMapLayer("impact");
  };

  return (
    <section className="space-y-5">
      <article className="overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-[#F8FBF8] via-white to-[#EEF6F2] p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#0F6E56]">Guided intervention workspace</p>
            <h2 className="mt-2 font-heading text-2xl font-bold text-slate-950">Evaluate healthcare access scenarios on the map</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-700">
              Select an intervention, place it geographically, review who may be affected, and compare the modelled before-and-after accessibility impact.
            </p>
          </div>
          <div className="rounded-xl border border-white/80 bg-white/85 px-4 py-3 text-sm text-slate-700 shadow-sm">
            <div className="font-semibold text-slate-900">{city?.name || city?.display_name || "Selected city"}</div>
            <div>{baselineFacilities.length.toLocaleString()} origin areas evaluated</div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-2 md:grid-cols-5">
          {[
            ["1", "Select intervention"],
            ["2", "Place on map"],
            ["3", "Review context"],
            ["4", "Evaluate scenario"],
            ["5", "Compare impact"]
          ].map(([number, label], index) => {
            const active = planningStep >= index + 1;
            return (
              <div key={label} className={`rounded-xl border px-3 py-2 text-sm ${active ? "border-[#0F6E56]/30 bg-white text-slate-950" : "border-slate-200 bg-white/55 text-slate-500"}`}>
                <span className={`mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${active ? "bg-[#0F6E56] text-white" : "bg-slate-200 text-slate-600"}`}>{number}</span>
                {label}
              </div>
            );
          })}
        </div>
      </article>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <article className="min-h-[680px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-200 bg-white px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h3 className="font-heading text-base font-bold text-slate-950">Planning map</h3>
              <p className="text-sm text-slate-600">{mapInstruction}</p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <button type="button" onClick={() => setShowInfluenceZone((prev) => !prev)} className={`rounded-full border px-3 py-1.5 font-semibold ${showInfluenceZone ? "border-[#0F6E56] bg-[#0F6E56]/10 text-[#0F6E56]" : "border-slate-300 text-slate-600"}`}>
                Planning radius
              </button>
              <button type="button" onClick={() => setShowBaselineStops((prev) => !prev)} className={`rounded-full border px-3 py-1.5 font-semibold ${showBaselineStops ? "border-[#2563EB] bg-blue-50 text-blue-700" : "border-slate-300 text-slate-600"}`}>
                Existing stops
              </button>
              <button type="button" onClick={() => setShowBaselineFacilities((prev) => !prev)} className={`rounded-full border px-3 py-1.5 font-semibold ${showBaselineFacilities ? "border-slate-500 bg-slate-100 text-slate-800" : "border-slate-300 text-slate-600"}`}>
                Existing facilities
              </button>
            </div>
          </div>

          <div className="h-[620px]">
            <SimulationWorkspaceMap
              city={city}
              baselineFacilities={baselineFacilities}
              simulatedFacilities={simulatedFacilities}
              transportStops={transportStops}
              baselineSupplyFacilities={baselineSupplyFacilities}
              scenarioAddedFacilities={scenarioAddedFacilities}
              scenarioAddedStops={scenarioAddedStops}
              interventionType={interventionType}
              placement={placement}
              onPlacementChange={setPlacement}
              selectedDistrictId={selectedDistrict?.id || null}
              impactedDistrictIds={impactedOriginIds}
              mapLayer={mapLayer}
              onMapLayerChange={setMapLayer}
              showBaselineStops={showBaselineStops}
              showBaselineFacilities={showBaselineFacilities}
              showInfluenceZone={showInfluenceZone}
              isLoading={isLoading || simulationPending}
              loadingLabel={simulationPending ? "Computing scenario impact..." : "Loading map data..."}
              interactionHint={mapInstruction}
              selectedInterventionLabel={selectedInterventionLabel}
            />
          </div>
        </article>

        <aside className="space-y-4">
          <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Step 1</p>
                <h3 className="font-heading text-base font-bold text-slate-950">Select intervention</h3>
              </div>
              <span className="rounded-full bg-[#0F6E56]/10 px-3 py-1 text-xs font-semibold text-[#0F6E56]">Guided mode</span>
            </div>
            <div className="mt-3 space-y-2">
              {interventionOptions.map((option) => {
                const selected = interventionType === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setInterventionType(option.id)}
                    className={`w-full rounded-xl border p-3 text-left transition ${
                      selected ? "border-[#0F6E56] bg-[#F0F8F4] shadow-sm" : "border-slate-200 bg-white hover:border-[#0F6E56]/40 hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-bold text-slate-950">{option.label}</div>
                        <div className="mt-1 text-xs leading-5 text-slate-600">{interventionDescription(option)}</div>
                      </div>
                      <span className={`mt-0.5 h-3 w-3 rounded-full border ${selected ? "border-[#0F6E56] bg-[#0F6E56]" : "border-slate-300"}`} />
                    </div>
                  </button>
                );
              })}
              {!interventionOptions.length ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">No interventions are configured for this city.</div> : null}
            </div>
          </article>

          <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Steps 2-3</p>
            <h3 className="mt-1 font-heading text-base font-bold text-slate-950">Placement and area context</h3>
            {!interventionType ? (
              <div className="mt-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm leading-6 text-slate-600">
                Select an intervention first. The map will then become the main input for placing the scenario.
              </div>
            ) : !placement ? (
              <div className="mt-3 rounded-xl border border-dashed border-[#0F6E56]/40 bg-[#F5FBF8] p-4 text-sm leading-6 text-slate-700">
                {selectedInterventionLabel} is ready. Click on the map to choose the location to evaluate.
              </div>
            ) : (
              <div className="mt-3 space-y-3">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Selected area</div>
                  <div className="mt-1 font-bold text-slate-950">{selectedAreaLabel}</div>
                  <div className="mt-1 text-xs leading-5 text-slate-600">{friendlyAreaStatus(selectedDistrict)}</div>
                  <button type="button" onClick={() => setPlacement(null)} className="mt-3 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                    Clear map location
                  </button>
                </div>
                <div className="grid grid-cols-1 gap-2">
                  <div className="rounded-xl border border-slate-200 bg-white p-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Estimated nearby population served</div>
                    <div className="mt-1 text-lg font-bold text-slate-950">{nearbyPopulationEstimate > 0 ? formatCount(nearbyPopulationEstimate) : "Population not available"}</div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white p-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Closest existing stop</div>
                    <div className="mt-1 font-bold text-slate-950">{nearestTransportStop ? friendlyStopLabel(nearestTransportStop) : "No stop context available"}</div>
                    {nearestTransportStop ? <div className="mt-1 text-xs text-slate-600">{formatDistance(nearestTransportStop.distanceM)} from selected location</div> : null}
                  </div>
                </div>
              </div>
            )}
          </article>

          <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Step 4</p>
                <h3 className="mt-1 font-heading text-base font-bold text-slate-950">Review and evaluate</h3>
              </div>
              <button type="button" onClick={() => setMode((prev) => (prev === "advanced" ? "basic" : "advanced"))} className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                {mode === "advanced" ? "Hide advanced" : "Advanced"}
              </button>
            </div>
            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm leading-6 text-slate-700">{scenarioNarrative}</div>

            {mode === "advanced" ? (
              <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Optional technical tuning</div>
                <div className="mt-3 space-y-4 text-sm text-slate-700">
                  <label className="block">
                    <div className="flex items-center justify-between">
                      <span>Transport stop density multiplier</span>
                      <span className="font-semibold">{advancedSettings.stop_density_multiplier.toFixed(2)}x</span>
                    </div>
                    <input type="range" min={1} max={3} step={0.05} value={advancedSettings.stop_density_multiplier} onChange={(event) => setAdvancedSettings((prev) => ({ ...prev, stop_density_multiplier: Number(event.target.value) }))} className="mt-2 w-full accent-[#0F6E56]" />
                  </label>
                  <label className="block">
                    <div className="flex items-center justify-between">
                      <span>Nearest-stop distance reduction</span>
                      <span className="font-semibold">{(advancedSettings.reduce_nearest_stop_distance_pct * 100).toFixed(0)}%</span>
                    </div>
                    <input type="range" min={0} max={0.5} step={0.01} value={advancedSettings.reduce_nearest_stop_distance_pct} onChange={(event) => setAdvancedSettings((prev) => ({ ...prev, reduce_nearest_stop_distance_pct: Number(event.target.value) }))} className="mt-2 w-full accent-[#0F6E56]" />
                  </label>
                  <label className="block">
                    <div className="flex items-center justify-between">
                      <span>Additional auto-placed facilities</span>
                      <span className="font-semibold">{advancedSettings.add_facilities}</span>
                    </div>
                    <input type="range" min={0} max={10} step={1} value={advancedSettings.add_facilities} onChange={(event) => setAdvancedSettings((prev) => ({ ...prev, add_facilities: Number(event.target.value) }))} className="mt-2 w-full accent-[#0F6E56]" />
                  </label>
                </div>
                <details className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <summary className="cursor-pointer text-xs font-semibold text-slate-700">Backend scenario payload</summary>
                  <pre className={`mt-2 max-h-56 overflow-auto whitespace-pre-wrap text-[11px] text-slate-600 ${isRtl ? "text-right" : "text-left"}`}>{technicalPayload}</pre>
                </details>
              </div>
            ) : null}

            {resultsOutdated ? <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">The scenario changed after the last evaluation. Evaluate again to refresh the results.</div> : null}

            <div className="mt-4 grid grid-cols-1 gap-2">
              <button type="button" onClick={runScenario} disabled={!canRunSimulation || simulationPending} className="rounded-xl bg-[#0F6E56] px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-[#0B5B47] disabled:cursor-not-allowed disabled:opacity-55">
                {simulationPending ? "Computing scenario..." : "Evaluate scenario"}
              </button>
              {hasResult ? (
                <button
                  type="button"
                  onClick={() => {
                    onResetSimulation();
                    setLastRunSignature("");
                  }}
                  className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Reset to baseline
                </button>
              ) : null}
            </div>
          </article>
        </aside>
      </div>

      <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Step 5</p>
            <h3 className="mt-1 font-heading text-xl font-bold text-slate-950">Planning impact</h3>
            <p className="mt-1 text-sm text-slate-600">{resultHeadline}</p>
          </div>
          {activeSimulationLabel ? <div className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700">Latest: {activeSimulationLabel}</div> : null}
        </div>

        {hasResult ? (
          <>
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Average accessibility</div>
                <div className="mt-2 text-lg font-bold text-slate-950">{formatPercent(baselineAvgAccessibility)} to {formatPercent(simulatedAvgAccessibility)}</div>
                <div className="mt-1 text-sm"><DeltaValue delta={deltaAccessibility} options={{ multiplier: 100, decimals: 2, unit: " pp", epsilon: 0.01 }} /></div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Average travel time</div>
                <div className="mt-2 text-lg font-bold text-slate-950">{formatMinutes(baselineAvgTravel)} to {formatMinutes(simulatedAvgTravel)}</div>
                <div className="mt-1 text-sm"><DeltaValue delta={deltaTravel} options={{ decimals: 2, unit: " min", epsilon: 0.05, positiveIsGood: false }} /></div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Estimated population positively affected</div>
                <div className="mt-2 text-lg font-bold text-slate-950">{Math.abs(populationAffected) < 1 ? "No meaningful change" : formatCount(populationAffected)}</div>
                <div className="mt-1 text-sm text-slate-600">{Number.isFinite(originsImproved) ? `${formatCount(originsImproved)} origin areas improved` : "Origin count unavailable"}</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Service areas improved</div>
                <div className="mt-2 text-lg font-bold text-slate-950">{districtsImproved} of {districtsTotal}</div>
                <div className="mt-1 text-sm text-slate-600">{inequalityChange === null ? "Equity change unavailable" : <DeltaValue delta={inequalityChange} options={{ decimals: 3, unit: " Gini", epsilon: 0.001 }} />}</div>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1fr]">
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <h4 className="font-heading text-base font-bold text-slate-950">Planner interpretation</h4>
                <p className="mt-2 text-sm leading-6 text-slate-700">
                  {deltaAccessibility > 0.005
                    ? "This scenario produces a positive accessibility signal. Use the impact map to check whether benefits align with underserved areas before prioritizing investment."
                    : "This scenario produces limited average change. It may still be useful locally, but it should be compared against alternative locations or intervention types."}
                </p>
                <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                  Underserved population: {formatCount(baselineUnderservedPopulation)} to {formatCount(simulatedUnderservedPopulation)}.{" "}
                  <DeltaValue delta={underservedPopulationDelta} options={{ decimals: 0, unit: " residents", epsilon: 1, positiveIsGood: false }} />
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <h4 className="font-heading text-base font-bold text-slate-950">Most affected origin areas</h4>
                {districtImpacts.some((row) => Math.abs(row.delta) >= 0.005) ? (
                  <div className="mt-3 space-y-2">
                    {districtImpacts.slice(0, 5).map((row) => (
                      <div key={row.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                        <span className="font-semibold text-slate-900">{row.districtName}</span>
                        <DeltaValue delta={row.delta} options={{ multiplier: 100, decimals: 2, unit: " pp", epsilon: 0.01 }} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">No origin area crossed the meaningful-change threshold for this scenario.</div>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm leading-6 text-slate-600">
            Scenario impact will appear after evaluation, including accessibility change, travel-time change, affected population, and impacted origin areas.
          </div>
        )}
      </article>

      {simulationResult?.error ? <article className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{simulationResult.error}</article> : null}
    </section>
  );
}
