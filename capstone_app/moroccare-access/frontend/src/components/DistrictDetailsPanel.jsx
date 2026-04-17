import Badge from "./ui/Badge";
import SectionCard from "./layout/SectionCard";

function interpretationText(row) {
  if (!row) return "";
  if (row.underserved >= 1) {
    return "This district appears underserved and should be prioritized for interventions improving public-transport access to healthcare.";
  }
  return "This district has comparatively stronger access conditions under current assumptions.";
}

function MetricRow({ label, value }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-sm font-semibold text-slate-800">{value}</div>
    </div>
  );
}

export default function DistrictDetailsPanel({ district, open, onClose }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[1200]">
      <button type="button" className="absolute inset-0 bg-slate-900/45 backdrop-blur-[1px]" aria-label="Close district details" onClick={onClose} />
      <aside className="absolute bottom-0 right-0 top-0 w-full max-w-lg p-3 sm:p-4">
        <SectionCard
          title="District details"
          subtitle={district ? "Selected district indicators" : "Select a district on the map"}
          className="flex h-full flex-col overflow-hidden shadow-xl"
          bodyClassName="space-y-4 overflow-y-auto"
          headerRight={
            <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50">
              Close
            </button>
          }
        >
          {!district ? (
            <div className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">No district selected.</div>
          ) : (
            <>
              <section className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Overview</div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="text-xs text-slate-500">District</div>
                  <div className="text-lg font-semibold text-slate-900">{district.districtName}</div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Badge tone={district.underserved ? "danger" : "success"}>{district.underserved ? "Underserved" : "Served"}</Badge>
                    <Badge tone="neutral">{district.urbanRing}</Badge>
                  </div>
                </div>
              </section>

              <section className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Metrics</div>
                <div className="grid grid-cols-2 gap-2">
                  <MetricRow label="Accessibility score" value={district.accessibilityScore.toFixed(3)} />
                  <MetricRow label="Travel time" value={`${district.travelTimeMin.toFixed(1)} min`} />
                  <MetricRow label="2SFCA score" value={district.score2sfca.toFixed(6)} />
                  <MetricRow label="Population" value={district.population.toFixed(0)} />
                  <MetricRow label="Baseline score" value={district.baselineScore.toFixed(3)} />
                  <MetricRow label="Scenario delta" value={district.delta >= 0 ? `+${district.delta.toFixed(3)}` : district.delta.toFixed(3)} />
                </div>
              </section>

              <section className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Insights</div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">{interpretationText(district)}</div>
              </section>
              <div className="h-px bg-slate-100" />
              <div className="text-xs text-slate-500">Tip: use ranking and explainability tabs to compare this district against others.</div>
            </>
          )}
        </SectionCard>
      </aside>
    </div>
  );
}

