import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { uploadCityDataForCity } from "./api/cities";
import { API_BASE_URL } from "./api/client";
import { normalizeBaselineFacilities, normalizeFacility, normalizeOverviewData, normalizeSupplyFacilities } from "./utils/adapters";
import { getLatLngFromFeature, normalizeFeatureList, splitValidInvalidByLatLng } from "./utils/mapCoordinates";
import { useCityData } from "./hooks/useCityData";
import { useSimulation } from "./hooks/useSimulation";
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
  const activeTab = location.pathname.startsWith("/map")
    ? "map"
    : location.pathname.startsWith("/simulate") || location.pathname.startsWith("/simulation")
    ? "simulate"
    : location.pathname.startsWith("/analysis") || location.pathname.startsWith("/dashboard") || location.pathname.startsWith("/analytics") || location.pathname.startsWith("/data")
    ? "analysis"
    : "overview";

  const dataRequirements = useMemo(
    () => ({
      includeBaseline: activeTab === "overview" || activeTab === "map" || activeTab === "simulate",
      includeBaselineDetails: activeTab === "map" || activeTab === "simulate",
      includeSummary: false,
      includeDistricts: activeTab === "map",
      includeRanking: false,
      includeRecommendations: false,
      includeRecommendedPlacements: activeTab === "simulate",
      includeExplainability: false,
      includeFacilitiesLayer: activeTab === "map" || activeTab === "simulate" || activeTab === "overview",
      includeStopsLayer: activeTab === "map" || activeTab === "simulate"
    }),
    [activeTab]
  );
  const { citiesQuery, baselineQuery, summaryQuery, rankingQuery, recommendationsQuery, recommendedPlacementsQuery, districtsQuery, facilitiesQuery, stopsQuery, resolvedCityId, queryEnablement } = useCityData(
    selectedCityId,
    dataRequirements
  );
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

  useEffect(() => {
    if (!selectedCityId && cities.length) {
      setSelectedCityId(cities[0].id || cities[0].city_id || "");
    }
  }, [cities, selectedCityId]);

  const baselineOrigins = useMemo(
    () => (dataRequirements.includeBaseline ? normalizeBaselineFacilities(baselineQuery.data) : []),
    [baselineQuery.data, dataRequirements.includeBaseline]
  );
  const baselineSupplyFacilities = useMemo(() => {
    if (!dataRequirements.includeBaseline) return [];
    const facilityPayload = facilitiesQuery.data;
    const featureItems = normalizeFeatureList(facilityPayload);
    const split = splitValidInvalidByLatLng(featureItems);
    if (import.meta.env.DEV) {
      console.log("Facilities response", facilityPayload);
      console.log("Facility feature count", featureItems.length);
      console.log("Invalid facility coordinate count", split.invalid.length);
    }
    const fromLayer = split.valid.map(({ item, latLng }, index) => ({
      id: item?.properties?.facility_id ?? item?.facility_id ?? `facility-${index}`,
      name: item?.properties?.name ?? item?.name ?? `Facility ${index + 1}`,
      latitude: latLng[0],
      longitude: latLng[1],
      type: item?.properties?.type ?? item?.type ?? "healthcare",
      capacity: item?.properties?.capacity ?? item?.capacity ?? 1,
      commune_id: item?.properties?.commune_id ?? item?.commune_id ?? null,
      commune_name: item?.properties?.commune_name ?? item?.commune_name ?? null,
      district_name: item?.properties?.district_name ?? item?.district_name ?? null
    }));
    if (fromLayer.length) return fromLayer;
    return normalizeSupplyFacilities(baselineQuery.data);
  }, [baselineQuery.data, dataRequirements.includeBaseline, facilitiesQuery.data]);
  const baselineData = baselineQuery.data ?? null;
  const overviewData = useMemo(() => {
    const primary = baselineData ?? summaryQuery.data ?? rankingQuery.data;
    if (!primary) {
      return {
        population: null,
        facilityCount: null,
        transportStopCount: null,
        averageAccessTimeMin: null,
        averageAccessibilityScore: null,
        pctPopulationWithin60Min: null,
        coverageGapPct: null,
        facilitiesNearTransit: null,
        rankingRows: [],
        districtSummaryRows: [],
        mappingIssue: null
      };
    }
    return normalizeOverviewData({
      baseline: baselineData,
      summary: summaryQuery.data,
      ranking: rankingQuery.data
    });
  }, [baselineData, rankingQuery.data, summaryQuery.data]);

  if (import.meta.env.DEV) {
    console.log("API_BASE_URL", API_BASE_URL);
    console.log("Selected city", selectedCityId, "Current city", currentCityId);
    console.log("Resolved city ID", resolvedCityId);
    console.log("Data requirements", dataRequirements);
    console.log("Query enablement", queryEnablement);
    console.log("Baseline query status", baselineQuery.status);
    console.log("Baseline query fetchStatus", baselineQuery.fetchStatus);
    console.log("Baseline query isPending", baselineQuery.isPending);
    console.log("Baseline query isFetching", baselineQuery.isFetching);
    console.log("Baseline query isError", baselineQuery.isError);
    console.log("Baseline query error", baselineQuery.error);
    console.log("Baseline query data", baselineQuery.data);
    console.log("Summary query", summaryQuery.status, summaryQuery.error);
    console.log("Summary query fetchStatus", summaryQuery.fetchStatus);
    console.log("Summary query isPending", summaryQuery.isPending);
    console.log("Summary query isFetching", summaryQuery.isFetching);
    console.log("Summary query isError", summaryQuery.isError);
    console.log("Summary query data", summaryQuery.data);
    console.log("Ranking query", rankingQuery.status, rankingQuery.error);
    console.log("Ranking query fetchStatus", rankingQuery.fetchStatus);
    console.log("Ranking query isPending", rankingQuery.isPending);
    console.log("Ranking query isFetching", rankingQuery.isFetching);
    console.log("Ranking query isError", rankingQuery.isError);
    console.log("Ranking query data", rankingQuery.data);
    console.log("Districts query", districtsQuery.status, districtsQuery.error);
    console.log("Baseline raw response:", baselineData);
    console.log("Baseline kpis:", baselineData?.kpis);
    console.log("Summary response", summaryQuery.data);
    console.log("Ranking response", rankingQuery.data);
    console.log("Normalized overview data:", overviewData);
  }

  const baselineTransportStops = useMemo(() => {
    if (!dataRequirements.includeBaseline) return [];
    const stopPayload = stopsQuery.data;
    const stopItems = normalizeFeatureList(stopPayload);
    const split = splitValidInvalidByLatLng(stopItems);
    const fromLayer = split.valid.map(({ item, latLng }, index) => ({
      stop_key: item?.properties?.stop_key ?? item?.stop_key ?? `stop-${index}`,
      stop_name: item?.properties?.stop_name ?? item?.stop_name ?? `Stop ${index + 1}`,
      latitude: latLng[0],
      longitude: latLng[1],
      mode: item?.properties?.mode ?? item?.mode ?? null,
      lines: item?.properties?.lines ?? item?.properties?.Lines ?? item?.lines ?? item?.Lines ?? null
    }));
    if (fromLayer.length) return fromLayer;
    return Array.isArray(baselineQuery.data?.transport_stops_baseline)
      ? baselineQuery.data.transport_stops_baseline
      : Array.isArray(baselineQuery.data?.transport_stops)
      ? baselineQuery.data.transport_stops
      : [];
  }, [baselineQuery.data, dataRequirements.includeBaseline, stopsQuery.data]);
  const districtSummaries = useMemo(
    () => (dataRequirements.includeBaseline && Array.isArray(baselineQuery.data?.district_summaries) ? baselineQuery.data.district_summaries : []),
    [baselineQuery.data, dataRequirements.includeBaseline]
  );
  const analysisUnit = dataRequirements.includeBaseline ? baselineQuery.data?.analysis_unit || "origin" : "origin";

  const originsWithStops = useMemo(
    () =>
      baselineOrigins.map((row) => ({
        ...row,
        ...stopMetrics(row, baselineTransportStops)
      })),
    [baselineOrigins, baselineTransportStops]
  );
  const supplyFacilitiesWithStops = useMemo(
    () =>
      baselineSupplyFacilities.map((row) => ({
        ...row,
        ...stopMetrics(row, baselineTransportStops)
      })),
    [baselineSupplyFacilities, baselineTransportStops]
  );

  const simulatedOrigins = useMemo(() => {
    const rows = Array.isArray(simulation?.simulated_rows)
      ? simulation.simulated_rows
      : Array.isArray(simulation?.origins)
      ? simulation.origins
      : Array.isArray(simulation?.origin_metrics_sample)
      ? simulation.origin_metrics_sample
      : Array.isArray(simulation?.facilities)
      ? simulation.facilities
      : [];
    return rows
      .map(normalizeFacility)
      .filter((row) => Number.isFinite(row.latitude) && Number.isFinite(row.longitude) && row.latitude !== 0 && row.longitude !== 0);
  }, [simulation]);
  const simulationBaselineOrigins = useMemo(() => {
    const rows = Array.isArray(simulation?.baseline_rows)
      ? simulation.baseline_rows
      : Array.isArray(simulation?.origins)
      ? simulation.origins
      : Array.isArray(simulation?.origin_metrics_sample)
      ? simulation.origin_metrics_sample
      : [];
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
      (Array.isArray(simulation?.facilities_added)
        ? simulation.facilities_added
        : Array.isArray(simulation?.added_facilities)
        ? simulation.added_facilities
        : []
      ).filter(
        (row) => Number.isFinite(Number(row.latitude)) && Number.isFinite(Number(row.longitude))
      ),
    [simulation]
  );
  const addedScenarioStops = useMemo(
    () =>
      (Array.isArray(simulation?.transport_stops_added)
        ? simulation.transport_stops_added
        : Array.isArray(simulation?.added_transport_stops)
        ? simulation.added_transport_stops
        : []
      ).filter(
        (row) => Number.isFinite(Number(row.latitude)) && Number.isFinite(Number(row.longitude))
      ),
    [simulation]
  );

  const uploadMutation = useMutation({
    mutationFn: async ({
      mode,
      cityId,
      cityName,
      healthcareFile,
      transportStopsFile,
      populationFile,
      originsFile,
      districtsFile,
      routeStopsFile,
      routeVerticesFile,
      districtSummaryFile,
      onProgress
    }) => {
      const formDataByCity = new FormData();
      if (healthcareFile) formDataByCity.append("healthcare_file", healthcareFile);
      if (transportStopsFile) formDataByCity.append("transport_stops_file", transportStopsFile);
      if (populationFile) formDataByCity.append("population_file", populationFile);
      if (originsFile) formDataByCity.append("origins_file", originsFile);
      if (districtsFile) formDataByCity.append("districts_file", districtsFile);
      if (routeStopsFile) formDataByCity.append("route_stops_file", routeStopsFile);
      if (routeVerticesFile) formDataByCity.append("route_vertices_file", routeVerticesFile);
      if (districtSummaryFile) formDataByCity.append("district_summary_file", districtSummaryFile);
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
    if (import.meta.env.DEV) {
      console.log("Simulation request payload", payload);
    }
    runSimulationScenario({
      cityId: currentCityId,
      payload
    });
    setActiveSimulationLabel(options.customLabel || options.label || t("simulate.scenarioFallback"));
  };

  const apiErrorMessage = stakeholderMessage(uploadMutation.error?.message || baselineQuery.error?.message || "", "");
  const errorKey = apiErrorMessage ? `${activeTab}:${apiErrorMessage}` : "";
  const showApiError = Boolean(apiErrorMessage && dismissedErrorKey !== errorKey);
  const baselineWarnings = stakeholderWarnings(baselineQuery.data?.warnings);

  return (
    <div className={`mc-app-shell mc-header-shell ${activeTab === "simulate" ? "is-simulate-route" : ""}`}>
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
              {baselineQuery.isError && baselineQuery.error?.message ? (
                <div className="mt-1 text-xs text-red-800">{baselineQuery.error.message}</div>
              ) : null}
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
                transportStops={baselineTransportStops}
                baselineSupplyFacilities={supplyFacilitiesWithStops}
                districtSummaries={districtSummaries}
                citySummary={summaryQuery.data?.summary || null}
                baselineResponse={baselineQuery.data}
                summaryResponse={summaryQuery.data}
                rankingResponse={rankingQuery.data}
                overviewData={overviewData}
                backendRecommendations={Array.isArray(recommendationsQuery.data?.recommendations) ? recommendationsQuery.data.recommendations : []}
                analysisUnit={analysisUnit}
                simulation={simulation}
                isLoading={(baselineQuery.isLoading && !baselineQuery.data) || (citiesQuery.isLoading && !cities.length)}
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
                communeGeojson={districtsQuery.data}
                transportStops={baselineTransportStops}
                baselineSupplyFacilities={supplyFacilitiesWithStops}
                addedScenarioFacilities={addedScenarioFacilities}
                addedScenarioStops={addedScenarioStops}
                isLoading={baselineQuery.isLoading || districtsQuery.isLoading}
                activeLayer={activeLayer}
                onLayerChange={setActiveLayer}
                onWhyScore={() => navigate("/analysis")}
                analysisUnit={analysisUnit}
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
                  cities={cities}
                  selectedCityId={currentCityId}
                  analysisUnit={analysisUnit}
                  baselineFacilities={simulationBaselineOrigins.length ? simulationBaselineOrigins : originsWithStops}
                simulatedFacilities={simulatedOrigins}
                baselineSupplyFacilities={supplyFacilitiesWithStops}
                transportStops={baselineTransportStops}
                isLoading={baselineQuery.isLoading || citiesQuery.isLoading}
                onRunSimulation={runScenario}
                simulationPending={simulationPending}
                simulationResult={simulation}
                simulationError={simulationError}
                recommendedPlacements={recommendedPlacementsQuery.data}
                comparisonResult={comparisonResult}
                hasResult={Boolean(simulation)}
                activeSimulationLabel={activeSimulationLabel}
                onNavigate={navigate}
                onCityChange={(cityId) => {
                  setSelectedCityId(cityId);
                  resetSimulation();
                  setActiveSimulationLabel("");
                }}
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
