// import { useState } from "react";
// import { api } from "../api/client.js";

// export default function UploadPage({ onUploaded }) {
//   const [cityId, setCityId] = useState("");
//   const [cityName, setCityName] = useState("");
//   const [files, setFiles] = useState({});
//   const [result, setResult] = useState(null);
//   const [error, setError] = useState(null);
//   const [loading, setLoading] = useState(false);

//   function setFile(key, file) {
//     setFiles((prev) => ({ ...prev, [key]: file }));
//   }

//   async function handleSubmit(event) {
//     event.preventDefault();

//     setLoading(true);
//     setError(null);
//     setResult(null);

//     const formData = new FormData();
//     formData.append("city_id", cityId);
//     formData.append("city_name", cityName || cityId);

//     const fileMap = {
//       origins_file: files.origins_file,
//       healthcare_file: files.healthcare_file,
//       transport_stops_file: files.transport_stops_file,
//       districts_file: files.districts_file,
//       route_stops_file: files.route_stops_file,
//       route_vertices_file: files.route_vertices_file,
//       district_summary_file: files.district_summary_file,
//       population_file: files.population_file,
//     };

//     Object.entries(fileMap).forEach(([key, file]) => {
//       if (file) formData.append(key, file);
//     });

//     try {
//       const response = await api.uploadCity(formData);
//       setResult(response);
//       onUploaded?.(response.city_id);
//     } catch (err) {
//       setError(err.message);
//     } finally {
//       setLoading(false);
//     }
//   }

//   return (
//     <div className="mx-auto max-w-3xl space-y-6">
//       <section>
//         <h2 className="text-2xl font-bold">Upload city package</h2>
//         <p className="mt-1 text-sm text-slate-500">
//           Upload required baseline files. Route files enable simulation later.
//         </p>
//       </section>

//       <form
//         onSubmit={handleSubmit}
//         className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
//       >
//         <div className="grid gap-4 md:grid-cols-2">
//           <TextInput
//             label="City ID"
//             value={cityId}
//             onChange={setCityId}
//             placeholder="rabat"
//             required
//           />

//           <TextInput
//             label="City name"
//             value={cityName}
//             onChange={setCityName}
//             placeholder="Rabat"
//           />
//         </div>

//         <FileInput
//           label="Origins CSV"
//           description="Required: origin_id, population, x, y. Recommended: total_travel_time_min, accessibility_score."
//           onChange={(file) => setFile("origins_file", file)}
//           required
//         />

//         <FileInput
//           label="Healthcare facilities CSV"
//           description="Required: name, latitude, longitude."
//           onChange={(file) => setFile("healthcare_file", file)}
//           required
//         />

//         <FileInput
//           label="Transport stops CSV"
//           description="Required: stop_name, latitude, longitude, and cluster_id or stop_key."
//           onChange={(file) => setFile("transport_stops_file", file)}
//           required
//         />

//         <FileInput
//           label="Districts / communes CSV"
//           description="Required: geometry WKT and district/district_name/commune/commune_name."
//           onChange={(file) => setFile("districts_file", file)}
//           required
//         />

//         <div className="rounded-2xl bg-slate-50 p-4">
//           <h3 className="font-semibold">Optional simulation files</h3>
//           <p className="mt-1 text-sm text-slate-500">
//             Upload these if you want the city to be simulation-ready.
//           </p>

//           <div className="mt-4 space-y-4">
//             <FileInput
//               label="Route stops CSV"
//               description="Required for simulation: stop_key, x, y."
//               onChange={(file) => setFile("route_stops_file", file)}
//             />

//             <FileInput
//               label="Route vertices CSV"
//               description="Required for simulation: route_id, vertex_order, x, y."
//               onChange={(file) => setFile("route_vertices_file", file)}
//             />
//           </div>
//         </div>

//         <div className="rounded-2xl bg-slate-50 p-4">
//           <h3 className="font-semibold">Optional enrichment files</h3>

//           <div className="mt-4 space-y-4">
//             <FileInput
//               label="District summary CSV"
//               description="Optional precomputed district/commune accessibility summary."
//               onChange={(file) => setFile("district_summary_file", file)}
//             />

//             <FileInput
//               label="Population CSV"
//               description="Optional: latitude, longitude, population_count."
//               onChange={(file) => setFile("population_file", file)}
//             />
//           </div>
//         </div>

//         <button
//           type="submit"
//           disabled={loading || !cityId}
//           className="w-full rounded-xl bg-slate-900 px-4 py-3 font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-400"
//         >
//           {loading ? "Uploading..." : "Upload city package"}
//         </button>
//       </form>

//       {error && (
//         <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
//           {error}
//         </div>
//       )}

//       {result && (
//         <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
//           <h3 className="text-lg font-semibold">Upload result</h3>
//           <div className="mt-3 space-y-2 text-sm">
//             <p>
//               <strong>City:</strong> {result.city_name || result.city_id}
//             </p>
//             <p>
//               <strong>Baseline:</strong>{" "}
//               <span className={result.baseline_ready ? "text-emerald-700" : "text-amber-700"}>
//                 {result.baseline_ready ? "Ready" : "Incomplete"}
//               </span>
//             </p>
//             <p>
//               <strong>Simulation:</strong>{" "}
//               <span className={result.simulation_ready ? "text-emerald-700" : "text-amber-700"}>
//                 {result.simulation_ready ? "Ready" : "Incomplete"}
//               </span>
//             </p>

//             {result.missing_baseline_files?.length > 0 && (
//               <p>
//                 <strong>Missing baseline files:</strong>{" "}
//                 {result.missing_baseline_files.join(", ")}
//               </p>
//             )}

//             {result.missing_simulation_files?.length > 0 && (
//               <p>
//                 <strong>Missing simulation files:</strong>{" "}
//                 {result.missing_simulation_files.join(", ")}
//               </p>
//             )}

//             {result.warnings?.length > 0 && (
//               <div>
//                 <strong>Warnings:</strong>
//                 <ul className="mt-1 list-disc pl-5">
//                   {result.warnings.map((warning, index) => (
//                     <li key={index}>{warning}</li>
//                   ))}
//                 </ul>
//               </div>
//             )}
//           </div>
//         </div>
//       )}
//     </div>
//   );
// }

// function TextInput({ label, value, onChange, placeholder, required }) {
//   return (
//     <label className="block">
//       <span className="text-sm font-medium text-slate-700">{label}</span>
//       <input
//         value={value}
//         onChange={(e) => onChange(e.target.value)}
//         placeholder={placeholder}
//         required={required}
//         className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 shadow-sm"
//       />
//     </label>
//   );
// }

// function FileInput({ label, description, onChange, required }) {
//   return (
//     <label className="block">
//       <span className="text-sm font-medium text-slate-700">
//         {label} {required && <span className="text-red-600">*</span>}
//       </span>
//       <p className="mb-2 mt-1 text-xs text-slate-500">{description}</p>
//       <input
//         type="file"
//         accept=".csv"
//         required={required}
//         onChange={(e) => onChange(e.target.files?.[0] || null)}
//         className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm"
//       />
//     </label>
//   );
// }

import { useState } from "react";
import { api } from "../api/client.js";
import { useI18n } from "../i18n/I18nContext.jsx";

export default function UploadPage({ onUploaded }) {
  const { t } = useI18n();

  const [cityId, setCityId] = useState("");
  const [cityName, setCityName] = useState("");
  const [files, setFiles] = useState({});
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  function setFile(key, file) {
    setFiles((prev) => ({ ...prev, [key]: file }));
  }

  async function handleSubmit(event) {
    event.preventDefault();

    setLoading(true);
    setError(null);
    setResult(null);

    const formData = new FormData();
    formData.append("city_id", cityId);
    formData.append("city_name", cityName || cityId);

    const fileMap = {
      origins_file: files.origins_file,
      healthcare_file: files.healthcare_file,
      transport_stops_file: files.transport_stops_file,
      districts_file: files.districts_file,
      route_stops_file: files.route_stops_file,
      route_vertices_file: files.route_vertices_file,
      district_summary_file: files.district_summary_file,
      population_file: files.population_file,
    };

    Object.entries(fileMap).forEach(([key, file]) => {
      if (file) formData.append(key, file);
    });

    try {
      const response = await api.uploadCity(formData);
      setResult(response);
      onUploaded?.(response.city_id);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="section-space" style={{ maxWidth: "900px", margin: "0 auto" }}>
      <section>
        <h2 className="page-title">{t("uploadTitle")}</h2>
        <p className="page-subtitle">{t("uploadSubtitle")}</p>
      </section>

      <form onSubmit={handleSubmit} className="card card-pad form-grid">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: "16px",
          }}
        >
          <TextInput
            label={t("cityId")}
            value={cityId}
            onChange={setCityId}
            placeholder="rabat"
            required
          />

          <TextInput
            label={t("cityName")}
            value={cityName}
            onChange={setCityName}
            placeholder="Rabat"
          />
        </div>

        <FileInput
          label={t("originsCsv")}
          description={t("originsHelp")}
          onChange={(file) => setFile("origins_file", file)}
          required
        />

        <FileInput
          label={t("healthcareCsv")}
          description={t("healthcareHelp")}
          onChange={(file) => setFile("healthcare_file", file)}
          required
        />

        <FileInput
          label={t("stopsCsv")}
          description={t("stopsHelp")}
          onChange={(file) => setFile("transport_stops_file", file)}
          required
        />

        <FileInput
          label={t("districtsCsv")}
          description={t("districtsHelp")}
          onChange={(file) => setFile("districts_file", file)}
          required
        />

        <div className="card card-pad" style={{ background: "#f8fafc" }}>
          <h3 style={{ marginTop: 0 }}>{t("optionalSimulationFiles")}</h3>
          <p className="page-subtitle" style={{ marginBottom: "16px" }}>
            {t("optionalSimulationHelp")}
          </p>

          <div className="form-grid">
            <FileInput
              label={t("routeStopsCsv")}
              description={t("routeStopsHelp")}
              onChange={(file) => setFile("route_stops_file", file)}
            />

            <FileInput
              label={t("routeVerticesCsv")}
              description={t("routeVerticesHelp")}
              onChange={(file) => setFile("route_vertices_file", file)}
            />
          </div>
        </div>

        <div className="card card-pad" style={{ background: "#f8fafc" }}>
          <h3 style={{ marginTop: 0 }}>{t("optionalEnrichmentFiles")}</h3>

          <div className="form-grid">
            <FileInput
              label={t("districtSummaryCsv")}
              description={t("districtSummaryHelp")}
              onChange={(file) => setFile("district_summary_file", file)}
            />

            <FileInput
              label={t("populationCsv")}
              description={t("populationHelp")}
              onChange={(file) => setFile("population_file", file)}
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading || !cityId}
          className="primary-button"
          style={{ width: "100%" }}
        >
          {loading ? t("uploading") : t("uploadCityPackage")}
        </button>
      </form>

      {error && <div className="error-box">{error}</div>}

      {result && (
        <div className="card card-pad">
          <h3 style={{ marginTop: 0 }}>{t("uploadResult")}</h3>

          <div style={{ display: "grid", gap: "10px", fontSize: "14px" }}>
            <p style={{ margin: 0 }}>
              <strong>{t("city")}:</strong> {result.city_name || result.city_id}
            </p>

            <p style={{ margin: 0 }}>
              <strong>{t("baseline")}:</strong>{" "}
              <span className={`badge ${result.baseline_ready ? "ready" : "partial"}`}>
                {result.baseline_ready ? t("ready") : t("incomplete")}
              </span>
            </p>

            <p style={{ margin: 0 }}>
              <strong>{t("simulation")}:</strong>{" "}
              <span className={`badge ${result.simulation_ready ? "ready" : "partial"}`}>
                {result.simulation_ready ? t("ready") : t("incomplete")}
              </span>
            </p>

            {result.missing_baseline_files?.length > 0 && (
              <p style={{ margin: 0 }}>
                <strong>{t("missingBaselineFiles")}:</strong>{" "}
                {result.missing_baseline_files.join(", ")}
              </p>
            )}

            {result.missing_simulation_files?.length > 0 && (
              <p style={{ margin: 0 }}>
                <strong>{t("missingSimulationFiles")}:</strong>{" "}
                {result.missing_simulation_files.join(", ")}
              </p>
            )}

            {result.warnings?.length > 0 && (
              <div>
                <strong>{t("warnings")}:</strong>
                <ul style={{ marginTop: "6px" }}>
                  {result.warnings.map((warning, index) => (
                    <li key={index}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function TextInput({ label, value, onChange, placeholder, required }) {
  return (
    <label>
      <span className="input-label">
        {label} {required && <span style={{ color: "#dc2626" }}>*</span>}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className="text-input"
      />
    </label>
  );
}

function FileInput({ label, description, onChange, required }) {
  return (
    <label>
      <span className="input-label">
        {label} {required && <span style={{ color: "#dc2626" }}>*</span>}
      </span>
      <p className="input-help">{description}</p>
      <input
        type="file"
        accept=".csv"
        required={required}
        onChange={(e) => onChange(e.target.files?.[0] || null)}
        className="file-input"
      />
    </label>
  );
}