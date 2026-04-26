import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import SectionCard from "../layout/SectionCard";

export default function SensitivityPanel({ result = null, isLoading = false, onRun }) {
  const cmp = result?.comparison || {};
  const chartRows = [
    { metric: "Accessibility delta", value: Number(cmp.delta_accessibility || 0) },
    { metric: "Travel time delta", value: Number(cmp.delta_travel_time || 0) },
    { metric: "Inequality delta", value: Number(cmp.inequality_change || 0) },
    { metric: "Improvement %", value: Number(cmp.improvement_percentage || 0) }
  ];

  return (
    <SectionCard
      title="Sensitivity analysis"
      subtitle="How model outputs react to walking speed, waiting time, and transport speed assumptions"
      headerRight={
        <button
          type="button"
          onClick={onRun}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
          disabled={isLoading}
        >
          {isLoading ? "Running..." : "Refresh sensitivity"}
        </button>
      }
    >
      {isLoading ? (
        <div className="h-44 animate-pulse rounded-xl bg-slate-100" />
      ) : !result ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-3 text-sm text-slate-500">
          Run sensitivity analysis to quantify robustness of scenario conclusions.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1.2fr_1fr]">
          <div className="h-56 rounded-xl border border-slate-200 p-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartRows}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="metric" tick={{ fontSize: 11 }} interval={0} angle={-10} textAnchor="end" height={45} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" fill="#2563eb" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
            <div className="font-semibold text-slate-800">Assumptions</div>
            <ul className="mt-2 space-y-1">
              <li>Walking speed: {Number(result?.assumptions?.walking_speed_mps || 0).toFixed(2)} m/s</li>
              <li>Waiting time: {Number(result?.assumptions?.waiting_time_min || 0).toFixed(1)} min</li>
              <li>Transport speed: {Number(result?.assumptions?.transport_speed_kmh || 0).toFixed(1)} km/h</li>
            </ul>
            <div className="mt-3 font-semibold text-slate-800">Derived scenario</div>
            <ul className="mt-1 space-y-1">
              <li>Stop density multiplier: {Number(result?.derived_scenario?.stop_density_multiplier || 0).toFixed(2)}</li>
              <li>Walk reduction: {(Number(result?.derived_scenario?.reduce_nearest_stop_distance_pct || 0) * 100).toFixed(1)}%</li>
            </ul>
          </div>
        </div>
      )}
    </SectionCard>
  );
}
