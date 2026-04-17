import { LAYER_OPTIONS } from "../utils/dashboard";
import SectionCard from "./layout/SectionCard";

export default function LayerSelector({ activeLayer, onChange }) {
  return (
    <SectionCard title="Map layer" subtitle="Choose a metric to color districts">
      <div className="grid grid-cols-1 gap-2">
        {LAYER_OPTIONS.map((option) => {
          const active = option.value === activeLayer;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              className={`rounded-xl border px-3 py-2 text-left transition-all duration-200 ${
                active ? "border-blue-500 bg-blue-50 text-blue-800 shadow-sm" : "border-slate-200 bg-white text-slate-700 hover:-translate-y-0.5 hover:bg-slate-50"
              }`}
            >
              <div className="text-sm font-semibold">{option.label}</div>
              <div className="text-xs text-slate-500">{option.description}</div>
            </button>
          );
        })}
      </div>
    </SectionCard>
  );
}

