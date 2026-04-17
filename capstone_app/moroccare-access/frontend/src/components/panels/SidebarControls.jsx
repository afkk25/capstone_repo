import LayerSelector from "../LayerSelector";
import ScenarioControlsCard from "../dashboard/ScenarioControlsCard";
import Legend from "../Legend";
import SectionCard from "../layout/SectionCard";
import Badge from "../ui/Badge";
import SidebarSection from "./SidebarSection";

export default function SidebarControls({
  leftOpen,
  onToggleOpen,
  activeLayer,
  onLayerChange,
  deltaMode,
  scenario,
  onScenarioChange,
  onRunSimulation,
  onResetSimulation,
  simulationDelta,
  runningSimulation,
  onRunSensitivity,
  runningSensitivity,
  showSimulationSection = true
}) {
  const compact = !leftOpen;
  return (
    <aside
      className={`panel-card h-full overflow-y-auto transition-all ${
        leftOpen ? "w-full p-3 lg:w-[320px]" : "w-full p-3 lg:w-[72px] lg:p-2"
      }`}
    >
      <div className="mb-3 flex items-center justify-between">
        {leftOpen && (
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Control Panel</h2>
        )}
        <button
          type="button"
          onClick={onToggleOpen}
          className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600 transition hover:bg-slate-50"
          aria-label="Toggle sidebar"
        >
          {leftOpen ? "Collapse" : "Expand"}
        </button>
      </div>

      {!compact && (
        <div className="space-y-3">
          <SectionCard title="Overview" subtitle="Scenario setup and map interpretation">
            <div className="space-y-2 text-sm text-slate-600">
              <p>Use simulation controls to test transport and facility interventions before policy decisions.</p>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={deltaMode ? "info" : "neutral"}>{deltaMode ? "Simulation results visible" : "Baseline view"}</Badge>
                {runningSensitivity ? <Badge tone="warning">Sensitivity running...</Badge> : null}
              </div>
            </div>
          </SectionCard>

          <SidebarSection title="Layers">
            <LayerSelector activeLayer={activeLayer} onChange={onLayerChange} />
          </SidebarSection>

          {showSimulationSection ? (
            <SidebarSection title="Simulation">
              <ScenarioControlsCard
                scenario={scenario}
                onChange={onScenarioChange}
                onRun={onRunSimulation}
                onReset={onResetSimulation}
                avgDelta={simulationDelta}
                isRunning={runningSimulation}
                onRunSensitivity={onRunSensitivity}
                isSensitivityRunning={runningSensitivity}
              />
            </SidebarSection>
          ) : null}

          <SidebarSection title="Sensitivity & legend">
            <Legend activeLayer={activeLayer} deltaMode={deltaMode} />
          </SidebarSection>
        </div>
      )}
    </aside>
  );
}

