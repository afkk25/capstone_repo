import { useEffect, useMemo, useState } from "react";
import SimulationWorkspaceMap from "../components/simulation/SimulationWorkspaceMap";
import { useI18n } from "../i18n/I18nProvider";

const NEUTRAL_ADVANCED = {
  stop_density_multiplier: 1.0,
  reduce_nearest_stop_distance_pct: 0.0,
  add_facilities: 0
};

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
  if (!Number.isFinite(value)) return "Not available";
  return `${(value * 100).toFixed(1)}%`;
}

function scorePercentToRatio(value) {
  if (!Number.isFinite(Number(value))) return NaN;
  return Math.max(0, Math.min(1, Number(value) / 100));
}

function formatMinutes(value) {
  if (!Number.isFinite(value)) return "Not available";
  return `${value.toFixed(1)} min`;
}

function formatCount(value) {
  if (!Number.isFinite(value)) return "Not available";
  return Math.round(value).toLocaleString();
}

function formatDistance(value) {
  if (!Number.isFinite(value)) return "Not available";
  if (value < 1000) return `${Math.round(value)} m`;
  return `${(value / 1000).toFixed(value < 5000 ? 1 : 0)} km`;
}

function formatMeaningfulDelta(value, { multiplier = 1, decimals = 1, unit = "", epsilon = 0.0005 } = {}) {
  if (!Number.isFinite(value)) return "Not available";
  const scaled = value * multiplier;
  if (Math.abs(scaled) < epsilon) return "No meaningful change detected";
  const sign = scaled > 0 ? "+" : "";
  return `${sign}${scaled.toFixed(decimals)}${unit}`;
}

function interventionLabel(interventionType) {
  if (interventionType === "add_transport_stop") return "Add a transport stop";
  if (interventionType === "add_healthcare_facility") return "Add a healthcare facility";
  if (interventionType === "improve_service") return "Improve stop access";
  return "Not selected yet";
}

function toBackendInterventionType(interventionType) {
  if (interventionType === "add_healthcare_facility") return "healthcare_facility";
  if (interventionType === "add_transport_stop" || interventionType === "improve_service") return "transport_stop";
  return "";
}

function friendlyStopLabel(stop) {
  if (!stop) return "Not available yet";
  if (stop.stop_name) return stop.stop_name;
  if (Number.isFinite(stop.cluster_id)) return `Stop cluster ${stop.cluster_id}`;
  return "Nearby transport stop";
}

function friendlyAreaStatus(district) {
  if (!district) return "Place a marker to identify the nearest service area.";
  if (district.accessibilityScore < 0.45 || district.underserved) return "This area appears underserved.";
  if (district.accessibilityScore < 0.65) return "This area may benefit from targeted support.";
  return "This area is already moderately served.";
}

function buildPayload({ interventionType, placement }) {
  const normalizedType = toBackendInterventionType(interventionType);
  if (!normalizedType || !placement) return null;
  return {
    intervention_type: normalizedType,
    latitude: Number(placement.latitude.toFixed(6)),
    longitude: Number(placement.longitude.toFixed(6))
  };
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
  const [showBaselineStops, setShowBaselineStops] = useState(false);
  const [showBaselineFacilities, setShowBaselineFacilities] = useState(false);
  const [mapLayer, setMapLayer] = useState("baseline");
  const [advancedSettings, setAdvancedSettings] = useState(NEUTRAL_ADVANCED);
  const [lastRunSignature, setLastRunSignature] = useState("");

  const cityKey = city?.id || city?.city_id || "";

  useEffect(() => {
    setMode("basic");
    setInterventionType("");
    setPlacement(null);
    setShowInfluenceZone(true);
    setShowBaselineStops(false);
    setShowBaselineFacilities(false);
    setMapLayer("baseline");
    setAdvancedSettings(NEUTRAL_ADVANCED);
    setLastRunSignature("");
  }, [cityKey]);

  const payload = useMemo(
    () =>
      buildPayload({
        interventionType,
        placement
      }),
    [interventionType, placement]
  );

  const payloadSignature = useMemo(() => (payload ? JSON.stringify(payload) : ""), [payload]);

  const requiresPlacement = Boolean(interventionType);
  const canRunSimulation = Boolean(payload && interventionType && placement);
  const resultsOutdated = Boolean(hasResult && lastRunSignature && payloadSignature && payloadSignature !== lastRunSignature);

  useEffect(() => {
    if (!simulatedFacilities.length) {
      setMapLayer("baseline");
    }
  }, [simulatedFacilities.length]);

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
      .slice(0, 3);
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
  const simulationDistrictRows = useMemo(
    () => (Array.isArray(simulationResult?.districts) ? simulationResult.districts : []),
    [simulationResult]
  );

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
        const delta = simulated.accessibilityScore - row.accessibilityScore;
        return {
          id: row.id,
          districtName: row.districtName,
          delta,
          population: row.population
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
  const baselineAvgTravel = useMemo(
    () =>
      Number.isFinite(Number(simulationSummary?.city_before_avg_tt))
        ? Number(simulationSummary.city_before_avg_tt)
        : average(baselineFacilities, (row) => row.travelTimeMin),
    [baselineFacilities, simulationSummary]
  );
  const simulatedAvgAccessibility = useMemo(
    () =>
      Number.isFinite(Number(simulationSummary?.city_after_avg_score))
        ? scorePercentToRatio(simulationSummary.city_after_avg_score)
        : average(simulatedFacilities, (row) => row.accessibilityScore),
    [simulatedFacilities, simulationSummary]
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
  const baselineUnderservedPopulation = useMemo(
    () => baselineFacilities.reduce((sum, row) => sum + (row.underserved ? Number(row.population) || 0 : 0), 0),
    [baselineFacilities]
  );
  const simulatedUnderservedPopulation = useMemo(
    () => simulatedFacilities.reduce((sum, row) => sum + (row.underserved ? Number(row.population) || 0 : 0), 0),
    [simulatedFacilities]
  );
  const underservedPopulationDelta = simulatedUnderservedPopulation - baselineUnderservedPopulation;

  const selectedAreaLabel = selectedDistrict?.districtName || (placement ? "Selected location" : "Place a marker on the map");
  const selectedAreaPopulation = selectedDistrict?.population ? formatCount(selectedDistrict.population) : "Not available yet";
  const nearbyPopulationEstimate = nearbyDistricts.length
    ? formatCount(nearbyDistricts.reduce((sum, row) => sum + (Number(row.population) || 0), 0))
    : selectedDistrict?.population
      ? formatCount(selectedDistrict.population)
      : "Not available yet";

  const preRunSummary = useMemo(() => {
    if (!interventionType) return "Choose an intervention to see a plain-language planning summary.";
    if (requiresPlacement && !placement) return "Place a marker on the map to review the selected area and nearby services.";
    if (!selectedDistrict && !placement) return "This scenario will use citywide assumptions until a location is chosen.";
    if (!selectedDistrict) return "The marker is ready. Review the summary below before running the scenario.";
    return `${selectedDistrict.districtName} is the nearest service area. ${friendlyAreaStatus(selectedDistrict)}`;
  }, [interventionType, placement, requiresPlacement, selectedDistrict]);

  const summaryCards = useMemo(() => {
    const cards = [
      {
        label: "Selected location",
        value: placement ? "Marker placed on the map" : "Place a marker on the map",
        helper: selectedDistrict ? `Nearest service area: ${selectedAreaLabel}.` : "The map is the primary input for this scenario."
      },
      {
        label: "Nearest service area",
        value: selectedAreaLabel,
        helper: selectedDistrict ? friendlyAreaStatus(selectedDistrict) : "Will be identified after a marker is placed."
      },
      {
        label: "Nearby population",
        value: nearbyPopulationEstimate,
        helper: placement && nearbyDistricts.length ? nearbyDistricts.map((row) => row.districtName).join(", ") : "Estimated from nearby districts."
      },
      {
        label: "Nearest transport stop",
        value: nearestTransportStop ? `${friendlyStopLabel(nearestTransportStop)} · ${formatDistance(nearestTransportStop.distanceM)}` : "Not available yet",
        helper: nearestTransportStop ? "Useful for checking how close the current network already is." : "Add a marker to identify the closest stop."
      },
      {
        label: "Intervention type",
        value: interventionLabel(interventionType),
        helper: mode === "basic" ? "Guided planning mode keeps the setup simple." : "Advanced mode lets technical users fine-tune assumptions."
      }
    ];
    if (hasResult && Number.isFinite(originsImproved)) {
      cards.push({
        label: "Improved origins",
        value: formatCount(originsImproved),
        helper: "Origin points where travel time improved after this intervention."
      });
    }
    if (hasResult && Number.isFinite(populationAffected)) {
      cards.push({
        label: "Population improved",
        value: Math.abs(populationAffected) < 1 ? "No meaningful change detected" : formatCount(populationAffected),
        helper: "Residents located in origins with improved travel time."
      });
    }
    return cards;
  }, [hasResult, interventionType, mode, nearestTransportStop, nearbyDistricts, nearbyPopulationEstimate, placement, populationAffected, selectedAreaLabel, selectedDistrict, originsImproved]);

  const resultHeadline = useMemo(() => {
    if (!hasResult) return "Run a simulation to compare before and after planning outcomes.";
    const meaningfulAccessibility = Math.abs(deltaAccessibility) >= 0.005;
    const meaningfulTravel = Math.abs(deltaTravel) >= 0.05;
    const meaningfulEquity = inequalityChange !== null && Math.abs(inequalityChange) >= 0.001;
    if (!meaningfulAccessibility && !meaningfulTravel && !meaningfulEquity) return "Minimal impact under the current scenario.";
    const positiveSignals = [];
    if (deltaAccessibility > 0.005) positiveSignals.push("accessibility improved");
    if (deltaTravel < -0.05) positiveSignals.push("travel time fell");
    if (inequalityChange !== null && inequalityChange < -0.001) positiveSignals.push("equity improved");
    if (positiveSignals.length) return `This scenario suggests ${positiveSignals.join(" and ")}.`;
    return "The scenario changes are mixed or small, so this is best treated as a light-touch intervention.";
  }, [deltaAccessibility, deltaTravel, hasResult, inequalityChange]);

  const technicalPayload = useMemo(() => (payload ? JSON.stringify(payload, null, 2) : "No scenario configured."), [payload]);

  const runScenario = () => {
    if (!payload || !canRunSimulation || simulationPending) return;
    const label = `${mode === "basic" ? "Guided" : "Advanced"} mode · ${interventionLabel(interventionType)}`;
    onRunSimulation({
      customPayload: payload,
      customLabel: label
    });
    setLastRunSignature(payloadSignature);
    setMapLayer("impact");
  };

  return (
    <section className="space-y-4">
      <article className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="font-heading text-[18px] font-bold text-gray-900">Simulation workspace</h2>
        <p className="mt-1 max-w-3xl text-[14px] text-gray-700">Plan a scenario directly on the map, review the likely planning impact, and switch to advanced tuning only when you need tighter control.</p>
      </article>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[340px_1fr]">
        <aside className="space-y-4">
          <article className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <h3 className="font-heading text-[15px] font-bold text-gray-900">1. Choose mode</h3>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setMode("basic")} className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${mode === "basic" ? "border-[#0F6E56] bg-[#0F6E56]/10 text-[#0F6E56]" : "border-gray-300 text-gray-700 hover:bg-gray-50"}`}>
                Basic mode
              </button>
              <button type="button" onClick={() => setMode("advanced")} className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${mode === "advanced" ? "border-slate-400 bg-slate-50 text-slate-800" : "border-gray-300 text-gray-700 hover:bg-gray-50"}`}>
                Advanced mode
              </button>
            </div>
            <p className="mt-2 text-[12px] text-gray-600">
              {mode === "basic"
                ? "Basic mode keeps the page focused on the map and plain-language planning cues."
                : "Advanced mode remains available for technical review, but it stays secondary to the map-based workflow."}
            </p>
          </article>

          <article className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <h3 className="font-heading text-[15px] font-bold text-gray-900">2. Choose a planning action</h3>
            <div className="mt-3 space-y-2 text-sm">
              {[
                { id: "add_transport_stop", label: "Add a transport stop" },
                { id: "add_healthcare_facility", label: "Add a healthcare facility" },
                { id: "improve_service", label: "Improve stop access" }
              ].map((option) => (
                <label key={option.id} className="flex cursor-pointer items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 hover:bg-gray-50">
                  <input type="radio" name="intervention-type" checked={interventionType === option.id} onChange={() => setInterventionType(option.id)} />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
          </article>

          <article className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <h3 className="font-heading text-[15px] font-bold text-gray-900">3. Place and review</h3>
            <div className="mt-2 space-y-2 text-[13px] text-gray-700">
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                <div className="text-[11px] uppercase tracking-wide text-gray-500">Planning action</div>
                <div className="mt-1 font-semibold text-gray-900">{interventionLabel(interventionType)}</div>
              </div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                <div className="text-[11px] uppercase tracking-wide text-gray-500">Selected location</div>
                <div className="mt-1 font-semibold text-gray-900">{placement ? selectedAreaLabel : "Not selected yet"}</div>
                {selectedDistrict ? <div className="mt-1 text-xs text-gray-600">Nearest service area: {friendlyAreaStatus(selectedDistrict)}</div> : null}
                {placement ? (
                  <button type="button" onClick={() => setPlacement(null)} className="mt-2 rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-white">
                    Clear placement
                  </button>
                ) : null}
              </div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                <div className="text-[11px] uppercase tracking-wide text-gray-500">Planning summary</div>
                <div className="mt-1 text-[13px] text-gray-800">{preRunSummary}</div>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <div className="text-[11px] uppercase tracking-wide text-gray-500">Nearby population</div>
                  <div className="mt-1 font-semibold text-gray-900">{selectedDistrict ? selectedAreaPopulation : nearbyPopulationEstimate}</div>
                </div>
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <div className="text-[11px] uppercase tracking-wide text-gray-500">Closest stop</div>
                  <div className="mt-1 font-semibold text-gray-900">{nearestTransportStop ? friendlyStopLabel(nearestTransportStop) : "Not available yet"}</div>
                  {nearestTransportStop ? <div className="mt-1 text-xs text-gray-600">{formatDistance(nearestTransportStop.distanceM)} away</div> : null}
                </div>
              </div>
            </div>
          </article>

          {mode === "advanced" ? (
            <article className="rounded-xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
              <h3 className="font-heading text-[15px] font-bold text-slate-900">Advanced parameters</h3>
              <p className="mt-1 text-[12px] text-slate-600">Optional technical controls for policy users and reviewers.</p>
              <div className="mt-3 space-y-4 text-[13px] text-slate-700">
                <label className="block">
                  <div className="flex items-center justify-between">
                    <span>Suggested stop density</span>
                    <span className="font-semibold">{advancedSettings.stop_density_multiplier.toFixed(2)}x</span>
                  </div>
                  <input type="range" min={1} max={3} step={0.05} value={advancedSettings.stop_density_multiplier} onChange={(event) => setAdvancedSettings((prev) => ({ ...prev, stop_density_multiplier: Number(event.target.value) }))} className="mt-2 w-full accent-[#0F6E56]" />
                </label>
                <label className="block">
                  <div className="flex items-center justify-between">
                    <span>Improve stop access</span>
                    <span className="font-semibold">{(advancedSettings.reduce_nearest_stop_distance_pct * 100).toFixed(0)}%</span>
                  </div>
                  <input type="range" min={0} max={0.5} step={0.01} value={advancedSettings.reduce_nearest_stop_distance_pct} onChange={(event) => setAdvancedSettings((prev) => ({ ...prev, reduce_nearest_stop_distance_pct: Number(event.target.value) }))} className="mt-2 w-full accent-[#0F6E56]" />
                </label>
                <label className="block">
                  <div className="flex items-center justify-between">
                    <span>Suggested facility additions</span>
                    <span className="font-semibold">{advancedSettings.add_facilities}</span>
                  </div>
                  <input type="range" min={0} max={10} step={1} value={advancedSettings.add_facilities} onChange={(event) => setAdvancedSettings((prev) => ({ ...prev, add_facilities: Number(event.target.value) }))} className="mt-2 w-full accent-[#0F6E56]" />
                </label>
              </div>
            </article>
          ) : null}

          <article className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <h3 className="font-heading text-[15px] font-bold text-gray-900">4. Run the scenario</h3>
            {resultsOutdated ? <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">The scenario was updated after the last run. Run it again to refresh the results.</div> : null}
            <div className="mt-3 space-y-2 text-[13px]">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={showInfluenceZone} onChange={(event) => setShowInfluenceZone(event.target.checked)} />
                Show planning radius
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={showBaselineStops} onChange={(event) => setShowBaselineStops(event.target.checked)} />
                Show existing transport stops
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={showBaselineFacilities} onChange={(event) => setShowBaselineFacilities(event.target.checked)} />
                Show existing healthcare facilities
              </label>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-2">
              <button type="button" onClick={runScenario} disabled={!canRunSimulation || simulationPending} className="rounded-lg bg-[#0F6E56] px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60">
                {simulationPending ? "Running simulation..." : "Run simulation"}
              </button>
              {hasResult ? (
                <button
                  type="button"
                  onClick={() => {
                    onResetSimulation();
                    setLastRunSignature("");
                  }}
                  className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
                >
                  Reset to baseline
                </button>
              ) : null}
            </div>
          </article>
        </aside>

        <article className="min-h-[600px]">
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
            isLoading={isLoading}
          />
        </article>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <article className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h3 className="font-heading text-[16px] font-bold text-gray-900">Scenario summary</h3>
          <p className="mt-1 text-[13px] text-gray-600">{activeSimulationLabel ? `Most recent run: ${activeSimulationLabel}` : "No scenario has been run yet."}</p>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {summaryCards.map((card) => (
              <div key={card.label} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                <div className="text-[11px] uppercase tracking-wide text-gray-500">{card.label}</div>
                <div className="mt-1 font-semibold text-gray-900">{card.value}</div>
                <div className="mt-1 text-xs text-gray-600">{card.helper}</div>
              </div>
            ))}
          </div>
          {mode === "advanced" ? (
            <details className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <summary className="cursor-pointer text-sm font-semibold text-slate-700">Technical details</summary>
              <p className="mt-1 text-xs text-slate-600">Shown only in Advanced mode for technical review.</p>
              <div className={`mt-2 overflow-x-auto rounded border border-slate-200 bg-white p-2 text-[11px] text-slate-700 ${isRtl ? "text-right" : "text-left"}`}>
                <pre className="whitespace-pre-wrap">{technicalPayload}</pre>
              </div>
            </details>
          ) : null}
        </article>

        <article className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h3 className="font-heading text-[16px] font-bold text-gray-900">Before vs after results</h3>
          <p className="mt-1 text-[13px] text-gray-600">{resultHeadline}</p>
          {hasResult ? (
            <>
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <div className="text-[11px] uppercase tracking-wide text-gray-500">Average accessibility</div>
                  <div className="mt-1 text-[13px] font-semibold text-gray-900">{formatPercent(baselineAvgAccessibility)} → {formatPercent(simulatedAvgAccessibility)}</div>
                  <div className="mt-1 text-xs text-gray-600">{formatMeaningfulDelta(deltaAccessibility, { multiplier: 100, decimals: 2, unit: " pp", epsilon: 0.01 })}</div>
                </div>
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <div className="text-[11px] uppercase tracking-wide text-gray-500">Average travel time</div>
                  <div className="mt-1 text-[13px] font-semibold text-gray-900">{formatMinutes(baselineAvgTravel)} → {formatMinutes(simulatedAvgTravel)}</div>
                  <div className="mt-1 text-xs text-gray-600">{formatMeaningfulDelta(deltaTravel, { multiplier: 1, decimals: 2, unit: " min", epsilon: 0.05 })}</div>
                </div>
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <div className="text-[11px] uppercase tracking-wide text-gray-500">Service areas improved</div>
                  <div className="mt-1 text-[13px] font-semibold text-gray-900">{districtsImproved} of {districtsTotal}</div>
                </div>
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <div className="text-[11px] uppercase tracking-wide text-gray-500">Population positively affected</div>
                  <div className="mt-1 text-[13px] font-semibold text-gray-900">{Math.abs(populationAffected) < 1 ? "No meaningful change detected" : formatCount(populationAffected)}</div>
                </div>
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <div className="text-[11px] uppercase tracking-wide text-gray-500">Underserved population</div>
                  <div className="mt-1 text-[13px] font-semibold text-gray-900">
                    {formatCount(baselineUnderservedPopulation)} → {formatCount(simulatedUnderservedPopulation)}
                  </div>
                  <div className="mt-1 text-xs text-gray-600">{formatMeaningfulDelta(underservedPopulationDelta, { decimals: 0, unit: " residents", epsilon: 1 })}</div>
                </div>
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <div className="text-[11px] uppercase tracking-wide text-gray-500">Nearby origin clusters likely to benefit</div>
                  <div className="mt-1 text-[13px] font-semibold text-gray-900">
                    {districtImpacts.some((row) => row.delta > 0.001)
                      ? districtImpacts
                          .filter((row) => row.delta > 0.001)
                          .slice(0, 3)
                          .map((row) => row.districtName)
                          .join(", ")
                      : "No clear area-level gain yet"}
                  </div>
                </div>
              </div>
              <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3 text-[13px] text-gray-700">
                <div className="font-semibold text-gray-900" title="Equity change shows whether accessibility is becoming more evenly distributed across origin areas. Negative values indicate a more equitable pattern.">
                  Equity change
                </div>
                <div className="mt-1">
                  {inequalityChange === null
                    ? "Not available"
                    : formatMeaningfulDelta(inequalityChange, {
                        multiplier: 1,
                        decimals: 3,
                        unit: " Gini points",
                        epsilon: 0.001
                      })}
                </div>
                <div className="mt-1 text-xs text-gray-600">Gini points are a compact measure of how evenly access is distributed. Lower is more even.</div>
              </div>
            </>
          ) : (
            <div className="mt-3 rounded-lg border border-dashed border-gray-300 p-4 text-sm text-gray-500">Run a simulation to see clear before/after KPI cards and origin-level impact.</div>
          )}
        </article>
      </div>

      <article className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <h3 className="font-heading text-[16px] font-bold text-gray-900">Impacted origin areas</h3>
        {hasResult ? (
          districtImpacts.some((row) => Math.abs(row.delta) >= 0.005) ? (
            <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
              {districtImpacts.slice(0, 8).map((row) => (
                <div key={row.id} className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-[13px] text-gray-700">
                  <div className="font-semibold text-gray-900">{row.districtName}</div>
                  <div className="mt-1">
                    Accessibility change: {" "}
                    <span className={row.delta >= 0 ? "font-semibold text-blue-700" : "font-semibold text-red-700"}>
                      {formatMeaningfulDelta(row.delta, { multiplier: 100, decimals: 2, unit: " pp", epsilon: 0.01 })}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-gray-600">Population: {Math.round(row.population).toLocaleString()}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">No meaningful area-level change was detected for this scenario.</div>
          )
        ) : (
          <div className="mt-3 rounded-lg border border-dashed border-gray-300 p-3 text-sm text-gray-500">Origin impact details will appear after the simulation run.</div>
        )}
      </article>

      {simulationResult?.error ? <article className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{simulationResult.error}</article> : null}
    </section>
  );
}
