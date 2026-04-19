import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { uploadCityDataForCity } from "./api/cities";
import { normalizeFacility } from "./utils/adapters";
import { useCityData } from "./hooks/useCityData";
import { useSimulation } from "./hooks/useSimulation";
import NavBar from "./components/NavBar";
import CornerLanguageSwitcher from "./components/CornerLanguageSwitcher";
import UploadModal from "./components/UploadModal";
import Overview from "./pages/Overview";
import MapPage from "./pages/Map";
import Simulate from "./pages/Simulate";
import Analytics from "./pages/Analytics";
import { useI18n } from "./i18n/I18nProvider";

const scenarioPayloads = {
  add_stops: { stop_density_multiplier: 1.8, reduce_distance: 0.6, add_facilities: 0 },
  extend_tram: { stop_density_multiplier: 2.2, reduce_distance: 0.5, add_facilities: 0 },
  increase_freq: { stop_density_multiplier: 1.3, reduce_distance: 0.85, add_facilities: 0 },
  add_clinics: { stop_density_multiplier: 1.0, reduce_distance: 1.0, add_facilities: 2 }
};

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
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

function stopMetrics(row, stops) {
  if (!Array.isArray(stops) || !stops.length) {
    return { nearestStopDistanceMeters: NaN, stopsWithin500m: 0 };
  }
  let nearest = Number.POSITIVE_INFINITY;
  let within500 = 0;
  for (const stop of stops) {
    const lat = Number(stop.latitude);
    const lon = Number(stop.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const distance = haversineMeters(Number(row.latitude), Number(row.longitude), lat, lon);
    if (distance < nearest) nearest = distance;
    if (distance <= 500) within500 += 1;
  }
  return { nearestStopDistanceMeters: Number.isFinite(nearest) ? nearest : NaN, stopsWithin500m: within500 };
}

function AppFrame() {
  const { t } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedCityId, setSelectedCityId] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadMode, setUploadMode] = useState("update");
  const [dismissedErrorKey, setDismissedErrorKey] = useState("");
  const [selectedScenarioId, setSelectedScenarioId] = useState(null);
  const [activeSimulationLabel, setActiveSimulationLabel] = useState("");
  const [activeLayer, setActiveLayer] = useState("accessibility");

  const { citiesQuery, baselineQuery, explainabilityQuery } = useCityData(selectedCityId);
  const cities = citiesQuery.data || [];
  const currentCityId = selectedCityId || cities[0]?.id || cities[0]?.city_id || "";
  const currentCity = cities.find((city) => (city.id || city.city_id) === currentCityId) || null;
  const {
    runScenario: runSimulationScenario,
    resetSimulation,
    simulationResult: simulation,
    isSimulated,
    isPending: simulationPending,
    error: simulationError
  } = useSimulation();

  const scenarios = useMemo(
    () => [
      {
        id: "add_stops",
        icon: "🚌",
        title: t("simulate.scenarios.addStopsTitle"),
        description: t("simulate.scenarios.addStopsDescription"),
        impactHint: t("simulate.scenarios.addStopsImpact")
      },
      {
        id: "extend_tram",
        icon: "🚊",
        title: t("simulate.scenarios.extendTramTitle"),
        description: t("simulate.scenarios.extendTramDescription"),
        impactHint: t("simulate.scenarios.extendTramImpact")
      },
      {
        id: "increase_freq",
        icon: "⏱️",
        title: t("simulate.scenarios.increaseFreqTitle"),
        description: t("simulate.scenarios.increaseFreqDescription"),
        impactHint: t("simulate.scenarios.increaseFreqImpact")
      },
      {
        id: "add_clinics",
        icon: "🏥",
        title: t("simulate.scenarios.addClinicsTitle"),
        description: t("simulate.scenarios.addClinicsDescription"),
        impactHint: t("simulate.scenarios.addClinicsImpact")
      }
    ],
    [t]
  );

  const baselineFacilities = useMemo(() => {
    const facilities = Array.isArray(baselineQuery.data?.facilities) ? baselineQuery.data.facilities : [];
    return facilities.map(normalizeFacility);
  }, [baselineQuery.data]);

  const transportStops = useMemo(() => (Array.isArray(baselineQuery.data?.transport_stops) ? baselineQuery.data.transport_stops : []), [baselineQuery.data]);

  const facilitiesWithStops = useMemo(
    () =>
      baselineFacilities.map((row) => ({
        ...row,
        ...stopMetrics(row, transportStops)
      })),
    [baselineFacilities, transportStops]
  );

  const simulatedFacilities = useMemo(() => {
    const rows = Array.isArray(simulation?.facilities) ? simulation.facilities : [];
    return rows.map(normalizeFacility);
  }, [simulation]);

  const uploadMutation = useMutation({
    mutationFn: async ({ mode, cityId, cityName, healthcareFile, transportStopsFile, populationFile, onProgress }) => {
      const formDataByCity = new FormData();
      formDataByCity.append("healthcare_file", healthcareFile);
      formDataByCity.append("transport_stops_file", transportStopsFile);
      if (populationFile) formDataByCity.append("population_file", populationFile);
      const resolvedCityId = mode === "new" ? "__new__" : cityId;
      return uploadCityDataForCity(resolvedCityId, formDataByCity, {
        cityName,
        isNewCity: mode === "new",
        onUploadProgress: (evt) => {
          if (!evt.total) return;
          onProgress?.(Math.round((evt.loaded / evt.total) * 100));
        }
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        predicate: (query) => Array.isArray(query.queryKey) && query.queryKey.includes(currentCityId)
      });
      queryClient.invalidateQueries({ queryKey: ["cities"] });
      resetSimulation();
      setActiveSimulationLabel("");
    }
  });

  const selectedScenario = scenarios.find((scenario) => scenario.id === selectedScenarioId) || null;
  const simulationBars = useMemo(() => {
    if (!simulation) return [];
    const avgDelta = toNumber(simulation?.avg_delta, 0) * 100;
    const equity = simulation?.equity || {};
    const giniImprovement = toNumber(equity?.gini_improvement, 0);
    const threshold = toNumber(equity?.threshold_25, 0) * 100;
    const lowAccessShare = Array.isArray(simulation?.facilities) && simulation.facilities.length
      ? (simulation.facilities.filter((row) => toNumber(row.simulated_score ?? row.accessibility_score, 0) < 0.35).length / simulation.facilities.length) * 100
      : 0;
    const rows = [
      { label: t("simulate.bars.avgImprove"), value: Math.abs(avgDelta), display: `${avgDelta >= 0 ? "+" : ""}${avgDelta.toFixed(1)}%` },
      { label: t("simulate.bars.equityGain"), value: Math.abs(giniImprovement * 100), display: `${giniImprovement >= 0 ? "+" : ""}${giniImprovement.toFixed(3)}` },
      { label: t("simulate.bars.threshold"), value: Math.abs(threshold), display: `${threshold.toFixed(1)}%` },
      { label: t("simulate.bars.lowAccess"), value: Math.abs(lowAccessShare), display: `${lowAccessShare.toFixed(1)}%` }
    ];
    const max = Math.max(...rows.map((row) => row.value), 1);
    return rows.map((row) => ({ ...row, widthPct: Math.max(8, (row.value / max) * 100) }));
  }, [simulation, t]);

  const viewOnMap = () => navigate("/map");

  const runScenario = (options = {}) => {
    if (!currentCityId) return;

    if (options.customPayload) {
      runSimulationScenario({
        cityId: currentCityId,
        payload: options.customPayload
      });
      setActiveSimulationLabel(options.customLabel || "Custom scenario");
      return;
    }

    if (!selectedScenarioId) return;
    const rawPayload = scenarioPayloads[selectedScenarioId];
    if (!rawPayload) return;
    runSimulationScenario({
      cityId: currentCityId,
      payload: {
        stop_density_multiplier: rawPayload.stop_density_multiplier,
        reduce_nearest_stop_distance_pct: Math.max(0, Math.min(1, 1 - rawPayload.reduce_distance)),
        add_facilities: rawPayload.add_facilities
      }
    });
    setActiveSimulationLabel(selectedScenario?.title || "");
  };

  const activeTab = location.pathname.startsWith("/map")
    ? "map"
    : location.pathname.startsWith("/simulate") || location.pathname.startsWith("/simulation")
    ? "simulate"
    : location.pathname.startsWith("/analytics")
    ? "analytics"
    : "overview";

  const apiErrorMessage = uploadMutation.error?.message || simulationError?.message || "";
  const errorKey = apiErrorMessage ? `${activeTab}:${apiErrorMessage}` : "";
  const showApiError = Boolean(apiErrorMessage && dismissedErrorKey !== errorKey);

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <CornerLanguageSwitcher />
      <NavBar
        activeTab={activeTab}
        onTabChange={(tabPath) => navigate(tabPath)}
        cities={cities}
        selectedCityId={currentCityId}
        onCityChange={(cityId) => {
          setSelectedCityId(cityId);
          resetSimulation();
          setSelectedScenarioId(null);
          setActiveSimulationLabel("");
        }}
        onUploadClick={() => {
          setUploadMode("update");
          setUploadOpen(true);
        }}
        onAddNewCity={() => {
          setUploadMode("new");
          setUploadOpen(true);
        }}
      />

      <main className="mx-auto max-w-[1100px] px-6 py-4">
        {showApiError ? (
          <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {apiErrorMessage}
              <button type="button" className="ml-2 underline" onClick={() => setDismissedErrorKey(errorKey)}>
                {t("common.dismiss")}
              </button>
            </div>
          ) : null}
        <Routes>
          <Route
            path="/overview"
            element={
              <Overview
                cityName={currentCity?.name || currentCity?.display_name || ""}
                facilities={facilitiesWithStops}
                transportStops={transportStops}
                isLoading={baselineQuery.isLoading || citiesQuery.isLoading}
              />
            }
          />
          <Route
            path="/map"
            element={
              <MapPage
                city={currentCity}
                baselineFacilities={facilitiesWithStops}
                simulatedFacilities={simulatedFacilities}
                transportStops={transportStops}
                isLoading={baselineQuery.isLoading}
                activeLayer={activeLayer}
                onLayerChange={setActiveLayer}
                onWhyScore={() => navigate("/analytics")}
                isSimulated={isSimulated}
                scenarioName={activeSimulationLabel || selectedScenario?.title || ""}
                onResetSimulation={() => {
                  resetSimulation();
                  setSelectedScenarioId(null);
                  setActiveSimulationLabel("");
                }}
              />
            }
          />
          <Route
            path="/simulate"
            element={
                <Simulate
                  scenarios={scenarios}
                  selectedScenarioId={selectedScenarioId}
                onSelectScenario={(scenarioId) => {
                  setSelectedScenarioId(scenarioId);
                  setActiveSimulationLabel("");
                }}
                onRunSimulation={runScenario}
                simulationPending={simulationPending}
                selectedScenario={selectedScenario}
                activeSimulationLabel={activeSimulationLabel}
                bars={simulationBars}
                hasResult={Boolean(simulation)}
                onViewMap={viewOnMap}
                isSimulated={isSimulated}
                onResetSimulation={() => {
                  resetSimulation();
                  setSelectedScenarioId(null);
                  setActiveSimulationLabel("");
                }}
                />
              }
            />
          <Route path="/simulation" element={<Navigate to="/simulate" replace />} />
          <Route
            path="/analytics"
            element={
              <Analytics
                facilities={facilitiesWithStops}
                transportStops={transportStops}
                explainabilityRows={Array.isArray(explainabilityQuery.data?.feature_importance) ? explainabilityQuery.data.feature_importance : []}
                isLoading={baselineQuery.isLoading || explainabilityQuery.isLoading}
                equity={baselineQuery.data?.equity || null}
              />
            }
          />
          <Route path="/" element={<Navigate to="/overview" replace />} />
          <Route path="*" element={<Navigate to="/overview" replace />} />
        </Routes>
      </main>

      <UploadModal
        open={uploadOpen}
        cities={cities}
        defaultCityId={currentCityId}
        mode={uploadMode}
        onClose={() => setUploadOpen(false)}
        onUpload={(payload) => uploadMutation.mutateAsync(payload)}
        onGoToCity={(cityId) => {
          setSelectedCityId(cityId);
          setUploadOpen(false);
          setUploadMode("update");
        }}
        isUploading={uploadMutation.isPending}
      />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppFrame />
    </BrowserRouter>
  );
}
