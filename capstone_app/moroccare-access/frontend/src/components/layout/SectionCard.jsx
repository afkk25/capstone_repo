export default function SectionCard({ title, subtitle, children, className = "", bodyClassName = "", headerRight = null }) {
  return (
    <section className={`panel-card overflow-hidden rounded-2xl rtl-safe-text ${className}`}>
      {(title || subtitle || headerRight) && (
        <header className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            {title && <h3 className="text-base font-semibold text-slate-900">{title}</h3>}
            {subtitle && <p className="mt-1 text-xs text-slate-500">{subtitle}</p>}
          </div>
          {headerRight}
        </header>
      )}
      <div className={`p-5 ${bodyClassName}`}>{children}</div>
    </section>
  );
}

