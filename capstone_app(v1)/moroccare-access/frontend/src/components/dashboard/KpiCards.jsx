import Badge from "../ui/Badge";
import SectionCard from "../layout/SectionCard";

function IconTravel() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7">
      <circle cx="10" cy="10" r="7" />
      <path d="M10 6v4l2.5 1.5" />
    </svg>
  );
}

function IconAccessibility() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M3 15h14M5 12l2-2 2 1 3-4 3 3" />
    </svg>
  );
}

function IconPopulation() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7">
      <circle cx="7" cy="7" r="2.2" />
      <circle cx="13" cy="8" r="1.8" />
      <path d="M3.5 15c.8-2 2-3 3.5-3s2.7 1 3.5 3M10.5 15c.5-1.4 1.5-2.3 3-2.3 1.1 0 2 .5 2.8 2.3" />
    </svg>
  );
}

function IconAlert() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M10 3 3.5 15h13L10 3Z" />
      <path d="M10 7v4M10 13.3v.2" />
    </svg>
  );
}

function KpiIcon({ tone, children }) {
  const toneClass =
    tone === "danger"
      ? "bg-rose-50 text-rose-700"
      : tone === "warning"
        ? "bg-amber-50 text-amber-700"
        : tone === "success"
          ? "bg-emerald-50 text-emerald-700"
          : "bg-blue-50 text-blue-700";
  return <span className={`inline-flex h-9 w-9 items-center justify-center rounded-xl text-sm ${toneClass}`}>{children}</span>;
}

function KpiCard({ label, value, note, tone = "neutral", icon }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start justify-between gap-2">
        <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
        <KpiIcon tone={tone}>{icon}</KpiIcon>
      </div>
      <div className="mt-2 text-3xl font-bold leading-none text-slate-900">{value}</div>
      <div className="mt-2 flex items-center gap-2">
        <Badge tone={tone}>{tone === "danger" ? "Needs attention" : tone === "success" ? "Positive" : "Context"}</Badge>
        <span className="text-xs text-slate-600">{note}</span>
      </div>
    </div>
  );
}

export default function KpiCards({ metrics, modeLabel, isLoading = false }) {
  if (isLoading) {
    return (
      <SectionCard title="Key performance indicators" subtitle={`Current view: ${modeLabel}`}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, idx) => (
            <div key={idx} className="h-28 animate-pulse rounded-2xl bg-slate-100" />
          ))}
        </div>
      </SectionCard>
    );
  }

  return (
    <SectionCard title="Key performance indicators" subtitle={`Current view: ${modeLabel}`}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <KpiCard
          label="Average travel time"
          value={`${metrics.averageTravelTime.toFixed(1)} min`}
          note="Lower values indicate faster healthcare access."
          tone={metrics.averageTravelTime > 35 ? "danger" : "success"}
          icon={<IconTravel />}
        />
        <KpiCard
          label="Average accessibility score"
          value={metrics.averageAccessibility.toFixed(3)}
          note="Higher score indicates better multimodal access."
          tone={metrics.averageAccessibility < 0.5 ? "danger" : "success"}
          icon={<IconAccessibility />}
        />
        <KpiCard
          label="Underserved population share"
          value={`${metrics.underservedPopulationShare.toFixed(1)}%`}
          note="Estimated share of residents in underserved districts."
          tone={metrics.underservedPopulationShare > 30 ? "danger" : "warning"}
          icon={<IconPopulation />}
        />
        <KpiCard
          label="Critical districts"
          value={`${metrics.criticalDistricts}`}
          note="Districts with severe accessibility pressure."
          tone={metrics.criticalDistricts > 0 ? "warning" : "success"}
          icon={<IconAlert />}
        />
      </div>
      <p className="mt-3 text-xs text-slate-600">
        Interpretation: combine travel time, accessibility score, and underserved share to prioritize interventions with the highest policy impact.
      </p>
    </SectionCard>
  );
}
