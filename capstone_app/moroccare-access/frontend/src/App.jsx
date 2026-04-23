import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { uploadCityDataForCity } from "./api/cities";
import { normalizeBaselineFacilities, normalizeFacility, normalizeSupplyFacilities } from "./utils/adapters";
import { useCityData } from "./hooks/useCityData";
import { useSimulation } from "./hooks/useSimulation";
import CornerLanguageSwitcher from "./components/CornerLanguageSwitcher";
import UploadModal from "./components/UploadModal";
import NavBar from "./components/NavBar";
import MapPage from "./pages/Map";
import Simulate from "./pages/Simulate";
import { useI18n } from "./i18n/I18nProvider";
import OverviewPage from "./components/moroccare/OverviewPage";
import AnalysisMethodologyPage from "./components/moroccare/AnalysisMethodologyPage";
import { stakeholderMessage, stakeholderWarnings } from "./components/moroccare/planningMessages";

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
  const [activeSimulationLabel, setActiveSimulationLabel] = useState("");
  const [activeLayer, setActiveLayer] = useState("accessibility");

  const { citiesQuery, baselineQuery, summaryQuery, rankingQuery, recommendationsQuery } = useCityData(selectedCityId);
  const cities = citiesQuery.data || [];
  const currentCityId = selectedCityId || cities[0]?.id || cities[0]?.city_id || "";
  const currentCity = cities.find((city) => (city.id || city.city_id) === currentCityId) || null;
  const {
    runScenario: runSimulationScenario,
    resetSimulation,
    simulationResult: simulation,
    comparisonResult,
    isSimulated,
    isPending: simulationPending,
    error: simulationError
  } = useSimulation();

  const baselineOrigins = useMemo(() => normalizeBaselineFacilities(baselineQuery.data), [baselineQuery.data]);
  const baselineSupplyFacilities = useMemo(() => normalizeSupplyFacilities(baselineQuery.data), [baselineQuery.data]);

  const transportStops = useMemo(() => (Array.isArray(baselineQuery.data?.transport_stops) ? baselineQuery.data.transport_stops : []), [baselineQuery.data]);
  const districtSummaries = useMemo(
    () => (Array.isArray(baselineQuery.data?.district_summaries) ? baselineQuery.data.district_summaries : []),
    [baselineQuery.data]
  );
  const analysisUnit = baselineQuery.data?.analysis_unit || "origin";

  const originsWithStops = useMemo(
    () =>
      baselineOrigins.map((row) => ({
        ...row,
        ...stopMetrics(row, transportStops)
      })),
    [baselineOrigins, transportStops]
  );
  const supplyFacilitiesWithStops = useMemo(
    () =>
      baselineSupplyFacilities.map((row) => ({
        ...row,
        ...stopMetrics(row, transportStops)
      })),
    [baselineSupplyFacilities, transportStops]
  );

  const simulatedOrigins = useMemo(() => {
    const rows = Array.isArray(simulation?.origins) ? simulation.origins : Array.isArray(simulation?.facilities) ? simulation.facilities : [];
    return rows
      .map(normalizeFacility)
      .filter((row) => Number.isFinite(row.latitude) && Number.isFinite(row.longitude) && row.latitude !== 0 && row.longitude !== 0);
  }, [simulation]);
  const simulationBaselineOrigins = useMemo(() => {
    const rows = Array.isArray(simulation?.origins) ? simulation.origins : [];
    return rows
      .map((row, index) => {
        const beforeScore = Number(row.before_score);
        const baselineRow = {
          ...row,
          id: row.id ?? row.origin_id ?? `origin-${index}`,
          origin_id: row.origin_id ?? row.id ?? index,
          district_name: row.district_name ?? row.district,
          latitude: row.latitude ?? row.lat,
          longitude: row.longitude ?? row.lon,
          travel_time_min: row.before_travel_time_min ?? row.travel_time_min
        };
        if (Number.isFinite(beforeScore)) {
          baselineRow.accessibility_score = beforeScore;
          baselineRow.baseline_score = beforeScore;
          baselineRow.simulated_score = beforeScore;
        }
        return normalizeFacility(baselineRow);
      })
      .filter((row) => Number.isFinite(row.latitude) && Number.isFinite(row.longitude) && row.latitude !== 0 && row.longitude !== 0);
  }, [simulation]);
  const addedScenarioFacilities = useMemo(
    () =>
      (Array.isArray(simulation?.added_facilities) ? simulation.added_facilities : []).filter(
        (row) => Number.isFinite(Number(row.latitude)) && Number.isFinite(Number(row.longitude))
      ),
    [simulation]
  );
  const addedScenarioStops = useMemo(
    () =>
      (Array.isArray(simulation?.added_transport_stops) ? simulation.added_transport_stops : []).filter(
        (row) => Number.isFinite(Number(row.latitude)) && Number.isFinite(Number(row.longitude))
      ),
    [simulation]
  );

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

  const runScenario = (options = {}) => {
    if (!currentCityId) return;
    const payload = options.customPayload || options.payload;
    if (!payload) return;
    runSimulationScenario({
      cityId: currentCityId,
      payload
    });
    setActiveSimulationLabel(options.customLabel || options.label || "Custom scenario");
  };

  const activeTab = location.pathname.startsWith("/map")
    ? "map"
    : location.pathname.startsWith("/simulate") || location.pathname.startsWith("/simulation")
    ? "simulate"
    : location.pathname.startsWith("/analysis") || location.pathname.startsWith("/dashboard") || location.pathname.startsWith("/analytics") || location.pathname.startsWith("/data")
    ? "analysis"
    : "overview";

  const apiErrorMessage = stakeholderMessage(uploadMutation.error?.message || simulationError?.message || "", "");
  const errorKey = apiErrorMessage ? `${activeTab}:${apiErrorMessage}` : "";
  const showApiError = Boolean(apiErrorMessage && dismissedErrorKey !== errorKey);
  const baselineWarnings = stakeholderWarnings(baselineQuery.data?.warnings);

  return (
    <div className={`mc-app-shell mc-header-shell ${activeTab === "simulate" ? "is-simulate-route" : ""}`}>
      <CornerLanguageSwitcher />
      <NavBar
        activeTab={activeTab}
        onTabChange={(path) => navigate(path)}
        cities={cities}
        selectedCityId={currentCityId}
        onCityChange={(cityId) => {
          setSelectedCityId(cityId);
          resetSimulation();
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
      <div className="mc-main-shell">
      <main className={activeTab === "simulate" ? "mc-route-main mc-route-main-simulate" : "mc-route-main"}>
        {showApiError ? (
          <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {apiErrorMessage}
              <button type="button" className="ml-2 underline" onClick={() => setDismissedErrorKey(errorKey)}>
                {t("common.dismiss")}
              </button>
            </div>
          ) : null}
        {baselineWarnings.length && activeTab !== "simulate" ? (
          <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            {baselineWarnings.join(" ")}
          </div>
        ) : null}
        <Routes>
          <Route
            path="/overview"
            element={
              <OverviewPage
                city={currentCity}
                facilities={originsWithStops}
                transportStops={transportStops}
                baselineSupplyFacilities={supplyFacilitiesWithStops}
                districtSummaries={districtSummaries}
                citySummary={summaryQuery.data?.summary || null}
                planningRanking={Array.isArray(rankingQuery.data?.ranking) ? rankingQuery.data.ranking : []}
                backendRecommendations={Array.isArray(recommendationsQuery.data?.recommendations) ? recommendationsQuery.data.recommendations : []}
                analysisUnit={analysisUnit}
                simulation={simulation}
                isLoading={baselineQuery.isLoading || citiesQuery.isLoading}
                cities={cities}
                selectedCityId={currentCityId}
                onCityChange={(cityId) => {
                  setSelectedCityId(cityId);
                  resetSimulation();
                  setActiveSimulationLabel("");
                }}
                onOpenUpload={() => {
                  setUploadMode("update");
                  setUploadOpen(true);
                }}
                onAddCity={() => {
                  setUploadMode("new");
                  setUploadOpen(true);
                }}
              />
            }
          />
          <Route
            path="/map"
            element={
              <MapPage
                city={currentCity}
                baselineFacilities={originsWithStops}
                simulatedFacilities={simulatedOrigins}
                transportStops={transportStops}
                baselineSupplyFacilities={supplyFacilitiesWithStops}
                addedScenarioFacilities={addedScenarioFacilities}
                addedScenarioStops={addedScenarioStops}
                isLoading={baselineQuery.isLoading}
                activeLayer={activeLayer}
                onLayerChange={setActiveLayer}
                onWhyScore={() => navigate("/analysis")}
                isSimulated={isSimulated}
                scenarioName={activeSimulationLabel}
                onResetSimulation={() => {
                  resetSimulation();
                  setActiveSimulationLabel("");
                }}
              />
            }
          />
          <Route
            path="/simulate"
            element={
                <Simulate
                  city={currentCity}
                  analysisUnit={analysisUnit}
                  baselineFacilities={simulationBaselineOrigins.length ? simulationBaselineOrigins : originsWithStops}
                simulatedFacilities={simulatedOrigins}
                baselineSupplyFacilities={supplyFacilitiesWithStops}
                transportStops={transportStops}
                isLoading={baselineQuery.isLoading || citiesQuery.isLoading}
                onRunSimulation={runScenario}
                simulationPending={simulationPending}
                simulationResult={simulation}
                comparisonResult={comparisonResult}
                hasResult={Boolean(simulation)}
                activeSimulationLabel={activeSimulationLabel}
                onResetSimulation={() => {
                  resetSimulation();
                  setActiveSimulationLabel("");
                }}
              />
            }
          />
          <Route path="/simulation" element={<Navigate to="/simulate" replace />} />
          <Route path="/analysis" element={<AnalysisMethodologyPage />} />
          <Route path="/dashboard" element={<Navigate to="/analysis" replace />} />
          <Route path="/analytics" element={<Navigate to="/analysis" replace />} />
          <Route path="/data" element={<Navigate to="/analysis" replace />} />
          <Route path="/reports" element={<Navigate to="/analysis" replace />} />
          <Route path="/settings" element={<Navigate to="/overview" replace />} />
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
