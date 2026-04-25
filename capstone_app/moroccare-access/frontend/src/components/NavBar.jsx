import { useI18n } from "../i18n/I18nProvider";
import CornerLanguageSwitcher from "./CornerLanguageSwitcher";

export default function NavBar({ activeTab, onTabChange, cities, selectedCityId, onCityChange, onUploadClick, onAddNewCity }) {
  const { t, isRtl } = useI18n();
  const tabs = [
    { id: "overview", label: t("nav.overview"), path: "/overview" },
    { id: "map", label: t("nav.map"), path: "/map" },
    { id: "simulate", label: t("nav.simulate"), path: "/simulate" },
    { id: "analysis", label: t("nav.analytics"), path: "/analysis" }
  ];

  return (
    <header className="mc-header-nav">
      <div className={`mc-header-inner ${isRtl ? "flex-row-reverse" : ""}`}>
        <div className="min-w-[130px]">
          <span className="block truncate font-heading text-[17px] font-bold text-[#0F6E56]">{t("nav.appName")}</span>
        </div>

        <nav className="mc-header-tabs">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTabChange(tab.path)}
              className={`mc-header-tab ${activeTab === tab.id ? "is-active" : ""}`}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <div className={`mc-header-actions ${isRtl ? "justify-start" : "justify-end"}`}>
          <button
            type="button"
            onClick={onUploadClick}
            className="mc-header-button"
          >
            {t("nav.uploadData")}
          </button>
          <select
            className="mc-header-select"
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
          <CornerLanguageSwitcher inline className="mc-header-language" />
        </div>
      </div>
    </header>
  );
}
