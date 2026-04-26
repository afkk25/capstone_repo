export default function SidebarSection({ title, children }) {
  return (
    <div className="space-y-3">
      <div className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</div>
      {children}
    </div>
  );
}

