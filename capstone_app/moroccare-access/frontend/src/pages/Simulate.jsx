import { useMemo, useState } from "react";
import ScenarioCard from "../components/ScenarioCard";
import { useI18n } from "../i18n/I18nProvider";

const CUSTOM_DEFAULTS = {
  stop_density_multiplier: 1.0,
  reduce_nearest_stop_distance_pct: 0.0,
  add_facilities: 0,
  target_area: "Entire city"
};

const TARGET_AREA_OPTIONS = [
  "Entire city",
  "Peripheral districts",
  "Lowest-access districts",
  "High-priority districts"
];

export default function Simulate({
  scenarios,
  selectedScenarioId,
  onSelectScenario,
  onRunSimulation,
  simulationPending,
  selectedScenario,
  activeSimulationLabel,
  bars,
  hasResult,
  onViewMap,
  isSimulated,
  onResetSimulation
}) {
  const { t, isRtl } = useI18n();
  const [mode, setMode] = useState("recommended");
  const [customScenario, setCustomScenario] = useState(CUSTOM_DEFAULTS);

  const customConfigured = useMemo(
    () =>
      customScenario.stop_density_multiplier !== CUSTOM_DEFAULTS.stop_density_multiplier ||
      customScenario.reduce_nearest_stop_distance_pct !== CUSTOM_DEFAULTS.reduce_nearest_stop_distance_pct ||
      customScenario.add_facilities !== CUSTOM_DEFAULTS.add_facilities,
    [customScenario]
  );

  const canRunSimulation = mode === "recommended" ? Boolean(selectedScenarioId) : customConfigured;

  const interventionType = useMemo(() => {
    if (mode === "recommended") return "Recommended package";
    if (customScenario.add_facilities > 0 && customScenario.reduce_nearest_stop_distance_pct > 0) return "Combined service and transit intervention";
    if (customScenario.add_facilities > 0) return "Healthcare facility expansion";
    if (customScenario.reduce_nearest_stop_distance_pct > 0 || customScenario.stop_density_multiplier > 1) return "Transit access improvement";
    return "No intervention selected yet";
  }, [mode, customScenario]);

  const expectedGoal = useMemo(() => {
    if (mode === "recommended") {
      return selectedScenario?.impactHint || "Improve accessibility outcomes in underserved areas.";
    }
    if (customScenario.add_facilities > 0 && customScenario.reduce_nearest_stop_distance_pct > 0) {
      return "Reduce access gaps by improving both facility availability and transit reach.";
    }
    if (customScenario.add_facilities > 0) {
      return "Increase local care availability in neighborhoods with limited service options.";
    }
    if (customScenario.reduce_nearest_stop_distance_pct > 0 || customScenario.stop_density_multiplier > 1) {
      return "Improve public transit access to healthcare services.";
    }
    return "Configure at least one intervention setting to estimate expected impact.";
  }, [mode, selectedScenario, customScenario]);

  const runFromUI = () => {
    if (!canRunSimulation || simulationPending) return;
    if (mode === "recommended") {
      onRunSimulation();
      return;
    }
    onRunSimulation({
      customPayload: {
        stop_density_multiplier: customScenario.stop_density_multiplier,
        reduce_nearest_stop_distance_pct: customScenario.reduce_nearest_stop_distance_pct,
        add_facilities: customScenario.add_facilities
      },
      customLabel: "Custom intervention"
    });
  };

  const runButtonLabel = simulationPending ? t("simulate.runSimulation") : "Run simulation";

  return (
    <section className={`space-y-4 rtl-safe-text ${isRtl ? "text-right" : "text-left"}`}>
      <article className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="font-heading text-[18px] font-bold text-gray-900">{t("simulate.title")}</h2>
        <p className="mt-1 text-[14px] text-gray-700">{t("simulate.subtitle")}</p>
        <p className="mt-2 text-[13px] text-gray-600">
          Follow the workflow: choose a strategy, set where it applies, review the intervention plan, then run simulation.
        </p>
      </article>

      <article className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="mb-4">
          <h3 className="font-heading text-[15px] font-bold text-gray-900">1. Choose strategy type</h3>
          <p className="mt-1 text-[13px] text-gray-600">Select a recommended package or design a custom intervention.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setMode("recommended")}
              className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                mode === "recommended"
                  ? "border-[#0F6E56] bg-[#0F6E56]/10 text-[#0F6E56]"
                  : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
              }`}
            >
              Recommended scenarios
            </button>
            <button
              type="button"
              onClick={() => setMode("custom")}
              className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                mode === "custom"
                  ? "border-[#0F6E56] bg-[#0F6E56]/10 text-[#0F6E56]"
                  : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
              }`}
            >
              Design a custom intervention
            </button>
          </div>
        </div>

        {mode === "recommended" ? (
          <div>
            <h4 className="font-heading text-[14px] font-bold text-gray-900">2. Select a recommended scenario</h4>
            <p className="mt-1 text-[13px] text-gray-600">Choose one scenario to test its projected impact.</p>
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
              {scenarios.map((scenario) => (
                <ScenarioCard
                  key={scenario.id}
                  scenario={scenario}
                  selected={selectedScenarioId === scenario.id}
                  onClick={() => onSelectScenario(scenario.id)}
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4 rounded-xl border border-gray-200 bg-gray-50 p-4">
            <div>
              <h4 className="font-heading text-[14px] font-bold text-gray-900">2. Choose target area</h4>
              <p className="mt-1 text-[13px] text-gray-600">Define where this intervention should be prioritized.</p>
              <label className="mt-2 block text-[13px] text-gray-700">
                <span className="mb-1 block font-medium">Target area for intervention</span>
                <select
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                  value={customScenario.target_area}
                  onChange={(e) => setCustomScenario((prev) => ({ ...prev, target_area: e.target.value }))}
                >
                  {TARGET_AREA_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div>
              <h4 className="font-heading text-[14px] font-bold text-gray-900">3. Configure intervention settings</h4>
              <p className="mt-1 text-[13px] text-gray-600">Adjust planning levers to test potential policy outcomes.</p>
              <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
                <label className="rounded-lg border border-gray-200 bg-white p-3 text-[13px] text-gray-700">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">Increase nearby transit stop coverage</span>
                    <span className="rounded-full bg-[#0F6E56]/10 px-2 py-0.5 text-[11px] font-semibold text-[#0F6E56]">
                      x{customScenario.stop_density_multiplier.toFixed(1)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={2.5}
                    step={0.1}
                    value={customScenario.stop_density_multiplier}
                    onChange={(e) => setCustomScenario((prev) => ({ ...prev, stop_density_multiplier: Number(e.target.value) }))}
                    className="mt-2 w-full accent-[#0F6E56]"
                  />
                  <span className="mt-1 block text-xs text-gray-500">Higher values increase local stop coverage in the simulated policy.</span>
                </label>

                <label className="rounded-lg border border-gray-200 bg-white p-3 text-[13px] text-gray-700">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">Reduce walking distance to transit</span>
                    <span className="rounded-full bg-[#0F6E56]/10 px-2 py-0.5 text-[11px] font-semibold text-[#0F6E56]">
                      {(customScenario.reduce_nearest_stop_distance_pct * 100).toFixed(0)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={0.5}
                    step={0.05}
                    value={customScenario.reduce_nearest_stop_distance_pct}
                    onChange={(e) =>
                      setCustomScenario((prev) => ({ ...prev, reduce_nearest_stop_distance_pct: Number(e.target.value) }))
                    }
                    className="mt-2 w-full accent-[#0F6E56]"
                  />
                  <span className="mt-1 block text-xs text-gray-500">Represents improved first/last-mile access to public transit.</span>
                </label>

                <label className="rounded-lg border border-gray-200 bg-white p-3 text-[13px] text-gray-700 md:col-span-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">Add healthcare facilities</span>
                    <span className="rounded-full bg-[#0F6E56]/10 px-2 py-0.5 text-[11px] font-semibold text-[#0F6E56]">
                      {customScenario.add_facilities}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={5}
                    step={1}
                    value={customScenario.add_facilities}
                    onChange={(e) => setCustomScenario((prev) => ({ ...prev, add_facilities: Number(e.target.value) }))}
                    className="mt-2 w-full accent-[#0F6E56]"
                  />
                  <span className="mt-1 block text-xs text-gray-500">Adds new facilities to increase local service availability in the simulation.</span>
                </label>
              </div>
            </div>
          </div>
        )}

        <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[1fr_auto]">
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <h4 className="font-heading text-[14px] font-bold text-gray-900">4. Review intervention summary</h4>
            <p className="mt-1 text-[13px] text-gray-600">Confirm what you are changing, where it applies, and what outcome you are testing.</p>
            <div className="mt-3 grid grid-cols-1 gap-2 text-[13px] text-gray-700 sm:grid-cols-2">
              <div className="rounded-lg border border-gray-200 bg-white p-3">
                <span className="text-[11px] uppercase tracking-wide text-gray-500">Target area</span>
                <div className="mt-1 font-semibold text-gray-900">
                  {mode === "recommended" ? (selectedScenario ? "Underserved districts (scenario-defined)" : "Not selected") : customScenario.target_area}
                </div>
              </div>
              <div className="rounded-lg border border-gray-200 bg-white p-3">
                <span className="text-[11px] uppercase tracking-wide text-gray-500">Intervention type</span>
                <div className="mt-1 font-semibold text-gray-900">{interventionType}</div>
              </div>
              <div className="rounded-lg border border-gray-200 bg-white p-3 sm:col-span-2">
                <span className="text-[11px] uppercase tracking-wide text-gray-500">Planned changes</span>
                <ul className="mt-1 space-y-1 text-[13px] text-gray-700">
                  <li>• Increase nearby transit stop coverage: {mode === "custom" ? `x${customScenario.stop_density_multiplier.toFixed(1)}` : "Scenario-defined"}</li>
                  <li>
                    • Reduce walking distance to transit:{" "}
                    {mode === "custom" ? `${(customScenario.reduce_nearest_stop_distance_pct * 100).toFixed(0)}%` : "Scenario-defined"}
                  </li>
                  <li>• Add healthcare facilities: {mode === "custom" ? customScenario.add_facilities : "Scenario-defined"}</li>
                </ul>
              </div>
              <div className="rounded-lg border border-gray-200 bg-white p-3 sm:col-span-2">
                <span className="text-[11px] uppercase tracking-wide text-gray-500">Expected goal</span>
                <div className="mt-1 text-[13px] font-medium text-gray-900">{expectedGoal}</div>
              </div>
            </div>
          </div>

          <div className="flex min-w-[220px] flex-col justify-end gap-3">
            <button
              type="button"
              onClick={runFromUI}
              disabled={!canRunSimulation || simulationPending}
              className="inline-flex items-center justify-center rounded-lg bg-[#0F6E56] px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {simulationPending ? (
                <span className="inline-flex items-center gap-2">
                  <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  {runButtonLabel}
                </span>
              ) : (
                runButtonLabel
              )}
            </button>
            {isSimulated ? (
              <button
                type="button"
                onClick={onResetSimulation}
                className="rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
              >
                {t("simulate.resetBaseline")}
              </button>
            ) : null}
          </div>
        </div>
      </article>

      <article className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <h3 className="font-heading text-[18px] font-bold text-gray-900">Simulation results</h3>
        <p className="mt-1 text-[13px] text-gray-600">
          This section is ready to compare before vs after outcomes for accessibility, travel time, equity, and district impact.
        </p>
        {hasResult ? (
          <>
            <p className="mt-2 text-[13px] text-gray-700">
              {(activeSimulationLabel || selectedScenario?.title || t("simulate.scenarioFallback"))} — {t("simulate.projectedImpact")}
            </p>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                <div className="text-[12px] text-gray-500">Before vs after accessibility</div>
                <div className="mt-1 text-[13px] font-semibold text-gray-900">{bars[0]?.display || "—"}</div>
              </div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                <div className="text-[12px] text-gray-500">Travel time change</div>
                <div className="mt-1 text-[13px] font-semibold text-gray-900">See detailed metrics below</div>
              </div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                <div className="text-[12px] text-gray-500">Equity change</div>
                <div className="mt-1 text-[13px] font-semibold text-gray-900">{bars[1]?.display || "—"}</div>
              </div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                <div className="text-[12px] text-gray-500">Affected districts</div>
                <div className="mt-1 text-[13px] font-semibold text-gray-900">Review map impact summary</div>
              </div>
            </div>
            <div className="mt-3 space-y-3">
              {bars.map((row) => (
                <div key={row.label}>
                  <div className="mb-1 flex items-center justify-between gap-2 text-[13px] text-gray-700">
                    <span>{row.label}</span>
                    <span className="num-ltr font-semibold text-gray-900">{row.display}</span>
                  </div>
                  <div className="h-[5px] rounded-full bg-gray-200">
                    <div className="h-[5px] rounded-full bg-[#0F6E56]" style={{ width: `${row.widthPct}%` }} />
                  </div>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={onViewMap}
              className="mt-4 rounded-lg bg-[#0F6E56] px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
            >
              {t("simulate.viewOnMap")}
            </button>
          </>
        ) : (
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-lg border border-dashed border-gray-300 p-3 text-[12px] text-gray-500">Before vs after accessibility</div>
            <div className="rounded-lg border border-dashed border-gray-300 p-3 text-[12px] text-gray-500">Travel time change</div>
            <div className="rounded-lg border border-dashed border-gray-300 p-3 text-[12px] text-gray-500">Equity change</div>
            <div className="rounded-lg border border-dashed border-gray-300 p-3 text-[12px] text-gray-500">Affected districts</div>
          </div>
        )}
      </article>
    </section>
  );
}
