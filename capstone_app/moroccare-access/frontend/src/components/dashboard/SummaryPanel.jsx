import MetricCard from "./MetricCard";

export default function SummaryPanel({ summary, isLoading = false }) {
  const cards = [
    {
      key: "travel",
      title: "Average travel time",
      value: `${Number(summary?.avg_travel_time || 0).toFixed(2)} min`,
      tone: "warning",
      trend: Number(summary?.avg_travel_time || 0) > 45 ? "High" : "Acceptable",
      helper: "Lower is better"
    },
    {
      key: "above45",
      title: "Above 45 minutes",
      value: `${Number(summary?.pct_above_45min || 0).toFixed(1)}%`,
      tone: Number(summary?.pct_above_45min || 0) > 30 ? "danger" : "success",
      trend: `${Number(summary?.pct_above_45min || 0).toFixed(1)}%`,
      helper: "Population share"
    },
    {
      key: "under",
      title: "Underserved population",
      value: Number(summary?.underserved_population || 0).toFixed(0),
      tone: "danger",
      trend: "Priority",
      helper: "Needs intervention"
    },
    {
      key: "score",
      title: "Avg accessibility score",
      value: Number(summary?.avg_accessibility_score || 0).toFixed(3),
      tone: "info",
      trend: Number(summary?.avg_accessibility_score || 0) >= 0.5 ? "Improving" : "Low",
      helper: "Higher is better"
    }
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
      {cards.map((c) => (
        <MetricCard key={c.key} title={c.title} value={c.value} tone={c.tone} trend={c.trend} helper={c.helper} loading={isLoading} />
      ))}
    </div>
  );
}
