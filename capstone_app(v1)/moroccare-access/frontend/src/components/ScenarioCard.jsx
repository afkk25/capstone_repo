export default function ScenarioCard({ scenario, selected, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border bg-white p-4 text-start shadow-sm transition rtl-safe-text ${
        selected
          ? "border-[#0F6E56] bg-[#0F6E56]/5 ring-2 ring-[#0F6E56]/30"
          : "border-gray-200 hover:border-[#0F6E56]/50"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
        <span className="text-xl">{scenario.icon}</span>
        <h3 className="font-heading text-[14px] font-bold text-gray-900">{scenario.title}</h3>
        </div>
        {selected ? <span className="rounded-full bg-[#0F6E56] px-2 py-0.5 text-[10px] font-semibold text-white">Selected</span> : null}
      </div>
      <p className="mt-2 text-[13px] text-gray-700">{scenario.description}</p>
      <p className="mt-2 text-[12px] font-semibold uppercase tracking-wide text-[#0F6E56]">{scenario.impactHint}</p>
    </button>
  );
}
