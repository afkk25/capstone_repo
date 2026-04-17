import SectionCard from "../layout/SectionCard";

export default function ExplainabilityPanel({ rows = [], isLoading = false }) {
  const maxImportance = Math.max(...rows.map((row) => Number(row.importance || 0)), 1);

  return (
    <SectionCard title="Explainability" subtitle="Top factors influencing accessibility predictions">
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div key={idx} className="h-8 animate-pulse rounded-lg bg-slate-100" />
          ))}
        </div>
      ) : !rows.length ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-3 text-sm text-slate-500">No explainability data available.</div>
      ) : (
        <div className="space-y-2">
          {rows.slice(0, 10).map((row) => {
            const importance = Number(row.importance || 0);
            const widthPct = Math.max(4, Math.min(100, (importance / maxImportance) * 100));
            return (
              <div key={String(row.feature)} className="rounded-lg border border-slate-200 bg-white p-2.5">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <div className="truncate text-sm font-medium text-slate-800">{String(row.feature || "Unknown feature")}</div>
                  <div className="text-xs text-slate-500">{importance.toFixed(4)}</div>
                </div>
                <div className="h-2 rounded-full bg-slate-100">
                  <div className="h-2 rounded-full bg-blue-600" style={{ width: `${widthPct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
      <p className="mt-3 text-xs text-slate-600">
        Interpretation: higher bars indicate factors with stronger influence on predicted accessibility outcomes.
      </p>
    </SectionCard>
  );
}
