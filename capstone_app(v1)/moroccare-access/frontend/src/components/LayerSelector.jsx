import { LAYER_OPTIONS } from "../utils/dashboard";
import SectionCard from "./layout/SectionCard";
import { useI18n } from "../i18n/I18nProvider";

export default function LayerSelector({ activeLayer, onChange }) {
  const { t, isRtl } = useI18n();
  return (
    <SectionCard title={t("map.layers")} subtitle={t("map.colorBy")}>
      <div className="grid grid-cols-1 gap-2">
        {LAYER_OPTIONS.map((option) => {
          const active = option.value === activeLayer;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              className={`rounded-xl border px-3 py-2 rtl-safe-text ${isRtl ? "text-right" : "text-left"} transition-all duration-200 ${
                active ? "border-blue-500 bg-blue-50 text-blue-800 shadow-sm" : "border-slate-200 bg-white text-slate-700 hover:-translate-y-0.5 hover:bg-slate-50"
              }`}
            >
              <div className="text-sm font-semibold">{t(option.label)}</div>
              <div className="text-xs text-slate-500">{t(option.description)}</div>
            </button>
          );
        })}
      </div>
    </SectionCard>
  );
}

