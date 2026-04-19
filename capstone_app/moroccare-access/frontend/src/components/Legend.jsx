import { LAYER_OPTIONS } from "../utils/dashboard";
import SectionCard from "./layout/SectionCard";
import { useI18n } from "../i18n/I18nProvider";

function ScaleRow({ color, label }) {
  return (
    <div className="flex items-center gap-2 text-xs text-slate-600">
      <span className="h-3 w-6 rounded-full" style={{ backgroundColor: color }} />
      <span>{label}</span>
    </div>
  );
}

export default function Legend({ activeLayer, deltaMode }) {
  const { t } = useI18n();
  const layer = LAYER_OPTIONS.find((item) => item.value === activeLayer);
  const scaleRows = (() => {
    if (deltaMode) {
      return [
        { color: "#1d4ed8", label: t("map.improvedBaseline") },
        { color: "#6b7280", label: t("map.noMajorChange") },
        { color: "#b91c1c", label: t("map.declinedBaseline") }
      ];
    }
    if (activeLayer === "travel_time") {
      return [
        { color: "#166534", label: t("map.shorterTravel") },
        { color: "#f59e0b", label: t("map.moderateTravel") },
        { color: "#b91c1c", label: t("map.longerTravel") }
      ];
    }
    if (activeLayer === "risk") {
      return [
        { color: "#22c55e", label: t("details.served") },
        { color: "#ef4444", label: t("details.underserved") }
      ];
    }
    if (activeLayer === "priority") {
      return [
        { color: "#7f1d1d", label: t("map.criticalPriority") },
        { color: "#b45309", label: t("map.moderatePriority") },
        { color: "#0f766e", label: t("map.lowerPriority") }
      ];
    }
    return [
      { color: "#b91c1c", label: t("map.lowerAccess") },
      { color: "#f59e0b", label: t("map.moderateAccessLabel") },
      { color: "#16a34a", label: t("map.higherAccess") }
    ];
  })();

  return (
    <SectionCard title={t("map.layers")} subtitle={layer ? t(layer.label) : t("map.colorBy")}>
      <div className="space-y-2">
        {scaleRows.map((row) => (
          <ScaleRow key={row.label} color={row.color} label={row.label} />
        ))}
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          {t("map.legendNote")}
        </div>
      </div>
    </SectionCard>
  );
}

