import { useI18n } from "../i18n/I18nProvider";

export default function CitySelector({ cities, selectedCityId, onChange, isLoadingCities, onOpenUpload }) {
  const { t } = useI18n();

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-slate-700">{t("upload.cityName")}</label>
        <button
          type="button"
          className="text-xs bg-blue-600 text-white px-2.5 py-1.5 rounded-lg hover:bg-blue-700 transition-all duration-200"
          onClick={onOpenUpload}
        >
          {t("upload.addNewCity")}
        </button>
      </div>
      <select
        className="w-full border border-slate-300 rounded-xl p-2.5 disabled:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-200"
        value={selectedCityId || ""}
        onChange={(e) => onChange(e.target.value)}
        disabled={isLoadingCities || !cities.length}
      >
        {cities.map((city) => (
          <option key={city.city_id} value={city.city_id}>
            {city.display_name}
          </option>
        ))}
      </select>
      {isLoadingCities && (
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <span className="inline-block h-3 w-3 rounded-full border-2 border-slate-400 border-t-transparent animate-spin" />
           {t("common.loading")}
        </div>
      )}
    </div>
  );
}
