import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import Card from "./ui/Card";
import Badge from "./ui/Badge";
import { Skeleton } from "./ui/Loader";

export default function ScenarioComparison({ comparisonData, isLoading = false }) {
  if (isLoading) {
    return (
      <Card title="Scenario comparison">
        <Skeleton className="h-40 w-full" />
      </Card>
    );
  }
  if (!comparisonData?.comparison) {
    return (
      <Card title="Scenario comparison">
        <div className="text-sm text-slate-500">Run a simulation to see baseline vs simulation comparison.</div>
      </Card>
    );
  }

  const cmp = comparisonData.comparison;
  const improvement = Number(cmp.improvement_percentage || 0);
  const tone = improvement >= 0 ? "success" : "danger";
  const bars = [
    { name: "Delta travel time", value: Number(cmp.delta_travel_time || 0) },
    { name: "Delta accessibility", value: Number(cmp.delta_accessibility || 0) },
    { name: "Inequality change", value: Number(cmp.inequality_change || 0) },
  ];

  return (
    <Card title="Scenario comparison" subtitle="Baseline vs simulation impact">
      <div className="grid grid-cols-2 gap-2 text-sm mb-3">
        <div className="rounded border border-slate-200 px-3 py-2">
          <div className="text-slate-500">% improvement</div>
          <div className="font-semibold flex items-center gap-2">
            {improvement.toFixed(2)}%
            <Badge tone={tone}>{improvement >= 0 ? "Improved" : "Declined"}</Badge>
          </div>
        </div>
        <div className="rounded border border-slate-200 px-3 py-2">
          <div className="text-slate-500">Districts improved</div>
          <div className="font-semibold">
            {comparisonData.districts_improved || 0}/{comparisonData.districts_total || 0}
          </div>
        </div>
        <div className="rounded border border-slate-200 px-3 py-2 col-span-2">
          <div className="text-slate-500">Population affected</div>
          <div className="font-semibold">{Number(comparisonData.population_affected || 0).toFixed(0)}</div>
        </div>
      </div>
      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={bars}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" hide />
            <YAxis />
            <Tooltip />
            <Bar dataKey="value" fill="#006233" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
