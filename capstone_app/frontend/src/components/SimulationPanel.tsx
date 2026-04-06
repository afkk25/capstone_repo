import { FormEvent, useState } from "react";
import { runSimulation } from "../api";
import { Hospital } from "../types";

type Props = {
  onResult: (hospitals: Hospital[]) => void;
};

export default function SimulationPanel({ onResult }: Props) {
  const [increaseStopDensityPercent, setIncreaseStopDensityPercent] = useState<number>(20);
  const [increaseFacilities, setIncreaseFacilities] = useState<number>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const response = await runSimulation({
        increase_stop_density: increaseStopDensityPercent / 100,
        increase_facilities: increaseFacilities
      });
      onResult(response.hospitals);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Simulation failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-lg font-semibold text-slate-800">Simulation Panel</h2>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="mb-1 block text-sm text-slate-600">
            Increase stop density (%)
          </label>
          <input
            type="number"
            min={0}
            value={increaseStopDensityPercent}
            onChange={(event) => setIncreaseStopDensityPercent(Number(event.target.value))}
            className="w-full rounded border border-slate-300 px-3 py-2"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm text-slate-600">
            Increase number of facilities
          </label>
          <input
            type="number"
            min={0}
            value={increaseFacilities}
            onChange={(event) => setIncreaseFacilities(Number(event.target.value))}
            className="w-full rounded border border-slate-300 px-3 py-2"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {loading ? "Running..." : "Run Simulation"}
        </button>
      </form>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </div>
  );
}

