import Card from "../ui/Card";
import Badge from "../ui/Badge";
import { Skeleton } from "../ui/Loader";

export default function InsightsPanel({ rankingRows = [], recommendations = [], comparison = null, loading = false }) {
  if (loading) {
    return (
      <Card title="Insights" className="h-full">
        <div className="space-y-2">
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-4/6" />
          <Skeleton className="h-4 w-3/6" />
        </div>
      </Card>
    );
  }

  const topUnderserved = rankingRows.slice(0, 3);
  const topRecs = recommendations.slice(0, 3);

  return (
    <Card title="Insights" subtitle="Key findings and recommended actions" className="h-full">
      <div className="space-y-4">
        <div>
          <div className="text-sm font-semibold text-slate-800 mb-2">Top underserved districts</div>
          {topUnderserved.length ? (
            <div className="space-y-2">
              {topUnderserved.map((row) => (
                <div key={`${row.rank}-${row.district}`} className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2">
                  <div className="text-sm text-slate-700">
                    #{row.rank} {row.district}
                  </div>
                  <Badge tone="danger">{Number(row.underserved_pct || 0).toFixed(1)}%</Badge>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-slate-500">No ranking data yet.</div>
          )}
        </div>

        {comparison?.comparison && (
          <div className="rounded-xl border border-slate-200 p-3">
            <div className="text-sm font-semibold text-slate-800 mb-1">Scenario impact</div>
            <p className="text-sm text-slate-600">
              Accessibility improved by <span className="font-semibold text-emerald-700">{Number(comparison.comparison.improvement_percentage || 0).toFixed(2)}%</span> with{" "}
              {comparison.districts_improved || 0} districts improved.
            </p>
          </div>
        )}

        <div>
          <div className="text-sm font-semibold text-slate-800 mb-2">Recommendations</div>
          {topRecs.length ? (
            <ul className="space-y-2">
              {topRecs.map((r) => (
                <li key={`${r.rank}-${r.scenario}`} className="text-sm text-slate-700 rounded-xl border border-slate-200 px-3 py-2">
                  <span className="font-medium">#{r.rank} {r.scenario}</span>
                  <div className="text-xs text-slate-500 mt-1">{r.explanation}</div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-sm text-slate-500">No recommendations available.</div>
          )}
        </div>
      </div>
    </Card>
  );
}
