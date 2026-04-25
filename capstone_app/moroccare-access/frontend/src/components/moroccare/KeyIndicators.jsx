import { useI18n } from "../../i18n/I18nProvider";

function IndicatorCard({ label, value, delta, tone = "neutral", helper, basis }) {
  return (
    <article className="mc-kpi-card">
      <span>{label}</span>
      <strong>{value}</strong>
      {delta ? <em className={`mc-delta ${tone}`}>{delta}</em> : null}
      {basis ? <small>{basis}</small> : null}
      {helper ? <p>{helper}</p> : null}
    </article>
  );
}

export default function KeyIndicators({ indicators }) {
  const { t } = useI18n();

  return (
    <section className="mc-card mc-indicators">
      <div className="mc-section-head">
        <h2>{t("overviewPage.baselineIndicators")}</h2>
        <span>{t("overviewPage.currentCityData")}</span>
      </div>
      <div className="mc-kpi-grid">
        {indicators.map((indicator) => (
          <IndicatorCard key={indicator.label} {...indicator} />
        ))}
      </div>
    </section>
  );
}
