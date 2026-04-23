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
  return (
    <section className="mc-card mc-indicators">
      <div className="mc-section-head">
        <h2>Baseline Indicators</h2>
        <span>current city data</span>
      </div>
      <div className="mc-kpi-grid">
        {indicators.map((indicator) => (
          <IndicatorCard key={indicator.label} {...indicator} />
        ))}
      </div>
    </section>
  );
}
