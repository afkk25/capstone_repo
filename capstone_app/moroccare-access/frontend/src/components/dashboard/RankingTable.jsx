import { useMemo, useState } from "react";
import Badge from "../ui/Badge";
import SectionCard from "../layout/SectionCard";

const SORTERS = {
  rank: (a, b) => Number(a.rank || 0) - Number(b.rank || 0),
  underserved_pct: (a, b) => Number(b.underserved_pct || 0) - Number(a.underserved_pct || 0),
  avg_accessibility_score: (a, b) => Number(a.avg_accessibility_score || 0) - Number(b.avg_accessibility_score || 0)
};

export default function RankingTable({ rows = [], isLoading = false, onSelectDistrict }) {
  const [sortBy, setSortBy] = useState("rank");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return [...rows]
      .filter((row) => {
        if (!normalizedQuery) return true;
        return String(row.district || "")
          .toLowerCase()
          .includes(normalizedQuery);
      })
      .filter((row) => {
        const underservedPct = Number(row.underserved_pct || 0);
        if (filter === "critical") return underservedPct >= 50;
        if (filter === "moderate") return underservedPct >= 25 && underservedPct < 50;
        if (filter === "lower") return underservedPct < 25;
        return true;
      })
      .sort(SORTERS[sortBy] || SORTERS.rank);
  }, [rows, query, filter, sortBy]);

  return (
    <SectionCard
      title="Commune ranking"
      subtitle="Sort, filter, and search underserved communes for targeted intervention planning."
      headerRight={
        <div className="flex items-center gap-1">
          {["rank", "underserved_pct", "avg_accessibility_score"].map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setSortBy(key)}
              className={`rounded-lg border px-2 py-1 text-xs ${sortBy === key ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"}`}
            >
              {key === "rank" ? "Rank" : key === "underserved_pct" ? "Underserved %" : "Avg score"}
            </button>
          ))}
        </div>
      }
    >
      <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-200"
          placeholder="Search commune..."
        />
        <select
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-200"
        >
          <option value="all">All priorities</option>
          <option value="critical">Critical (&gt;=50% underserved)</option>
          <option value="moderate">Moderate (25%-49%)</option>
          <option value="lower">Lower (&lt;25%)</option>
        </select>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, idx) => (
            <div key={idx} className="h-8 animate-pulse rounded-lg bg-slate-100" />
          ))}
        </div>
      ) : !filteredRows.length ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-3 text-sm text-slate-500">No ranking rows match the current search/filter.</div>
      ) : (
        <div className="max-h-[420px] overflow-auto rounded-2xl border border-slate-200">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="sticky top-0 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Rank</th>
                <th className="px-3 py-2">Commune</th>
                <th className="px-3 py-2">Avg score</th>
                <th className="px-3 py-2">Underserved</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.slice(0, 50).map((row) => {
                const underserved = Number(row.underserved_pct || 0);
                const tone = underserved >= 50 ? "danger" : underserved >= 25 ? "warning" : "success";
                return (
                  <tr
                    key={`${row.rank}-${row.district}`}
                    className="border-t border-slate-100 transition hover:bg-slate-50"
                    onClick={() => onSelectDistrict?.(row.district)}
                    role="button"
                  >
                    <td className="px-3 py-2 font-semibold text-slate-700">#{row.rank}</td>
                    <td className="px-3 py-2 text-slate-800">{row.district}</td>
                    <td className="px-3 py-2 text-slate-700">{Number(row.avg_accessibility_score || 0).toFixed(3)}</td>
                    <td className="px-3 py-2">
                      <Badge tone={tone}>{underserved.toFixed(1)}%</Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}
