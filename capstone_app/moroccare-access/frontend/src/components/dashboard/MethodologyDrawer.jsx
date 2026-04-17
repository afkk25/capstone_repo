import MethodologyContent from "./MethodologyContent";

export default function MethodologyDrawer({ open, onClose }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[1250] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-[1px]">
      <button type="button" className="absolute inset-0" onClick={onClose} aria-label="Close methodology" />
      <aside className="relative z-10 w-full max-w-3xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-xl font-bold text-slate-900">Methodology & interpretation guide</h2>
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50">
            Close
          </button>
        </div>

        <div className="max-h-[72vh] overflow-y-auto px-5 py-4">
          <MethodologyContent />
        </div>
      </aside>
    </div>
  );
}
