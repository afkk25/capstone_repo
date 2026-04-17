import Card from "../ui/Card";
import Badge from "../ui/Badge";
import { Skeleton } from "../ui/Loader";

export default function DistrictDetailsPanel({ selected, isLoading = false }) {
  if (isLoading) {
    return (
      <Card title="District details">
        <Skeleton className="h-24 w-full" />
      </Card>
    );
  }

  const show = Boolean(selected);
  const score = Number(selected?.accessibility_score || selected?.simulated_score || 0);
  const underserved = score < 0.5;

  return (
    <div className={`transition-all duration-200 ${show ? "translate-x-0 opacity-100" : "translate-x-2 opacity-80"}`}>
      <Card title="District details" subtitle={show ? "Selected location metrics" : "Click on the map to inspect details"}>
        {!show ? (
          <div className="text-sm text-slate-500">No district selected yet.</div>
        ) : (
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-xl border border-slate-200 p-2">
              <div className="text-slate-500">District / Ring</div>
              <div className="font-semibold">{selected.urban_ring || selected.district_name || "N/A"}</div>
            </div>
            <div className="rounded-xl border border-slate-200 p-2">
              <div className="text-slate-500">Population</div>
              <div className="font-semibold">{Number(selected.population || 0).toFixed(0)}</div>
            </div>
            <div className="rounded-xl border border-slate-200 p-2">
              <div className="text-slate-500">Travel time</div>
              <div className="font-semibold">{Number(selected.travel_time_min || 0).toFixed(2)} min</div>
            </div>
            <div className="rounded-xl border border-slate-200 p-2">
              <div className="text-slate-500">Accessibility score</div>
              <div className="font-semibold">{score.toFixed(3)}</div>
            </div>
            <div className="rounded-xl border border-slate-200 p-2 col-span-2 flex items-center justify-between">
              <div>
                <div className="text-slate-500">2SFCA score</div>
                <div className="font-semibold">{Number(selected.score_2sfca || 0).toFixed(6)}</div>
              </div>
              <Badge tone={underserved ? "danger" : "success"}>{underserved ? "Underserved" : "Served"}</Badge>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
