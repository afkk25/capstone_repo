export default function KpiCard({ title, value, subtitle }) {
  return (
    <div className="kpi-card">
      <p className="kpi-label">{title}</p>
      <p className="kpi-value">{value}</p>
      {subtitle && <p className="kpi-subtitle">{subtitle}</p>}
    </div>
  );
}