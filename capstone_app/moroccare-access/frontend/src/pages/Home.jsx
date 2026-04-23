import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import UploadWizard from "../components/UploadWizard";
import MapView from "../components/map/MapView";
import DistrictDetailsPanel from "../components/DistrictDetailsPanel";
import AppShell from "../components/layout/AppShell";
import TopBar from "../components/layout/TopBar";
import ErrorState from "../components/ui/ErrorState";
import SectionCard from "../components/layout/SectionCard";
import PageContainer from "../components/layout/PageContainer";
import { useToast } from "../hooks/useToast";
import { fetchApiHealth, uploadCityData } from "../api/cities";
import { useCityData } from "../hooks/useCityData";
import { useSimulation } from "../hooks/useSimulation";
import { FALLBACK_CENTER, normalizeFacility } from "../utils/adapters";

const SCENARIO_CARDS = [
  {
    id: "add_stops",
    icon: "🚌",
    title: "Add bus stops near isolated facilities",
    description:
      "Place new stops within 200m of the 10 most isolated healthcare facilities. Targets facilities currently scoring below 0.35.",
    impactHint: "Est. +18% avg. accessibility"
  },
  {
    id: "extend_tram",
    icon: "🚊",
    title: "Extend tram coverage south",
    description:
      "Route the tramway through Sidi Othmane and Hay Mohammadi, two districts with high population and low transit density.",
    impactHint: "Est. +31% in south districts"
  },
  {
    id: "increase_freq",
    icon: "⏱️",
    title: "Increase frequency on low-access lines",
    description: "Double the service frequency on bus lines L072 and L067, which serve the most underserved areas.",
    impactHint: "Est. −12 min avg. wait time"
  },
  {
    id: "add_facilities",
    icon: "🏥",
    title: "Open 2 healthcare facilities near transit hubs",
    description:
      "Place healthcare facilities at the two highest-traffic stops that have no facility within 600m.",
    impactHint: "Est. +24% equity score"
  }
];

const scenarioPayloads = {
  add_stops: { stop_density_multiplier: 1.8, reduce_distance: 0.6, add_facilities: 0 },
  extend_tram: { stop_density_multiplier: 2.2, reduce_distance: 0.5, add_facilities: 0 },
  increase_freq: { stop_density_multiplier: 1.3, reduce_distance: 0.85, add_facilities: 0 },
  add_facilities: { stop_density_multiplier: 1.0, reduce_distance: 1.0, add_facilities: 2 }
};

const CUSTOM_SCENARIO_DEFAULTS = {
  stop_density_multiplier: 1.0,
  reduce_nearest_stop_distance_pct: 0.0,
  add_facilities: 0,
  target_area: "Citywide"
};

function formatMeters(value) {
  if (!Number.isFinite(value)) return "—";
  return `${Math.round(value).toLocaleString()}m`;
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function scoreTone(score) {
  if (score >= 0.67) {
    return { label: "High access", badge: "bg-emerald-100 text-emerald-800 border-emerald-200", bar: "bg-emerald-500" };
  }
  if (score >= 0.4) {
    return { label: "Medium", badge: "bg-amber-100 text-amber-800 border-amber-200", bar: "bg-amber-500" };
  }
  return { label: "Low access", badge: "bg-red-100 text-red-800 border-red-200", bar: "bg-red-500" };
}

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

function getNearestStopDistanceMeters(facility, stops) {
  if (!stops.length) return NaN;
  let nearest = Number.POSITIVE_INFINITY;
  for (const stop of stops) {
    const lat = Number(stop.latitude);
    const lon = Number(stop.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const distance = haversineMeters(facility.latitude, facility.longitude, lat, lon);
    if (distance < nearest) nearest = distance;
  }
  return Number.isFinite(nearest) ? nearest : NaN;
}

function parseModes(stop) {
  const modeText = String(stop?.mode || "").toLowerCase();
  const linesText = String(stop?.lines || "").toLowerCase();
  const merged = `${modeText} ${linesText}`;
  const hasBus = merged.includes("bus") || merged.includes("casabus") || /\bl\d{2,3}\b/.test(merged);
  const hasTram = merged.includes("tram");
  const hasBusway = merged.includes("busway");
  return { hasBus, hasTram, hasBusway };
}

function MethodologyModal({ open, onClose }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-slate-900/45 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <h3 className="text-lg font-semibold text-slate-900">How to read this dashboard</h3>
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-2 py-1 text-sm text-slate-600 hover:bg-slate-50">
            Close
          </button>
        </div>
        <div className="mt-4 space-y-3 text-sm text-slate-700">
          <p>Accessibility scores range from 0 to 1. Higher scores indicate better expected access to healthcare via transport.</p>
          <p>
            Facilities are flagged as <strong>low access</strong> when the nearest public transport stop is more than 250m away.
          </p>
          <p>
            Scenario simulations are policy tests. They do not alter source data, and are intended to compare intervention options before implementation.
          </p>
        </div>
      </div>
    </div>
  );
}

function OverviewPageContent({ cityName, facilitiesWithDistance, transportStops, sortMode, onSortModeChange }) {
  const sortedFacilities = useMemo(() => {
    const rows = [...facilitiesWithDistance];
    rows.sort((a, b) => {
      if (sortMode === "best") return b.accessibilityScore - a.accessibilityScore;
      return a.accessibilityScore - b.accessibilityScore;
    });
    return rows;
  }, [facilitiesWithDistance, sortMode]);

  const lowAccessFacilities = facilitiesWithDistance.filter((row) => Number.isFinite(row.nearestStopDistanceMeters) && row.nearestStopDistanceMeters > 250);
  const averageDistance = facilitiesWithDistance.length
    ? facilitiesWithDistance.reduce((sum, row) => sum + (Number.isFinite(row.nearestStopDistanceMeters) ? row.nearestStopDistanceMeters : 0), 0) / facilitiesWithDistance.length
    : 0;
  const mostIsolated = [...facilitiesWithDistance]
    .filter((row) => Number.isFinite(row.nearestStopDistanceMeters))
    .sort((a, b) => b.nearestStopDistanceMeters - a.nearestStopDistanceMeters)[0];
  const cityLabel = cityName || "the selected city";

  return (
    <PageContainer title="Overview" description="Immediate policy signal on where transport access to healthcare is weakest.">
      <SectionCard title="Key finding" subtitle="Priority insight from current baseline">
        <p className="text-base font-semibold text-slate-900">
          {lowAccessFacilities.length} facilities in {cityLabel} have low transport access.{" "}
          {mostIsolated
            ? `The most isolated is ${mostIsolated.districtName} — ${formatMeters(mostIsolated.nearestStopDistanceMeters)} from the nearest stop.`
            : "No facility-level stop distance was available."}
        </p>
      </SectionCard>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <section className="panel-card p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Total facilities</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{facilitiesWithDistance.length.toLocaleString()}</p>
        </section>
        <section className="panel-card p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Total transport stops</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{transportStops.length.toLocaleString()}</p>
        </section>
        <section className="panel-card p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Average distance to nearest stop</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{formatMeters(averageDistance)}</p>
        </section>
        <section className="panel-card p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Low-access facilities (&gt;250m)</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{lowAccessFacilities.length.toLocaleString()}</p>
        </section>
      </div>

      <SectionCard
        title="Facility ranking"
        subtitle="Sorted by accessibility score (worst first by default)"
        headerRight={
          <button
            type="button"
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
            onClick={() => onSortModeChange(sortMode === "worst" ? "best" : "worst")}
          >
            {sortMode === "worst" ? "Switch to best-first" : "Switch to worst-first"}
          </button>
        }
      >
        <div className="grid max-h-[55vh] grid-cols-1 gap-3 overflow-y-auto pr-1 md:grid-cols-2">
          {sortedFacilities.map((row) => {
            const tone = scoreTone(row.accessibilityScore);
            const scorePct = Math.max(0, Math.min(100, row.accessibilityScore * 100));
            return (
              <article key={row.id} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex items-start justify-between gap-2">
                  <h4 className="text-sm font-semibold text-slate-900">{row.districtName}</h4>
                  <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${tone.badge}`}>{tone.label}</span>
                </div>
                <div className="mt-3 h-2 rounded-full bg-slate-200">
                  <div className={`h-2 rounded-full ${tone.bar}`} style={{ width: `${scorePct}%` }} />
                </div>
                <div className="mt-3 flex items-center justify-between text-xs text-slate-600">
                  <span>Accessibility score: {row.accessibilityScore.toFixed(3)}</span>
                  <span>Nearest stop: {formatMeters(row.nearestStopDistanceMeters)}</span>
                </div>
              </article>
            );
          })}
        </div>
      </SectionCard>
    </PageContainer>
  );
}

export default function Home({ activePage = "overview" }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const { push } = useToast();

  const [selectedCityId, setSelectedCityId] = useState("");
  const [activeLayer, setActiveLayer] = useState("accessibility");
  const [selectedDistrict, setSelectedDistrict] = useState(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [methodologyOpen, setMethodologyOpen] = useState(false);
  const [selectedScenarioId, setSelectedScenarioId] = useState(null);
  const [simulationMode, setSimulationMode] = useState("recommended");
  const [customScenario, setCustomScenario] = useState(CUSTOM_SCENARIO_DEFAULTS);
  const [sortMode, setSortMode] = useState("worst");
  const [simulation, setSimulation] = useState(null);
  const [comparison, setComparison] = useState(null);

  const healthQuery = useQuery({
    queryKey: ["api-health"],
    queryFn: fetchApiHealth,
    refetchInterval: 30_000,
    retry: 0
  });

  const {
    citiesQuery,
    baselineQuery,
    summaryQuery,
    rankingQuery,
    recommendationsQuery,
    explainabilityQuery,
    districts: baselineDistricts,
    rankingRows,
    explainabilityRows,
    transportStops
  } = useCityData(selectedCityId || "");

  const cities = citiesQuery.data || [];
  const effectiveCityId = selectedCityId || cities[0]?.city_id || "";

  useEffect(() => {
    if (!selectedCityId && cities.length) {
      setSelectedCityId(cities[0].city_id);
    }
  }, [selectedCityId, cities]);

  const currentCity = cities.find((item) => item.city_id === effectiveCityId);
  const cityConfig = currentCity ? { center_lat: currentCity.center_lat, center_lon: currentCity.center_lon } : FALLBACK_CENTER;

  const uploadMutation = useMutation({
    mutationFn: uploadCityData,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cities"] });
      push("City uploaded successfully.", "success");
    },
    onError: (error) => push(error?.message || "Upload failed.", "error")
  });

  const { simulationMutation, compareMutation } = useSimulation(({ simulation: simulationData, comparison: comparisonData }) => {
    setSimulation(simulationData);
    setComparison(comparisonData);
  });

  const simulatedDistricts = useMemo(() => {
    if (!simulation?.facilities) return [];
    return simulation.facilities.map(normalizeFacility);
  }, [simulation]);

  const hasSimulation = simulatedDistricts.length > 0;
  const districts = hasSimulation ? simulatedDistricts : baselineDistricts;

  const selectedScenario = SCENARIO_CARDS.find((scenario) => scenario.id === selectedScenarioId) || null;
  const customConfigured =
    customScenario.stop_density_multiplier !== CUSTOM_SCENARIO_DEFAULTS.stop_density_multiplier ||
    customScenario.reduce_nearest_stop_distance_pct !== CUSTOM_SCENARIO_DEFAULTS.reduce_nearest_stop_distance_pct ||
    customScenario.add_facilities !== CUSTOM_SCENARIO_DEFAULTS.add_facilities;
  const canRunSimulation =
    Boolean(effectiveCityId) &&
    (simulationMode === "recommended" ? Boolean(selectedScenarioId) : customConfigured);

  const runScenario = () => {
    if (!effectiveCityId || !canRunSimulation) return;
    let payload;
    if (simulationMode === "recommended") {
      const rawPayload = scenarioPayloads[selectedScenarioId];
      if (!rawPayload) return;
      payload = {
        stop_density_multiplier: rawPayload.stop_density_multiplier,
        reduce_nearest_stop_distance_pct: Math.max(0, Math.min(1, 1 - rawPayload.reduce_distance)),
        add_facilities: rawPayload.add_facilities
      };
    } else {
      payload = {
        stop_density_multiplier: customScenario.stop_density_multiplier,
        reduce_nearest_stop_distance_pct: customScenario.reduce_nearest_stop_distance_pct,
        add_facilities: customScenario.add_facilities
      };
    }
    simulationMutation.mutate({
      cityId: effectiveCityId,
      params: payload
    });
  };

  const resetScenario = () => {
    setSimulation(null);
    setComparison(null);
    if (simulationMode === "custom") {
      setCustomScenario(CUSTOM_SCENARIO_DEFAULTS);
    }
  };

  useEffect(() => {
    const navState = location.state;
    if (!navState || !navState.simulation || !Array.isArray(navState.simulation.facilities)) return;
    setSimulation(navState.simulation);
    setComparison(navState.comparison || null);
    if (typeof navState.selectedScenarioId === "string") {
      setSelectedScenarioId(navState.selectedScenarioId);
    }
  }, [location.state]);

  const onSelectDistrict = (district) => {
    if (!district) return;
    setSelectedDistrict(district);
    setDetailsOpen(true);
  };

  const facilitiesWithDistance = useMemo(
    () =>
      baselineDistricts.map((facility) => ({
        ...facility,
        nearestStopDistanceMeters: getNearestStopDistanceMeters(facility, transportStops)
      })),
    [baselineDistricts, transportStops]
  );

  const priorityByDistrict = useMemo(() => {
    if (!rankingRows.length) return {};
    const maxRank = Math.max(...rankingRows.map((row) => Number(row.rank || 1)), 1);
    return rankingRows.reduce((acc, row) => {
      const name = String(row.district || "");
      const rank = Number(row.rank || maxRank);
      acc[name] = Math.max(0, Math.min(1, (maxRank - rank + 1) / maxRank));
      return acc;
    }, {});
  }, [rankingRows]);

  const distanceDistributionRows = useMemo(() => {
    const rows = [
      { bucket: "< 100m", count: 0, color: "#3B6D11" },
      { bucket: "100–200m", count: 0, color: "#EF9F27" },
      { bucket: "200–300m", count: 0, color: "#F28C6B" },
      { bucket: "> 300m", count: 0, color: "#D85A30" }
    ];
    for (const facility of facilitiesWithDistance) {
      const d = Number(facility.nearestStopDistanceMeters);
      if (!Number.isFinite(d)) continue;
      if (d < 100) rows[0].count += 1;
      else if (d < 200) rows[1].count += 1;
      else if (d < 300) rows[2].count += 1;
      else rows[3].count += 1;
    }
    return rows;
  }, [facilitiesWithDistance]);

  const transportModeCoverageRows = useMemo(() => {
    const counts = {
      "Bus (casabus)": 0,
      Tram: 0,
      Busway: 0,
      "Multi-mode": 0
    };
    for (const stop of transportStops) {
      const { hasBus, hasTram, hasBusway } = parseModes(stop);
      const activeModes = [hasBus, hasTram, hasBusway].filter(Boolean).length;
      if (activeModes > 1) {
        counts["Multi-mode"] += 1;
      } else if (hasBusway) {
        counts.Busway += 1;
      } else if (hasTram) {
        counts.Tram += 1;
      } else if (hasBus) {
        counts["Bus (casabus)"] += 1;
      }
    }
    const tealRamp = ["#0f766e", "#0d9488", "#14b8a6", "#5eead4"];
    return [
      { mode: "Bus (casabus)", count: counts["Bus (casabus)"], color: tealRamp[0] },
      { mode: "Tram", count: counts.Tram, color: tealRamp[1] },
      { mode: "Busway", count: counts.Busway, color: tealRamp[2] },
      { mode: "Multi-mode", count: counts["Multi-mode"], color: tealRamp[3] }
    ];
  }, [transportStops]);

  const featureImportanceRows = useMemo(
    () =>
      explainabilityRows.map((row) => ({
        feature: String(row.feature || "Unknown feature"),
        importance: toNumber(row.importance, 0)
      })),
    [explainabilityRows]
  );

  const setPage = (_pageId, path) =>
    navigate(path, simulation ? { state: { simulation, comparison, selectedScenarioId } } : undefined);
  const healthStatus = healthQuery.data?.status === "ok" ? "ok" : healthQuery.isError ? "down" : "unknown";
  const mainError =
    baselineQuery.error?.message ||
    summaryQuery.error?.message ||
    rankingQuery.error?.message ||
    recommendationsQuery.error?.message ||
    explainabilityQuery.error?.message ||
    simulationMutation.error?.message ||
    compareMutation.error?.message ||
    null;

  const renderMapPage = () => (
    <section className="h-[calc(100vh-160px)] min-h-[620px]">
      <MapView
        city={cityConfig}
        baselineFacilities={baselineDistricts}
        simulatedFacilities={simulatedDistricts}
        transportStops={transportStops}
        isLoading={baselineQuery.isFetching}
        activeLayer={activeLayer}
        onLayerChange={setActiveLayer}
        onSelectPoint={onSelectDistrict}
        selectedDistrictId={selectedDistrict?.id || null}
        priorityByDistrict={priorityByDistrict}
        onWhyScore={() => navigate("/analytics")}
      />
    </section>
  );

  const renderSimulationPage = () => (
    <PageContainer title="Simulate" description="Choose a policy scenario and run a projected impact simulation.">
      <SectionCard
        title="Scenario workflow"
        subtitle="Choose a recommended scenario or build your own, then run and review impact."
      >
        <p className="mb-3 text-sm text-slate-600">
          You can either test a recommended scenario or build your own scenario with custom intervention settings.
        </p>

        <div className="mb-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setSimulationMode("recommended")}
            className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${
              simulationMode === "recommended"
                ? "border-blue-300 bg-blue-50 text-blue-700"
                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            Recommended scenarios
          </button>
          <button
            type="button"
            onClick={() => setSimulationMode("custom")}
            className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${
              simulationMode === "custom"
                ? "border-blue-300 bg-blue-50 text-blue-700"
                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            Build your own scenario
          </button>
        </div>

        {simulationMode === "recommended" ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {SCENARIO_CARDS.map((scenario) => {
              const selected = selectedScenarioId === scenario.id;
              return (
                <button
                  key={scenario.id}
                  type="button"
                  onClick={() => setSelectedScenarioId(scenario.id)}
                  className={`rounded-xl border p-4 text-left transition ${
                    selected
                      ? "border-blue-500 bg-blue-50 ring-2 ring-blue-200 shadow-sm"
                      : "border-slate-200 bg-white hover:border-blue-200 hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{scenario.icon}</span>
                      <h4 className="text-sm font-bold text-slate-900">{scenario.title}</h4>
                    </div>
                    {selected ? (
                      <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[11px] font-semibold text-white">Selected</span>
                    ) : null}
                  </div>
                  <p className="mt-2 text-xs leading-5 text-slate-700">{scenario.description}</p>
                  <p className="mt-2 text-xs font-semibold text-blue-700">{scenario.impactHint}</p>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <h4 className="text-sm font-semibold text-slate-900">Custom scenario builder</h4>
            <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-2">
              <label className="text-sm text-slate-700">
                <span className="mb-1 block">Target area</span>
                <select
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  value={customScenario.target_area}
                  onChange={(e) => setCustomScenario((prev) => ({ ...prev, target_area: e.target.value }))}
                >
                  <option value="Citywide">Citywide</option>
                  <option value="Peripheral districts">Peripheral districts</option>
                  <option value="Low-access districts">Low-access districts</option>
                  <option value="Transit corridors">Transit corridors</option>
                </select>
              </label>
              <label className="text-sm text-slate-700">
                <span className="mb-1 block">Transit stop density multiplier</span>
                <input
                  type="range"
                  min={1}
                  max={2.5}
                  step={0.1}
                  value={customScenario.stop_density_multiplier}
                  onChange={(e) => setCustomScenario((prev) => ({ ...prev, stop_density_multiplier: toNumber(e.target.value, 1) }))}
                  className="w-full accent-blue-600"
                />
                <span className="mt-1 block text-xs text-slate-600">x{customScenario.stop_density_multiplier.toFixed(1)}</span>
              </label>
              <label className="text-sm text-slate-700">
                <span className="mb-1 block">Walking distance reduction</span>
                <input
                  type="range"
                  min={0}
                  max={0.5}
                  step={0.05}
                  value={customScenario.reduce_nearest_stop_distance_pct}
                  onChange={(e) =>
                    setCustomScenario((prev) => ({
                      ...prev,
                      reduce_nearest_stop_distance_pct: toNumber(e.target.value, 0)
                    }))
                  }
                  className="w-full accent-blue-600"
                />
                <span className="mt-1 block text-xs text-slate-600">
                  {(customScenario.reduce_nearest_stop_distance_pct * 100).toFixed(0)}%
                </span>
              </label>
              <label className="text-sm text-slate-700">
                <span className="mb-1 block">Additional facilities</span>
                <input
                  type="range"
                  min={0}
                  max={5}
                  step={1}
                  value={customScenario.add_facilities}
                  onChange={(e) => setCustomScenario((prev) => ({ ...prev, add_facilities: toNumber(e.target.value, 0) }))}
                  className="w-full accent-blue-600"
                />
                <span className="mt-1 block text-xs text-slate-600">{customScenario.add_facilities}</span>
              </label>
            </div>
            <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-700">
              <div className="font-semibold text-slate-900">Custom settings summary</div>
              <ul className="mt-1 space-y-1">
                <li>Target area: {customScenario.target_area}</li>
                <li>Stop density: x{customScenario.stop_density_multiplier.toFixed(1)}</li>
                <li>Walking distance reduction: {(customScenario.reduce_nearest_stop_distance_pct * 100).toFixed(0)}%</li>
                <li>Additional facilities: {customScenario.add_facilities}</li>
              </ul>
            </div>
          </div>
        )}

        <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-[1fr_auto]">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
            <div className="font-semibold text-slate-900">Simulation summary</div>
            <div className="mt-1 text-xs">
              <div>
                <span className="font-medium">Scenario:</span>{" "}
                {simulationMode === "recommended" ? selectedScenario?.title || "None selected" : "Custom scenario"}
              </div>
              <div>
                <span className="font-medium">Expected target area:</span>{" "}
                {simulationMode === "recommended"
                  ? selectedScenario
                    ? "Targeted underserved districts"
                    : "—"
                  : customScenario.target_area}
              </div>
              <div>
                <span className="font-medium">Interventions:</span>{" "}
                {simulationMode === "recommended"
                  ? selectedScenario?.impactHint || "—"
                  : `x${customScenario.stop_density_multiplier.toFixed(1)} stop density, ${(customScenario.reduce_nearest_stop_distance_pct * 100).toFixed(
                      0
                    )}% walking reduction, +${customScenario.add_facilities} facilities`}
              </div>
              <div>
                <span className="font-medium">Estimated impact:</span>{" "}
                {comparison?.comparison?.improvement_percentage != null
                  ? `${toNumber(comparison.comparison.improvement_percentage, 0).toFixed(1)}% accessibility change`
                  : "Available after running simulation"}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-start gap-2">
            <button
              type="button"
              onClick={runScenario}
              disabled={!canRunSimulation || simulationMutation.isPending || compareMutation.isPending}
              className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {simulationMutation.isPending || compareMutation.isPending ? "Running simulation..." : "Run simulation"}
            </button>
            <button
              type="button"
              onClick={resetScenario}
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Reset
            </button>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Simulation results" subtitle="Before vs after impact from the selected intervention.">
        {simulation || comparison ? (
          (() => {
            const avgAccessibilityDeltaPct = toNumber(
              comparison?.comparison?.improvement_percentage,
              toNumber(simulation?.avg_delta, 0) * 100
            );
            const travelReduction = Math.max(0, -toNumber(comparison?.comparison?.delta_travel_time, 0));
            const equityImprovement = Math.max(
              0,
              toNumber(simulation?.equity?.gini_improvement, toNumber(comparison?.comparison?.inequality_change, 0))
            );
            const districtsImprovedPct =
              toNumber(comparison?.districts_total, 0) > 0
                ? (toNumber(comparison?.districts_improved, 0) / toNumber(comparison?.districts_total, 1)) * 100
                : 0;

            const rows = [
              {
                label: "Average accessibility improvement",
                value: Math.abs(avgAccessibilityDeltaPct),
                display: `${avgAccessibilityDeltaPct >= 0 ? "+" : ""}${avgAccessibilityDeltaPct.toFixed(1)}%`
              },
              {
                label: "Average travel-time reduction",
                value: travelReduction,
                display: `${travelReduction.toFixed(1)} min`
              },
              {
                label: "Equity improvement (Gini)",
                value: Math.abs(equityImprovement * 100),
                display: `${equityImprovement >= 0 ? "+" : ""}${equityImprovement.toFixed(3)}`
              },
              {
                label: "Districts improved",
                value: Math.abs(districtsImprovedPct),
                display: `${districtsImprovedPct.toFixed(1)}%`
              }
            ];
            const maxValue = Math.max(...rows.map((row) => row.value), 1);

            return (
              <div className="space-y-3">
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-lg border border-slate-200 bg-white p-3">
                    <div className="text-xs text-slate-500">Before vs after</div>
                    <div className="mt-1 text-sm font-semibold text-slate-900">
                      {simulationMode === "recommended" ? selectedScenario?.title || "Scenario" : "Custom scenario"}
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white p-3">
                    <div className="text-xs text-slate-500">Accessibility change</div>
                    <div className="mt-1 text-sm font-semibold text-slate-900">{rows[0].display}</div>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white p-3">
                    <div className="text-xs text-slate-500">Travel time change</div>
                    <div className="mt-1 text-sm font-semibold text-slate-900">{rows[1].display}</div>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white p-3">
                    <div className="text-xs text-slate-500">Equity change</div>
                    <div className="mt-1 text-sm font-semibold text-slate-900">{rows[2].display}</div>
                  </div>
                </div>
                {rows.map((row) => (
                  <div key={row.label}>
                    <div className="mb-1 flex items-center justify-between text-xs text-slate-700">
                      <span>{row.label}</span>
                      <span className="font-semibold text-slate-900">{row.display}</span>
                    </div>
                    <div className="h-2.5 rounded-full bg-slate-200">
                      <div className="h-2.5 rounded-full bg-blue-600" style={{ width: `${Math.max(8, (row.value / maxValue) * 100)}%` }} />
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => navigate("/map", { state: { simulation, comparison, selectedScenarioId } })}
                  className="mt-2 rounded-xl border border-blue-300 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-800 transition hover:bg-blue-100"
                >
                  View on map
                </button>
              </div>
            );
          })()
        ) : (
          <div className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">
            Results will appear here after you run a recommended or custom scenario. This section includes before/after comparison, accessibility and travel-time deltas, equity change, and district impact summary.
          </div>
        )}
      </SectionCard>
    </PageContainer>
  );

  const renderAnalyticsPage = () => (
    <PageContainer title="Analytics" description="Accessibility structure, transport coverage, and model explainability.">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <SectionCard title="Distance distribution" subtitle="Facilities by nearest-stop distance bucket">
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={distanceDistributionRows}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="bucket" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                  {distanceDistributionRows.map((row) => (
                    <Cell key={row.bucket} fill={row.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>

        <SectionCard title="Transport mode coverage" subtitle="Stops by service mode">
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={transportModeCoverageRows} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
                <YAxis type="category" dataKey="mode" width={110} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="count" radius={[0, 6, 6, 0]}>
                  {transportModeCoverageRows.map((row) => (
                    <Cell key={row.mode} fill={row.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Model feature importances" subtitle="Relative influence on predicted accessibility">
        <div className="h-[360px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={featureImportanceRows} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis type="number" tick={{ fontSize: 12 }} />
              <YAxis
                type="category"
                dataKey="feature"
                width={220}
                tick={{ fontSize: 11 }}
                tickFormatter={(value) => (String(value).length > 34 ? `${String(value).slice(0, 34)}…` : value)}
              />
              <Tooltip />
              <Bar dataKey="importance" fill="#2563eb" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-3 text-sm text-slate-700">
          The number of nearby stops (within 500m) is the strongest predictor of accessibility — more than raw distance.
        </p>
      </SectionCard>
    </PageContainer>
  );

  const renderActivePage = () => {
    if (!effectiveCityId) {
      return (
        <SectionCard title="No city selected" subtitle="Use the top bar to pick a city or upload one">
          <div className="text-sm text-slate-500">No city data is currently selected.</div>
        </SectionCard>
      );
    }
    if (activePage === "map") return renderMapPage();
    if (activePage === "simulation") return renderSimulationPage();
    if (activePage === "analytics") return renderAnalyticsPage();
    return (
      <OverviewPageContent
        cityName={currentCity?.display_name || ""}
        facilitiesWithDistance={facilitiesWithDistance}
        transportStops={transportStops}
        sortMode={sortMode}
        onSortModeChange={setSortMode}
      />
    );
  };

  return (
    <AppShell
      topBar={
        <TopBar
          cityId={effectiveCityId}
          cities={cities}
          onCityChange={(id) => {
            setSelectedCityId(id);
            setSelectedDistrict(null);
            setDetailsOpen(false);
            setSimulation(null);
            setComparison(null);
          }}
          onOpenUpload={() => setUploadOpen(true)}
          onOpenMethodology={() => setMethodologyOpen(true)}
          healthStatus={healthStatus}
          healthLoading={healthQuery.isLoading}
          activePage={activePage}
          onPageChange={setPage}
        />
      }
    >
      {mainError ? <ErrorState message={mainError} /> : null}
      {renderActivePage()}

      <DistrictDetailsPanel district={selectedDistrict} open={detailsOpen} onClose={() => setDetailsOpen(false)} />
      <MethodologyModal open={methodologyOpen} onClose={() => setMethodologyOpen(false)} />
      <UploadWizard
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onUploaded={() => {
          setUploadOpen(false);
          citiesQuery.refetch();
        }}
        onSubmitUpload={(formData) => uploadMutation.mutateAsync(formData)}
        isUploading={uploadMutation.isPending}
      />
    </AppShell>
  );
}
