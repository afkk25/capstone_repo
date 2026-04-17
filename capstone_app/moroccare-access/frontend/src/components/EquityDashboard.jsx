import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const chartPalette = { Inner: "#14b8a6", Middle: "#f59e0b", Outer: "#ef4444" };
const ringBadge = {
  Inner: "bg-emerald-100 text-emerald-700",
  Middle: "bg-amber-100 text-amber-700",
  Outer: "bg-red-100 text-red-700"
};

export default function EquityDashboard({ equity }) {
  if (!equity) {
    return (
      <div className="card h-full p-4 flex items-center justify-center text-slate-500 text-sm">
        Equity visuals will appear after baseline data is loaded.
      </div>
    );
  }
  const rows = ["Inner", "Middle", "Outer"].map((ring) => ({
    ring,
    mean: equity?.ring_summary?.[ring]?.mean ?? 0
  }));
  const distributionRows = (equity.priority_table || []).map((row) => ({
    name: row.facility,
    score: Number(row.baseline_score || 0)
  }));
  const priority = (equity.priority_table || []).slice(0, 5);
  const underservedBars = (equity.priority_table || []).slice(0, 8).map((row) => ({
    facility: row.facility,
    vulnerability: Number(row.vulnerability_score || 0)
  }));

  return (
    <div className="card h-full p-4 overflow-hidden">
      <h2 className="text-lg font-semibold text-slate-800 mb-2">Equity Dashboard</h2>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 h-[calc(100%-2.25rem)] overflow-auto pr-1">
        <div className="min-h-[220px] h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="ring" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="mean">
                {rows.map((entry) => (
                  <Cell key={entry.ring} fill={chartPalette[entry.ring] || "#64748b"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="overflow-auto min-h-[220px] max-h-[260px]">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="py-2">Rank</th>
                <th className="py-2">Facility</th>
                <th className="py-2">Ring</th>
                <th className="py-2">Score</th>
                <th className="py-2">Recommended Action</th>
              </tr>
            </thead>
            <tbody>
              {priority.map((row) => (
                <tr key={row.priority_rank} className="border-b align-top">
                  <td className="py-2">{row.priority_rank}</td>
                  <td className="py-2">{row.facility}</td>
                  <td className="py-2">
                    <span className={`px-2 py-1 rounded text-xs ${ringBadge[row.urban_ring] || "bg-slate-100 text-slate-600"}`}>
                      {row.urban_ring}
                    </span>
                  </td>
                  <td className="py-2">{Number(row.baseline_score).toFixed(3)}</td>
                  <td className="py-2">{row.recommended_action}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="min-h-[220px] h-[260px]">
          <div className="text-sm font-medium text-slate-700 mb-2">Accessibility distribution (top facilities)</div>
          <ResponsiveContainer width="100%" height="85%">
            <BarChart data={distributionRows.slice(0, 20)}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" hide />
              <YAxis />
              <Tooltip />
              <Bar dataKey="score" fill="#006233" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="min-h-[220px] h-[260px]">
          <div className="text-sm font-medium text-slate-700 mb-2">Top underserved facilities</div>
          <ResponsiveContainer width="100%" height="85%">
            <BarChart data={underservedBars}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="facility" hide />
              <YAxis />
              <Tooltip />
              <Bar dataKey="vulnerability" fill="#c8102e" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
