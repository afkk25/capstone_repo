export default function TopDistrictsTable({ districts, title = "Priority Districts", subtitle = "lowest accessibility first" }) {
  return (
    <section className="mc-card mc-districts">
      <div className="mc-section-head">
        <h2>{title}</h2>
        <span>{subtitle}</span>
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
        <div className="mc-empty-note">District ranking is available when origin rows include district names and accessibility scores.</div>
      )}
    </section>
  );
}
