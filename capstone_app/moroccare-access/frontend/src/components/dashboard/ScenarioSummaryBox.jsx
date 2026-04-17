import SectionCard from "../layout/SectionCard";

export default function ScenarioSummaryBox({ scenario, comparisonMetrics }) {
  const stopDensity = Number(scenario.stop_density_pct || 0);
  const walkReduction = Number(scenario.walking_reduction_pct || 0);
  const addFacilities = Number(scenario.add_facilities || 0);

  return (
    <SectionCard title="Scenario summary" subtitle="Policy-friendly interpretation of the current intervention setup">
      {!comparisonMetrics ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-3 text-sm text-slate-500">
          Define and run a simulation to generate an impact summary.
        </div>
      ) : (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-slate-700">
          If transit stop density increases by <span className="font-semibold">{stopDensity}%</span>, walking distance to nearest stop is reduced by{" "}
          <span className="font-semibold">{walkReduction}%</span>, and <span className="font-semibold">{addFacilities}</span> new facilities are added, the model estimates{" "}
          <span className="font-semibold">{comparisonMetrics.improvementPct.toFixed(2)}%</span> accessibility improvement with{" "}
          <span className="font-semibold">{comparisonMetrics.districtsImproved}</span> districts improving.
        </div>
      )}
    </SectionCard>
  );
}
