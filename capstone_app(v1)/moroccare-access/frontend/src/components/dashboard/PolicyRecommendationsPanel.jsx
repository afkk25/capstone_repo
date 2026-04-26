import Badge from "../ui/Badge";
import SectionCard from "../layout/SectionCard";

export default function PolicyRecommendationsPanel({ rows = [], isLoading = false }) {
  return (
    <SectionCard title="Recommendations & policy actions" subtitle="Prioritized intervention actions for urban healthcare planners">
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, idx) => (
            <div key={idx} className="h-20 animate-pulse rounded-xl bg-slate-100" />
          ))}
        </div>
      ) : !rows.length ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-3 text-sm text-slate-500">No recommendations available for this city.</div>
      ) : (
        <div className="space-y-3">
          {rows.slice(0, 5).map((row) => (
            <article key={`${row.rank}-${row.scenario}`} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-semibold text-slate-800">
                  #{row.rank} {String(row.scenario || "Scenario")}
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone="info">Score {Number(row.score || 0).toFixed(3)}</Badge>
                  <Badge tone="warning">Population impact {Number(row.population_impact || 0).toFixed(0)}</Badge>
                </div>
              </div>
              <p className="mt-2 text-sm text-slate-700">{row.explanation || "No explanation provided."}</p>
              <p className="mt-1 text-xs text-slate-500">
                Interpretation: this intervention balances accessibility gain, equity improvement, and potential population impact.
              </p>
            </article>
          ))}
        </div>
      )}
    </SectionCard>
  );
}
