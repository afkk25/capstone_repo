const navItems = [
  { id: "overview", label: "Overview", icon: "H", path: "/overview" },
  { id: "map", label: "Map", icon: "M", path: "/map" },
  { id: "simulate", label: "Simulation", icon: "S", path: "/simulate" },
  { id: "analysis", label: "Analysis", icon: "A", path: "/analysis" }
];

export default function Sidebar({ activeTab, onNavigate, collapsed, onToggleCollapsed }) {
  return (
    <aside className={`mc-sidebar ${collapsed ? "is-collapsed" : ""}`}>
      <div className="mc-brand">
        <span className="mc-brand-mark">+</span>
        <div>
          <strong>MorocCare</strong>
          <span>Access</span>
        </div>
      </div>

      <button type="button" className="mc-sidebar-toggle" onClick={onToggleCollapsed} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
        {collapsed ? ">" : "<"}
      </button>

      <nav className="mc-nav" aria-label="Primary navigation">
        {navItems.map((item) => {
          const active = activeTab === item.id;
          return (
            <button key={item.id} type="button" className={`mc-nav-item ${active ? "is-active" : ""}`} onClick={() => onNavigate(item.path)}>
              <span className="mc-nav-icon" aria-hidden="true">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="mc-profile">
        <div className="mc-avatar">AM</div>
        <div>
          <strong>Planning Team</strong>
          <span>Decision support</span>
        </div>
      </div>
    </aside>
  );
}
