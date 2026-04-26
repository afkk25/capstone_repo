export default function RecommendationPanel({ recommendations = [], isLoading = false }) {
  if (isLoading) {
    return <div className="bg-white rounded-xl p-4 shadow-sm animate-pulse h-44" />;
  }

  return (
    <div className="bg-white rounded-xl p-4 shadow-sm">
      <h3 className="text-base font-semibold text-slate-800 mb-3">Top Recommendations</h3>
      {!recommendations.length ? (
        <div className="text-sm text-slate-500">No recommendation data available.</div>
      ) : (
        <div className="space-y-2">
          {recommendations.slice(0, 3).map((r) => (
            <div key={`${r.rank}-${r.scenario}`} className="border border-slate-200 rounded-lg p-2">
              <div className="font-semibold text-slate-800">
                #{r.rank} {r.scenario}
              </div>
              <div className="text-xs text-slate-500">
                score={Number(r.score || 0).toFixed(3)} | inequality={Number(r.inequality_reduction || 0).toFixed(3)} | pop impact=
                {Number(r.population_impact || 0).toFixed(0)}
              </div>
              <div className="text-sm mt-1 text-slate-700">{r.explanation}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
