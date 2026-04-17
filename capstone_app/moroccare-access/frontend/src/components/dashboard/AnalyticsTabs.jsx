const TABS = [
  { id: "ranking", label: "District ranking" },
  { id: "recommendations", label: "Recommendations" },
  { id: "explainability", label: "Explainability" },
  { id: "sensitivity", label: "Sensitivity" }
];

export default function AnalyticsTabs({ activeTab, onChange }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
      <div className="flex flex-wrap gap-1 sm:gap-2">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`rounded-xl border px-3 py-2 text-sm font-medium transition-all duration-200 ${
              activeTab === tab.id
                ? "border-blue-200 bg-blue-50 text-blue-700 shadow-sm"
                : "border-transparent bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}
