import { useI18n } from "../i18n/I18nProvider";

export default function NavBar({ activeTab, onTabChange, cities, selectedCityId, onCityChange, onUploadClick, onAddNewCity }) {
  const { t, isRtl } = useI18n();
  const tabs = [
    { id: "overview", label: t("nav.overview"), path: "/overview" },
    { id: "map", label: t("nav.map"), path: "/map" },
    { id: "simulate", label: t("nav.simulate"), path: "/simulate" },
    { id: "analytics", label: t("nav.analytics"), path: "/analytics" }
  ];

  return (
    <header className="h-14 w-full border-b border-gray-200 bg-white">
      <div className={`mx-auto flex h-full max-w-[1100px] items-center justify-between gap-2 px-4 sm:px-6 ${isRtl ? "flex-row-reverse" : ""}`}>
        <div className="min-w-[130px]">
          <span className="block truncate font-heading text-[17px] font-bold text-[#0F6E56]">{t("nav.appName")}</span>
        </div>

        <nav className="flex min-w-0 flex-1 items-center justify-center gap-1 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTabChange(tab.path)}
              className={`whitespace-nowrap rounded-lg px-3 py-1.5 font-heading text-[12px] font-semibold uppercase tracking-wide transition rtl-safe-text ${
                activeTab === tab.id ? "bg-[#E1F5EE] text-[#0F6E56]" : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <div className={`flex min-w-[250px] items-center gap-2 ${isRtl ? "justify-start" : "justify-end"}`}>
          <button
            type="button"
            onClick={onUploadClick}
            className="whitespace-nowrap rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            {t("nav.uploadData")}
          </button>
          <select
            className="w-[180px] min-w-[150px] max-w-[220px] rounded-lg border border-gray-200 bg-white px-2 py-2 text-sm text-gray-700"
            value={selectedCityId || ""}
            onChange={(event) => {
              if (event.target.value === "__new__") {
                onAddNewCity?.();
                return;
              }
              onCityChange(event.target.value);
            }}
          >
            {cities.map((city) => (
              <option key={city.id || city.city_id} value={city.id || city.city_id}>
                {city.name || city.display_name}
              </option>
            ))}
            <option value="__new__">{t("nav.addNewCity")}</option>
          </select>
        </div>
      </div>
    </header>
  );
}
