import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import UploadWizard from "../components/UploadWizard";
import MapView from "../components/map/MapView";
import DistrictDetailsPanel from "../components/DistrictDetailsPanel";
import ComparisonPanel from "../components/ComparisonPanel";
import ChartsPanel from "../components/ChartsPanel";
import AppShell from "../components/layout/AppShell";
import TopBar from "../components/layout/TopBar";
import SidebarControls from "../components/panels/SidebarControls";
import ErrorState from "../components/ui/ErrorState";
import KpiCards from "../components/dashboard/KpiCards";
import RankingTable from "../components/dashboard/RankingTable";
import PolicyRecommendationsPanel from "../components/dashboard/PolicyRecommendationsPanel";
import ExplainabilityPanel from "../components/dashboard/ExplainabilityPanel";
import SensitivityPanel from "../components/dashboard/SensitivityPanel";
import ScenarioSummaryBox from "../components/dashboard/ScenarioSummaryBox";
import MethodologyDrawer from "../components/dashboard/MethodologyDrawer";
import AnalyticsTabs from "../components/dashboard/AnalyticsTabs";
import SectionCard from "../components/layout/SectionCard";
import ScenarioControlsCard from "../components/dashboard/ScenarioControlsCard";
import MethodologyContent from "../components/dashboard/MethodologyContent";
import PageContainer from "../components/layout/PageContainer";
import { useNavigate } from "react-router-dom";
import { useToast } from "../hooks/useToast";
import { fetchApiHealth, uploadCityData } from "../api/cities";
import { runSensitivity } from "../api/simulations";
import { useCityData } from "../hooks/useCityData";
import { useSimulation } from "../hooks/useSimulation";
import { comparisonIndicators, dashboardSummary, FALLBACK_CENTER, normalizeFacility, scoreDistribution, topBottomDistricts } from "../utils/adapters";

function ViewModeToggle({ mode, onChange, hasSimulation }) {
  return (
    <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
      <button
        type="button"
        onClick={() => onChange("baseline")}
        className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${mode === "baseline" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-800"}`}
      >
        Baseline
      </button>
      <button
        type="button"
        onClick={() => onChange("simulation")}
        className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${mode === "simulation" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-800"}`}
        disabled={!hasSimulation}
      >
        Simulation
      </button>
    </div>
  );
}

export default function Home({ activePage = "overview" }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { push } = useToast();

  const [selectedCityId, setSelectedCityId] = useState("");
  const [activeLayer, setActiveLayer] = useState("accessibility");
  const [leftOpen, setLeftOpen] = useState(true);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedDistrict, setSelectedDistrict] = useState(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [methodologyOpen, setMethodologyOpen] = useState(false);
  const [analyticsTab, setAnalyticsTab] = useState("ranking");
  const [viewMode, setViewMode] = useState("baseline");
  const [scenario, setScenario] = useState({
    stop_density_pct: 0,
    walking_reduction_pct: 0,
    add_facilities: 0,
    walking_speed_mps: 1.0,
    waiting_time_min: 10,
    transport_speed_kmh: 20
  });
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
    summary,
    rankingRows,
    recommendations,
    explainabilityRows,
    districtsGeoQuery,
    transportStops
  } = useCityData(selectedCityId || "");

  const cities = citiesQuery.data || [];
  const effectiveCityId = selectedCityId || cities[0]?.city_id || "";

  useEffect(() => {
    if (!selectedCityId && cities.length) {
      setSelectedCityId(cities[0].city_id);
    }
  }, [selectedCityId, cities]);

  const setPage = (_pageId, path) => navigate(path);

  const cityConfig = useMemo(() => {
    const city = cities.find((item) => item.city_id === effectiveCityId);
    if (!city) return FALLBACK_CENTER;
    return { center_lat: city.center_lat, center_lon: city.center_lon };
  }, [cities, effectiveCityId]);

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
    setViewMode("simulation");
  });

  const sensitivityMutation = useMutation({
    mutationFn: ({ cityId, params }) => runSensitivity(cityId, params),
    onError: (error) => push(error?.message || "Sensitivity analysis failed.", "error")
  });

  const simulatedDistricts = useMemo(() => {
    if (!simulation?.facilities) return [];
    return simulation.facilities.map(normalizeFacility);
  }, [simulation]);

  const hasSimulation = simulatedDistricts.length > 0;
  const effectiveMode = viewMode === "simulation" && hasSimulation ? "simulation" : "baseline";
  const districts = effectiveMode === "simulation" ? simulatedDistricts : baselineDistricts;
  const summaryForView = effectiveMode === "simulation" ? dashboardSummary(districts) : summary;

  const activeRankingRows = useMemo(() => {
    if (effectiveMode === "simulation" && Array.isArray(comparison?.ranking_after)) {
      return comparison.ranking_after;
    }
    return rankingRows;
  }, [comparison, effectiveMode, rankingRows]);

  const priorityByDistrict = useMemo(() => {
    if (!activeRankingRows.length) return {};
    const maxRank = Math.max(...activeRankingRows.map((row) => Number(row.rank || 1)), 1);
    return activeRankingRows.reduce((acc, row) => {
      const name = String(row.district || "");
      const rank = Number(row.rank || maxRank);
      acc[name] = Math.max(0, Math.min(1, (maxRank - rank + 1) / maxRank));
      return acc;
    }, {});
  }, [activeRankingRows]);

  const chartExtremes = useMemo(() => topBottomDistricts(districts, 5), [districts]);
  const distribution = useMemo(() => scoreDistribution(districts), [districts]);
  const underservedCount = districts.filter((item) => item.underserved === 1).length;
  const servedCount = Math.max(0, districts.length - underservedCount);

  const totalPopulation = districts.reduce((acc, row) => acc + Number(row.population || 0), 0);
  const underservedPopulation = districts.reduce((acc, row) => acc + (row.underserved ? Number(row.population || 0) : 0), 0);
  const criticalDistricts = activeRankingRows.filter((row) => Number(row.underserved_pct || 0) >= 50).length;

  const kpiMetrics = {
    averageTravelTime: Number(summaryForView.averageTravelTime || 0),
    averageAccessibility: Number(summaryForView.averageAccessibility || 0),
    underservedPopulationShare: totalPopulation > 0 ? (underservedPopulation / totalPopulation) * 100 : Number(summaryForView.underservedPct || 0),
    criticalDistricts
  };

  const runScenario = () => {
    if (!effectiveCityId) return;
    const params = {
      stop_density_multiplier: 1 + scenario.stop_density_pct / 100,
      reduce_nearest_stop_distance_pct: scenario.walking_reduction_pct / 100,
      add_facilities: scenario.add_facilities,
      walking_speed_mps: scenario.walking_speed_mps,
      waiting_time_min: scenario.waiting_time_min,
      transport_speed_kmh: scenario.transport_speed_kmh
    };
    simulationMutation.mutate({ cityId: effectiveCityId, params });
  };

  const runSensitivityAnalysis = () => {
    if (!effectiveCityId) return;
    const params = {
      walking_speed_mps: scenario.walking_speed_mps,
      waiting_time_min: scenario.waiting_time_min,
      transport_speed_kmh: scenario.transport_speed_kmh
    };
    sensitivityMutation.mutate({ cityId: effectiveCityId, params });
  };

  const resetScenario = () => {
    setViewMode("baseline");
    setSimulation(null);
    setComparison(null);
  };

  const onSelectDistrict = (district) => {
    setSelectedDistrict(district);
    setDetailsOpen(true);
  };

  const onSelectRankingDistrict = (districtName) => {
    const district = districts.find((row) => String(row.districtName).toLowerCase() === String(districtName).toLowerCase());
    if (!district) return;
    onSelectDistrict(district);
  };

  const hasCity = Boolean(effectiveCityId);
  const mainError =
    baselineQuery.error?.message ||
    districtsGeoQuery.error?.message ||
    summaryQuery.error?.message ||
    rankingQuery.error?.message ||
    recommendationsQuery.error?.message ||
    explainabilityQuery.error?.message ||
    simulationMutation.error?.message ||
    compareMutation.error?.message ||
    sensitivityMutation.error?.message ||
    null;

  const comparisonMetrics = comparisonIndicators(comparison);
  const healthStatus = healthQuery.data?.status === "ok" ? "ok" : healthQuery.isError ? "down" : "unknown";

  const modeToggle = <ViewModeToggle mode={effectiveMode} onChange={setViewMode} hasSimulation={hasSimulation} />;

  const renderOverviewPage = () => (
    <PageContainer
      title="Overview dashboard"
      description="Quick city-level snapshot of healthcare accessibility performance."
      rightSlot={modeToggle}
    >
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="space-y-4 xl:col-span-8">
          <SectionCard title="Accessibility map overview" subtitle="District-level accessibility view for the selected city">
            <div className="h-[58vh] min-h-[420px]">
              <MapView
                city={cityConfig}
                facilities={districts}
                transportStops={transportStops}
                deltaMode={effectiveMode === "simulation"}
                isLoading={baselineQuery.isFetching}
                activeLayer={activeLayer}
                onLayerChange={setActiveLayer}
                onSelectPoint={onSelectDistrict}
                selectedDistrictId={selectedDistrict?.id || null}
                priorityByDistrict={priorityByDistrict}
              />
            </div>
          </SectionCard>
          <ScenarioSummaryBox scenario={scenario} comparisonMetrics={comparisonMetrics} />
        </div>
        <div className="space-y-4 xl:col-span-4">
          <KpiCards metrics={kpiMetrics} modeLabel={effectiveMode === "simulation" ? "Simulation" : "Baseline"} isLoading={summaryQuery.isLoading && effectiveMode === "baseline"} />
          <ComparisonPanel comparisonData={comparison} isLoading={compareMutation.isPending} />
          <SectionCard title="Baseline summary" subtitle="Concise status for policy teams">
            <div className="space-y-2 text-sm text-slate-700">
              <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <span>Selected city</span>
                <span className="font-semibold">{cities.find((city) => city.city_id === effectiveCityId)?.display_name || "-"}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <span>Districts covered</span>
                <span className="font-semibold">{districts.length}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <span>Underserved districts</span>
                <span className="font-semibold">{underservedCount}</span>
              </div>
            </div>
          </SectionCard>
        </div>
      </div>
    </PageContainer>
  );

  const renderMapPage = () => (
    <PageContainer title="Map & exploration" description="Explore districts, layers, and intervention context with a map-first workflow.">
      <div className="grid min-h-0 grid-cols-1 gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="min-h-0">
          <SidebarControls
            leftOpen={leftOpen}
            onToggleOpen={() => setLeftOpen((prev) => !prev)}
            activeLayer={activeLayer}
            onLayerChange={setActiveLayer}
            deltaMode={effectiveMode === "simulation"}
            scenario={scenario}
            onScenarioChange={setScenario}
            onRunSimulation={runScenario}
            onResetSimulation={resetScenario}
            simulationDelta={simulation?.avg_delta ?? null}
            runningSimulation={simulationMutation.isPending || compareMutation.isPending}
            onRunSensitivity={runSensitivityAnalysis}
            runningSensitivity={sensitivityMutation.isPending}
            showSimulationSection={false}
          />
        </div>
        <SectionCard title="District explorer map" subtitle="Click any district to open details and inspect metrics">
          <div className="h-[72vh] min-h-[500px]">
            <MapView
              city={cityConfig}
              facilities={districts}
              transportStops={transportStops}
              deltaMode={effectiveMode === "simulation"}
              isLoading={baselineQuery.isFetching}
              activeLayer={activeLayer}
              onLayerChange={setActiveLayer}
              onSelectPoint={onSelectDistrict}
              selectedDistrictId={selectedDistrict?.id || null}
              priorityByDistrict={priorityByDistrict}
            />
          </div>
        </SectionCard>
      </div>
    </PageContainer>
  );

  const renderSimulationPage = () => (
    <PageContainer
      title="Scenario simulation"
      description="Adjust intervention assumptions and compare model outcomes against baseline."
      rightSlot={modeToggle}
    >
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="space-y-4 xl:col-span-4">
          <ScenarioControlsCard
            scenario={scenario}
            onChange={setScenario}
            onRun={runScenario}
            onReset={resetScenario}
            avgDelta={simulation?.avg_delta ?? null}
            isRunning={simulationMutation.isPending || compareMutation.isPending}
            onRunSensitivity={runSensitivityAnalysis}
            isSensitivityRunning={sensitivityMutation.isPending}
          />
          <KpiCards metrics={kpiMetrics} modeLabel={effectiveMode === "simulation" ? "Simulation" : "Baseline"} isLoading={summaryQuery.isLoading && effectiveMode === "baseline"} />
        </div>
        <div className="space-y-4 xl:col-span-8">
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <ScenarioSummaryBox scenario={scenario} comparisonMetrics={comparisonMetrics} />
            <ComparisonPanel comparisonData={comparison} isLoading={compareMutation.isPending} />
          </div>
          <SectionCard title="Simulation map view" subtitle="Visual comparison of district outcomes under current scenario">
            <div className="h-[58vh] min-h-[420px]">
              <MapView
                city={cityConfig}
                facilities={districts}
                transportStops={transportStops}
                deltaMode={effectiveMode === "simulation"}
                isLoading={baselineQuery.isFetching}
                activeLayer={activeLayer}
                onLayerChange={setActiveLayer}
                onSelectPoint={onSelectDistrict}
                selectedDistrictId={selectedDistrict?.id || null}
                priorityByDistrict={priorityByDistrict}
              />
            </div>
          </SectionCard>
        </div>
      </div>
    </PageContainer>
  );

  const renderAnalyticsPage = () => (
    <PageContainer title="Analytics workspace" description="Rank districts, review interventions, inspect feature importance, and test sensitivity.">
      <AnalyticsTabs activeTab={analyticsTab} onChange={setAnalyticsTab} />

      {analyticsTab === "ranking" ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <RankingTable rows={activeRankingRows} isLoading={rankingQuery.isLoading} onSelectDistrict={onSelectRankingDistrict} />
          <ChartsPanel
            topRows={chartExtremes.top}
            bottomRows={chartExtremes.bottom}
            distributionRows={distribution}
            underservedCount={underservedCount}
            servedCount={servedCount}
          />
        </div>
      ) : null}

      {analyticsTab === "recommendations" ? <PolicyRecommendationsPanel rows={recommendations} isLoading={recommendationsQuery.isLoading} /> : null}

      {analyticsTab === "explainability" ? <ExplainabilityPanel rows={explainabilityRows} isLoading={explainabilityQuery.isLoading} /> : null}

      {analyticsTab === "sensitivity" ? (
        <SensitivityPanel result={sensitivityMutation.data || null} isLoading={sensitivityMutation.isPending} onRun={runSensitivityAnalysis} />
      ) : null}
    </PageContainer>
  );

  const renderMethodologyPage = () => (
    <PageContainer title="Methodology" description="Transparent explanation of modeling assumptions and interpretation guidance.">
      <MethodologyContent />
    </PageContainer>
  );

  const renderDataPage = () => (
    <PageContainer title="Data management" description="Upload and manage city-level input datasets for model execution.">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <SectionCard title="Upload new city data" subtitle="Use guided upload to validate and process CSV files">
          <p className="text-sm text-slate-600">
            Add a new city with healthcare facilities and transport stops CSV files. Processing and model training start automatically after upload.
          </p>
          <button
            type="button"
            onClick={() => setUploadOpen(true)}
            className="mt-4 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            Open upload wizard
          </button>
        </SectionCard>
        <SectionCard title="Current city context" subtitle="Selected city and data availability">
          <div className="space-y-2 text-sm text-slate-700">
            <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <span>Selected city</span>
              <span className="font-semibold">{cities.find((city) => city.city_id === effectiveCityId)?.display_name || "-"}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <span>Baseline rows</span>
              <span className="font-semibold">{baselineDistricts.length}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <span>Transport stops</span>
              <span className="font-semibold">{transportStops.length}</span>
            </div>
          </div>
        </SectionCard>
      </div>
    </PageContainer>
  );

  const renderActivePage = () => {
    if (!hasCity) {
      return (
        <SectionCard title="No city selected" subtitle="Use the header to select or upload city data">
          <div className="text-sm text-slate-500">No city data is currently selected.</div>
        </SectionCard>
      );
    }
    if (activePage === "map") return renderMapPage();
    if (activePage === "simulation") return renderSimulationPage();
    if (activePage === "analytics") return renderAnalyticsPage();
    if (activePage === "methodology") return renderMethodologyPage();
    if (activePage === "data") return renderDataPage();
    return renderOverviewPage();
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
            setViewMode("baseline");
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
      <MethodologyDrawer open={methodologyOpen} onClose={() => setMethodologyOpen(false)} />
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

