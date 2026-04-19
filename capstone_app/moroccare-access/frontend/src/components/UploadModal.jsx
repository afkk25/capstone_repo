import { useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n/I18nProvider";
import { sideClass } from "../utils/rtl";

function FileDropSlot({ label, helper, file, onFileSelected }) {
  const { t, isRtl } = useI18n();
  const inputRef = useRef(null);

  return (
    <div
      className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-3"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        const dropped = Array.from(event.dataTransfer.files || [])[0];
        if (dropped) onFileSelected(dropped);
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="rtl-safe-text text-[13px] font-medium text-gray-800">{label}</p>
          <p className="rtl-safe-text text-[12px] text-gray-600">{helper}</p>
        </div>
        <button
          type="button"
          className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-[12px] font-semibold text-gray-700"
          onClick={() => inputRef.current?.click()}
        >
          {t("upload.browse")}
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={(event) => {
          const selected = event.target.files?.[0];
          if (selected) onFileSelected(selected);
        }}
      />
      <p className={`mt-2 text-[12px] text-gray-700 ${isRtl ? "text-right" : "text-left"} rtl-safe-text`}>{file ? file.name : t("upload.noFile")}</p>
    </div>
  );
}

export default function UploadModal({ open, cities, defaultCityId, mode: forcedMode, onClose, onUpload, isUploading, onGoToCity }) {
  const { t, isRtl } = useI18n();
  const [mode, setMode] = useState(forcedMode || "update");
  const [cityName, setCityName] = useState("");
  const [cityToUpdate, setCityToUpdate] = useState(defaultCityId || "");
  const [healthcareFile, setHealthcareFile] = useState(null);
  const [transportStopsFile, setTransportStopsFile] = useState(null);
  const [populationFile, setPopulationFile] = useState(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(null);

  const resetForm = () => {
    setCityName("");
    setHealthcareFile(null);
    setTransportStopsFile(null);
    setPopulationFile(null);
    setMode("new");
    setProgress(0);
    setError("");
    setSuccess(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  useEffect(() => {
    setMode(forcedMode || "update");
  }, [forcedMode, open]);

  useEffect(() => {
    if (defaultCityId) setCityToUpdate(defaultCityId);
  }, [defaultCityId, open]);

  if (!open) return null;

  const selectedUpdateCity = cities.find((city) => (city.id || city.city_id) === cityToUpdate);
  const targetCityLabel = mode === "new" ? cityName.trim() || t("upload.newCity") : selectedUpdateCity?.name || selectedUpdateCity?.display_name || t("upload.selectedCity");
  const canSubmit = mode === "new"
    ? Boolean(cityName.trim() && healthcareFile && transportStopsFile)
    : Boolean(cityToUpdate && healthcareFile && transportStopsFile);

  const submit = async () => {
    const submitMode = mode;
    const submitCityName = cityName.trim();
    const submitCityId = cityToUpdate;
    const submitHealthcare = healthcareFile;
    const submitTransport = transportStopsFile;
    const submitPopulation = populationFile;
    resetForm();
    setMode(submitMode);
    setCityName(submitCityName);
    setCityToUpdate(submitCityId);
    setHealthcareFile(submitHealthcare);
    setTransportStopsFile(submitTransport);
    setPopulationFile(submitPopulation);
    if (!canSubmit) return;
    try {
      const result = await onUpload({
        mode: submitMode,
        cityName: submitCityName,
        cityId: submitCityId,
        healthcareFile: submitHealthcare,
        transportStopsFile: submitTransport,
        populationFile: submitPopulation,
        onProgress: setProgress
      });
      const summary = result?.city_summary || {};
      const readyCityId = summary.city_id || cityToUpdate;
      const readyCityName = summary.display_name || cityName.trim() || targetCityLabel;
      setSuccess({ cityId: readyCityId, cityName: readyCityName });
    } catch (uploadError) {
      setError(uploadError?.message || t("upload.uploadFailed"));
    }
  };

  return (
    <div className="fixed inset-0 z-[1400] flex items-center justify-center bg-black/35 p-4">
      <div className={`max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-gray-200 bg-white p-4 shadow-sm rtl-safe-text ${isRtl ? "text-right" : "text-left"}`}>
        <div className="mb-3 flex items-start justify-between gap-2">
          <div>
            <h3 className="font-heading text-[18px] font-bold text-gray-900">{t("upload.title")}</h3>
            <p className="text-[13px] text-gray-600">{t("upload.subtitle")}</p>
          </div>
          <button type="button" onClick={handleClose} className="rounded-lg border border-gray-200 px-2 py-1 text-[13px] text-gray-600">
            {t("common.close")}
          </button>
        </div>

        <div className="mb-3 rounded-xl border border-gray-200 bg-gray-50 p-3">
          <div className="text-[12px] font-heading font-semibold uppercase tracking-wide text-gray-500">{t("upload.mode")}</div>
          <div className="mt-2 flex flex-wrap gap-4 text-[13px] text-gray-700">
            <label className="flex items-center gap-2">
              <input type="radio" checked={mode === "new"} onChange={() => setMode("new")} />
              {t("upload.addNewCity")}
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" checked={mode === "update"} onChange={() => setMode("update")} />
              {t("upload.updateCity")}
            </label>
          </div>
        </div>

        {mode === "new" ? (
          <div className="mb-3 rounded-xl border border-gray-200 bg-white p-3">
            <label className="text-[13px] font-medium text-gray-800">{t("upload.cityName")}</label>
            <input
              type="text"
              value={cityName}
              onChange={(event) => setCityName(event.target.value)}
               placeholder={t("upload.cityPlaceholder")}
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-[13px] text-gray-700"
            />
            <p className="mt-1 text-[12px] text-gray-600">{t("upload.cityNameHelper")}</p>
          </div>
        ) : (
          <div className="mb-3 rounded-xl border border-gray-200 bg-white p-3">
            <label className="text-[13px] font-medium text-gray-800">{t("upload.selectCity")}</label>
            <select
              value={cityToUpdate}
              onChange={(event) => setCityToUpdate(event.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-[13px] text-gray-700"
            >
              {cities.map((city) => (
                <option key={city.id || city.city_id} value={city.id || city.city_id}>
                  {city.name || city.display_name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="space-y-2">
          <FileDropSlot
            label={t("upload.healthcareCsv")}
            helper={t("upload.healthcareCols")}
            file={healthcareFile}
            onFileSelected={setHealthcareFile}
          />
          <FileDropSlot
            label={t("upload.stopsCsv")}
            helper={t("upload.stopsCols")}
            file={transportStopsFile}
            onFileSelected={setTransportStopsFile}
          />
          <FileDropSlot
            label={t("upload.popCsv")}
            helper={t("upload.popCols")}
            file={populationFile}
            onFileSelected={setPopulationFile}
          />
        </div>

        {isUploading ? (
          <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3 text-[13px] text-gray-700">
            <div className="flex items-center gap-2">
              <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-gray-500 border-t-transparent" />
              {t("upload.training", { city: targetCityLabel })}
            </div>
            <div className="mt-2 h-[5px] rounded-full bg-gray-200">
              <div className="h-[5px] rounded-full bg-[#0F6E56]" style={{ width: `${Math.max(progress, 12)}%` }} />
            </div>
          </div>
        ) : null}

        {error ? (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
              <button type="button" onClick={() => setError("")} className={sideClass(isRtl, "ml-2 underline", "mr-2 underline")}>
                {t("common.dismiss")}
              </button>
            </div>
          ) : null}

        {success ? (
          <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
            <div className="font-semibold">{t("upload.done", { city: success.cityName })}</div>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-lg bg-[#0F6E56] px-3 py-2 text-sm font-semibold text-white hover:opacity-90"
                onClick={() => onGoToCity(success.cityId)}
              >
                {t("upload.goToCity", { city: success.cityName })}
              </button>
              <button
                type="button"
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                onClick={resetForm}
              >
                {t("upload.addAnother")}
              </button>
            </div>
          </div>
        ) : null}

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={handleClose} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700">
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit || isUploading}
            className="rounded-lg bg-[#0F6E56] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
          >
            {isUploading ? t("upload.uploading") : t("upload.uploadTrain")}
          </button>
        </div>
      </div>
    </div>
  );
}
