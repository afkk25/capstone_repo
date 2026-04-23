export default function RecommendationsCard({ recommendations, title = "Recommended Planning Actions", subtitle = "generated from current model outputs" }) {
  return (
    <section className="mc-card mc-recommendations">
      <div className="mc-section-head">
        <h2>{title}</h2>
        {subtitle ? <span>{subtitle}</span> : null}
      </div>
      <ul>
        {recommendations.map((item) => (
          <li key={item}>
            <span />
            <p>{item}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
