import SectionCard from "./layout/SectionCard";

function StatCard({ label, value, hint }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-slate-900">{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

export default function SummaryCards({ summary, isLoading = false }) {
  if (isLoading) {
    return (
      <SectionCard title="City summary" subtitle="High-level accessibility indicators">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, idx) => (
            <div key={idx} className="h-24 animate-pulse rounded-xl bg-slate-100" />
          ))}
        </div>
      </SectionCard>
    );
  }

  return (
    <SectionCard title="City summary" subtitle="High-level accessibility indicators">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Average accessibility" value={summary.averageAccessibility.toFixed(3)} />
        <StatCard label="Avg travel time" value={`${summary.averageTravelTime.toFixed(1)} min`} />
        <StatCard label="Underserved districts" value={`${summary.underservedCount}`} hint={`${summary.underservedPct.toFixed(1)}% of all districts`} />
        <StatCard label="Best district" value={summary.bestDistrict?.districtName || "N/A"} hint={summary.bestDistrict ? `Score: ${summary.bestDistrict.accessibilityScore.toFixed(3)}` : undefined} />
        <StatCard label="Worst district" value={summary.worstDistrict?.districtName || "N/A"} hint={summary.worstDistrict ? `Score: ${summary.worstDistrict.accessibilityScore.toFixed(3)}` : undefined} />
      </div>
    </SectionCard>
  );
}

