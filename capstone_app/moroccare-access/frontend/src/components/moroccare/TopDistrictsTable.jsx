import { useI18n } from "../../i18n/I18nProvider";

export default function TopDistrictsTable({ districts, title, subtitle }) {
  const { t } = useI18n();

  return (
    <section className="mc-card mc-districts">
      <div className="mc-section-head">
        <h2>{title || t("overviewPage.originRankingTitle")}</h2>
        <span>{subtitle || t("overviewPage.originRankingIntro")}</span>
      </div>
      {districts.length ? (
        <div className="mc-district-list">
          {districts.map((district) => (
          <div className="mc-district-row" key={district.name}>
            <div>
              <span>{district.name}</span>
              <strong>{district.percent}%</strong>
            </div>
            <div className="mc-progress">
              <i style={{ width: `${district.percent}%` }} />
            </div>
          </div>
          ))}
        </div>
      ) : (
        <div className="mc-empty-note">{t("overviewPage.noBaselineRows")}</div>
      )}
    </section>
  );
}
