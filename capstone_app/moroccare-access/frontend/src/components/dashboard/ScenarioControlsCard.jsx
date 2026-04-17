import { useState } from "react";
import Card from "../ui/Card";
import Button from "../ui/Button";
import Badge from "../ui/Badge";

function SliderField({ label, valueLabel, value, min, max, step, onChange }) {
  return (
    <label className="text-sm text-slate-700 block">
      <div className="flex items-center justify-between mb-1">
        <span>{label}</span>
        <Badge tone="neutral">{valueLabel}</Badge>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={onChange} className="w-full accent-blue-600" />
    </label>
  );
}

export default function ScenarioControlsCard({
  scenario,
  onChange,
  onRun,
  onReset,
  avgDelta,
  isRunning,
  onRunSensitivity,
  isSensitivityRunning = false
}) {
  const [open, setOpen] = useState(true);
  const update = (field) => (e) => onChange({ ...scenario, [field]: Number(e.target.value) });

  return (
    <Card
      title="Simulation"
      subtitle="Tune intervention parameters"
      headerRight={
        <button className="text-xs text-blue-700 hover:text-blue-800 transition-all duration-200" onClick={() => setOpen((v) => !v)} type="button">
          {open ? "Hide controls" : "Show controls"}
        </button>
      }
    >
      <div className="space-y-3">
        {open && (
          <div className="space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Intervention levers</div>
            <SliderField label="Transit stop density" valueLabel={`+${scenario.stop_density_pct}%`} value={scenario.stop_density_pct} min={0} max={40} step={5} onChange={update("stop_density_pct")} />
            <SliderField
              label="Walking distance reduction"
              valueLabel={`-${scenario.walking_reduction_pct}%`}
              value={scenario.walking_reduction_pct}
              min={0}
              max={30}
              step={5}
              onChange={update("walking_reduction_pct")}
            />
            <SliderField label="New facilities" valueLabel={`${scenario.add_facilities}`} value={scenario.add_facilities} min={0} max={3} step={1} onChange={update("add_facilities")} />
            <div className="pt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Model assumptions</div>
            <SliderField label="Walking speed" valueLabel={`${scenario.walking_speed_mps} m/s`} value={scenario.walking_speed_mps} min={0.6} max={1.6} step={0.1} onChange={update("walking_speed_mps")} />
            <SliderField label="Waiting time" valueLabel={`${scenario.waiting_time_min} min`} value={scenario.waiting_time_min} min={4} max={18} step={1} onChange={update("waiting_time_min")} />
            <SliderField
              label="Transport speed"
              valueLabel={`${scenario.transport_speed_kmh} km/h`}
              value={scenario.transport_speed_kmh}
              min={12}
              max={32}
              step={1}
              onChange={update("transport_speed_kmh")}
            />
          </div>
        )}

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Button variant="danger" loading={isRunning} onClick={onRun}>
            {isRunning ? "Running..." : "Run simulation"}
          </Button>
          <Button variant="neutral" onClick={onReset}>
            Reset
          </Button>
        </div>

        <Button variant="outline" loading={isSensitivityRunning} onClick={onRunSensitivity}>
          {isSensitivityRunning ? "Analyzing..." : "Run sensitivity analysis"}
        </Button>

        {avgDelta !== null && avgDelta !== undefined && (
          <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-2 text-sm">
            <span className="text-emerald-800 font-semibold">Average delta: {avgDelta.toFixed(4)}</span>
          </div>
        )}
      </div>
    </Card>
  );
}
