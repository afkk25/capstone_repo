export default function Card({
  children,
  className = "",
  title,
  subtitle,
  contentClassName = "",
  headerRight = null
}) {
  return (
    <section className={`rounded-2xl border border-slate-200 bg-white shadow-sm ${className}`}>
      {(title || subtitle || headerRight) && (
        <header className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <div>
            {title && <h3 className="text-sm font-semibold text-slate-800">{title}</h3>}
            {subtitle && <p className="mt-1 text-xs text-slate-500">{subtitle}</p>}
          </div>
          {headerRight}
        </header>
      )}
      <div className={`p-4 ${contentClassName}`}>{children}</div>
    </section>
  );
}
