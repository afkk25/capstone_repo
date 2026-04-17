import { useEffect, useState } from "react";

const HC_COLS = ["name", "latitude", "longitude", "geometry"];
const STOP_COLS = ["cluster_id", "stop_name", "Lines", "mode", "longitude", "latitude"];

function DropZone({ label, file, onPick }) {
  return (
    <label className="block cursor-pointer rounded-2xl border-2 border-dashed border-slate-300 p-4 text-sm text-slate-700 transition hover:border-blue-400 hover:bg-blue-50/40">
      <div className="font-medium">{label}</div>
      <div className="mt-1 text-xs text-slate-500">{file ? file.name : "Drop CSV here or click to browse"}</div>
      <input className="hidden" type="file" accept=".csv" onChange={(e) => onPick(e.target.files?.[0] || null)} />
    </label>
  );
}

export default function UploadWizard({ open, onClose, onUploaded, onSubmitUpload, isUploading }) {
  const [step, setStep] = useState(1);
  const [cityId, setCityId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [centerLat, setCenterLat] = useState("");
  const [centerLon, setCenterLon] = useState("");
  const [healthcareFile, setHealthcareFile] = useState(null);
  const [stopsFile, setStopsFile] = useState(null);
  const [status, setStatus] = useState("");
  const [processing, setProcessing] = useState(false);
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    if (!open) {
      setStep(1);
      setStatus("");
      setSummary(null);
      setProcessing(false);
    }
  }, [open]);

  useEffect(() => {
    if (!isUploading && processing && status.startsWith("Processing")) {
      setProcessing(false);
    }
  }, [isUploading, processing, status]);

  if (!open) return null;

  const submit = async () => {
    const form = new FormData();
    form.append("city_id", cityId);
    form.append("display_name", displayName);
    form.append("center_lat", centerLat);
    form.append("center_lon", centerLon);
    form.append("healthcare_file", healthcareFile);
    form.append("transport_stops_file", stopsFile);
    setProcessing(true);
    setStep(3);
    setStatus("Processing and training model...");
    try {
      if (!onSubmitUpload) {
        throw new Error("Upload handler is not available.");
      }
      const res = await onSubmitUpload(form);
      setSummary(res.city_summary || null);
      setStatus("City uploaded successfully.");
      onUploaded?.();
    } catch (error) {
      setStatus(error?.response?.data?.detail || "Upload failed.");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-[1px]">
      <div className="w-full max-w-3xl space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Add City</h2>
            <p className="text-sm text-slate-500">Upload city-level files to generate a new dashboard workspace.</p>
          </div>
          <button className="rounded-lg border border-slate-200 px-2 py-1 text-sm text-slate-500 transition hover:bg-slate-50 hover:text-slate-800" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {[1, 2, 3].map((s) => (
            <span
              key={s}
              className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${
                step === s ? "border-blue-200 bg-blue-50 text-blue-700" : "border-slate-200 bg-slate-50 text-slate-500"
              }`}
            >
              Step {s}
            </span>
          ))}
        </div>

        <div className="max-h-[70vh] overflow-y-auto pr-1">
          {step === 1 && (
            <div className="space-y-4">
              <h3 className="text-base font-semibold text-slate-900">Step 1: City information</h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <input className="rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200" placeholder="city_id" value={cityId} onChange={(e) => setCityId(e.target.value)} />
                <input className="rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200" placeholder="display_name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
                <input className="rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200" placeholder="center_lat" value={centerLat} onChange={(e) => setCenterLat(e.target.value)} />
                <input className="rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200" placeholder="center_lon" value={centerLon} onChange={(e) => setCenterLon(e.target.value)} />
              </div>
              <button className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700" onClick={() => setStep(2)}>
                Next
              </button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <h3 className="text-base font-semibold text-slate-900">Step 2: Upload files</h3>
              <DropZone label="Healthcare facilities CSV" file={healthcareFile} onPick={setHealthcareFile} />
              <div className="text-xs text-slate-600">Required columns: {HC_COLS.join(", ")}</div>
              <DropZone label="Transport stops CSV" file={stopsFile} onPick={setStopsFile} />
              <div className="text-xs text-slate-600">Required columns: {STOP_COLS.join(", ")}</div>
              <div className="flex flex-wrap gap-2">
                <button className="rounded-xl bg-slate-200 px-4 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-300" onClick={() => setStep(1)}>
                  Back
                </button>
                <button className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-60" onClick={submit} disabled={!healthcareFile || !stopsFile || isUploading}>
                  Upload and Process
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <h3 className="text-base font-semibold text-slate-900">Step 3: Processing</h3>
              {processing && (
                <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-500 border-t-transparent" />
                  {status}
                </div>
              )}
              {!processing && (
                <div className="space-y-3 text-sm">
                  <div className="font-medium text-emerald-700">{status}</div>
                  {summary && (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                      <div>City: {summary.display_name} ({summary.city_id})</div>
                      <div>Facilities: {summary.facilities_count}</div>
                    </div>
                  )}
                  <button className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700" onClick={onClose}>
                    Done
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
