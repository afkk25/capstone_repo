export default function ScenarioPanel({ scenario, onChange, onRun, onReset, avgDelta, isRunning }) {
  const update = (field) => (e) => onChange({ ...scenario, [field]: Number(e.target.value) });
  return (
    <div className="card p-4 space-y-3">
      <h2 className="text-lg font-semibold text-slate-800">Scenario Simulation</h2>

      <label className="text-sm text-slate-700 block">
        Transit stop density: <span className="font-semibold">+{scenario.stop_density_pct}%</span>
        <input type="range" min="0" max="40" step="5" value={scenario.stop_density_pct} onChange={update("stop_density_pct")} className="w-full" />
      </label>

      <label className="text-sm text-slate-700 block">
        Walking distance: <span className="font-semibold">-{scenario.walking_reduction_pct}%</span>
        <input
          type="range"
          min="0"
          max="30"
          step="5"
          value={scenario.walking_reduction_pct}
          onChange={update("walking_reduction_pct")}
          className="w-full"
        />
      </label>

      <label className="text-sm text-slate-700 block">
        New facilities: <span className="font-semibold">{scenario.add_facilities}</span>
        <input type="range" min="0" max="3" step="1" value={scenario.add_facilities} onChange={update("add_facilities")} className="w-full" />
      </label>

      <label className="text-sm text-slate-700 block">
        Walking speed: <span className="font-semibold">{scenario.walking_speed_mps} m/s</span>
        <input type="range" min="0.6" max="1.6" step="0.1" value={scenario.walking_speed_mps} onChange={update("walking_speed_mps")} className="w-full" />
      </label>

      <label className="text-sm text-slate-700 block">
        Waiting time: <span className="font-semibold">{scenario.waiting_time_min} min</span>
        <input type="range" min="4" max="18" step="1" value={scenario.waiting_time_min} onChange={update("waiting_time_min")} className="w-full" />
      </label>

      <label className="text-sm text-slate-700 block">
        Transport speed: <span className="font-semibold">{scenario.transport_speed_kmh} km/h</span>
        <input type="range" min="12" max="32" step="1" value={scenario.transport_speed_kmh} onChange={update("transport_speed_kmh")} className="w-full" />
      </label>

      <div className="grid grid-cols-2 gap-2">
        <button className="w-full bg-[#c8102e] text-white rounded-lg p-2 font-medium hover:brightness-95 disabled:opacity-60" onClick={onRun} disabled={isRunning}>
          {isRunning ? "Running..." : "Run simulation"}
        </button>
        <button className="w-full bg-slate-200 text-slate-800 rounded-lg p-2 font-medium hover:bg-slate-300" onClick={onReset}>
          Reset
        </button>
      </div>
      {avgDelta !== null && avgDelta !== undefined && (
        <div className="rounded-lg bg-green-50 border border-green-200 p-2 text-sm">
          <span className="text-green-800 font-semibold">Average delta: {avgDelta.toFixed(4)}</span>
        </div>
      )}
    </div>
  );
}
