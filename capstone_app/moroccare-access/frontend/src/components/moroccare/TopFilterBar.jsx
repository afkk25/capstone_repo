import { useI18n } from "../../i18n/I18nProvider";

export default function TopFilterBar({
  districts = [],
  selectedDistrict,
  onDistrictChange,
  cities = [],
  selectedCityId,
  onCityChange
}) {
  const { t } = useI18n();

  return (
    <header className="mc-topbar">
      <div className="mc-filter-row">
        <label className="mc-select-wrap">
          <span>{t("overviewPage.district")}</span>
          <select value={selectedDistrict} onChange={(event) => onDistrictChange?.(event.target.value)}>
            <option value="">{t("overviewPage.allDistricts")}</option>
            {districts.map((district) => (
              <option key={district} value={district}>{district}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="mc-top-actions" />
    </header>
  );
}
