import Badge from "./ui/Badge";
import SectionCard from "./layout/SectionCard";

export default function ComparisonPanel({ comparisonData, isLoading = false }) {
  if (isLoading) {
    return (
      <SectionCard title="Scenario comparison" subtitle="Baseline vs simulated">
        <div className="h-24 animate-pulse rounded-xl bg-slate-100" />
      </SectionCard>
    );
  }

  if (!comparisonData?.comparison) {
    return (
      <SectionCard title="Scenario comparison" subtitle="Baseline vs simulated">
        <div className="rounded-xl border border-dashed border-slate-300 p-3 text-sm text-slate-500">Run a scenario to compare baseline and intervention outputs.</div>
      </SectionCard>
    );
  }

  const cmp = comparisonData.comparison;
  const improvementPct = Number(cmp.improvement_percentage || 0);

  return (
    <SectionCard title="Scenario comparison" subtitle="Baseline vs Simulation">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Baseline</div>
          <div className="mt-2 text-sm font-semibold text-slate-800">Reference scenario</div>
          <div className="mt-3 space-y-2 text-sm text-slate-700">
            <div className="flex items-center justify-between">
              <span>Accessibility delta</span>
              <span className="font-semibold">0.0000</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Travel time delta</span>
              <span className="font-semibold">0.00 min</span>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-blue-600">Simulation</div>
          <div className="mt-2 text-sm font-semibold text-slate-800">Projected intervention outcome</div>
          <div className="mt-3 space-y-2 text-sm text-slate-700">
            <div className="flex items-center justify-between">
              <span>Accessibility delta</span>
              <span className="font-semibold">{Number(cmp.delta_accessibility || 0).toFixed(4)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Travel time delta</span>
              <span className="font-semibold">{Number(cmp.delta_travel_time || 0).toFixed(2)} min</span>
            </div>
          </div>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="text-xs text-slate-500">Districts improved</div>
          <div className="text-lg font-semibold text-slate-900">
            {comparisonData.districts_improved || 0}/{comparisonData.districts_total || 0}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="mb-1 text-xs text-slate-500">Net improvement</div>
          <div className="flex items-center justify-between gap-2">
            <div className="text-lg font-semibold text-slate-900">{improvementPct.toFixed(2)}%</div>
            <Badge tone={improvementPct >= 0 ? "success" : "danger"}>{improvementPct >= 0 ? "Positive trend" : "Negative trend"}</Badge>
          </div>
        </div>
      </div>
    </SectionCard>
  );
}

