import { LAYER_OPTIONS } from "../utils/dashboard";
import SectionCard from "./layout/SectionCard";

function ScaleRow({ color, label }) {
  return (
    <div className="flex items-center gap-2 text-xs text-slate-600">
      <span className="h-3 w-6 rounded-full" style={{ backgroundColor: color }} />
      <span>{label}</span>
    </div>
  );
}

export default function Legend({ activeLayer, deltaMode }) {
  const layer = LAYER_OPTIONS.find((item) => item.value === activeLayer);
  const scaleRows = (() => {
    if (deltaMode) {
      return [
        { color: "#1d4ed8", label: "Improved vs baseline" },
        { color: "#6b7280", label: "No major change" },
        { color: "#b91c1c", label: "Declined vs baseline" }
      ];
    }
    if (activeLayer === "travel_time") {
      return [
        { color: "#166534", label: "Shorter travel time" },
        { color: "#f59e0b", label: "Moderate travel time" },
        { color: "#b91c1c", label: "Longer travel time" }
      ];
    }
    if (activeLayer === "risk") {
      return [
        { color: "#22c55e", label: "Served" },
        { color: "#ef4444", label: "Underserved" }
      ];
    }
    if (activeLayer === "priority") {
      return [
        { color: "#7f1d1d", label: "Critical priority" },
        { color: "#b45309", label: "Moderate priority" },
        { color: "#0f766e", label: "Lower priority" }
      ];
    }
    return [
      { color: "#b91c1c", label: "Lower access" },
      { color: "#f59e0b", label: "Moderate access" },
      { color: "#16a34a", label: "Higher access" }
    ];
  })();

  return (
    <SectionCard title="Legend" subtitle={layer?.label || "Current layer"}>
      <div className="space-y-2">
        {scaleRows.map((row) => (
          <ScaleRow key={row.label} color={row.color} label={row.label} />
        ))}
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          Interpretation: red areas indicate planning pressure; green areas indicate stronger accessibility performance.
        </div>
      </div>
    </SectionCard>
  );
}

