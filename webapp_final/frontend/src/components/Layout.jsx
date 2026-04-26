// import CitySelector from "./CitySelector.jsx";

// export default function Layout({
//   cities,
//   selectedCityId,
//   onCityChange,
//   activePage,
//   onPageChange,
//   children,
// }) {
//   const navItems = [
//     { id: "overview", label: "Overview" },
//     { id: "map", label: "Map" },
//     { id: "analytics", label: "Analytics" },
//     { id: "simulation", label: "Simulation" },
//     { id: "upload", label: "Upload" },
//   ];

//   return (
//     <div className="app-shell">
//       <header className="app-header">
//         <div className="header-inner">
//           <div className="header-top">
//             <div>
//               <h1 className="brand-title">MorocCare Access</h1>
//               <p className="brand-subtitle">
//                 Upload-based healthcare accessibility decision-support prototype
//               </p>
//             </div>

//             {cities.length > 0 && (
//               <CitySelector
//                 cities={cities}
//                 selectedCityId={selectedCityId}
//                 onChange={onCityChange}
//               />
//             )}
//           </div>

//           <nav className="nav-tabs">
//             {navItems.map((item) => (
//               <button
//                 key={item.id}
//                 onClick={() => onPageChange(item.id)}
//                 className={`nav-tab ${activePage === item.id ? "active" : ""}`}
//               >
//                 {item.label}
//               </button>
//             ))}
//           </nav>
//         </div>
//       </header>

//       <main className="app-main">{children}</main>
//     </div>
//   );
// }
import CitySelector from "./CitySelector.jsx";
import { useI18n } from "../i18n/I18nContext.jsx";

export default function Layout({
  cities,
  selectedCityId,
  onCityChange,
  activePage,
  onPageChange,
  children,
}) {
  const { t, language, setLanguage } = useI18n();

  const navItems = [
    { id: "overview", label: t("overview") },
    { id: "map", label: t("map") },
    { id: "simulation", label: t("simulation") },
    { id: "analytics", label: t("analytics") },
  ];

  return (
    <div className="app-shell">
      <header className="top-header">
        <div className="top-header-inner">
          <div className="top-header-left">
            <button
              className="brand-button"
              onClick={() => onPageChange("overview")}
              type="button"
            >
              {t("appName")}
            </button>
          </div>

          <nav className="top-header-center">
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onPageChange(item.id)}
                className={`top-nav-link ${activePage === item.id ? "active" : ""}`}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div className="top-header-right">
            <button
              type="button"
              className={`header-action-button ${activePage === "upload" ? "active" : ""}`}
              onClick={() => onPageChange("upload")}
            >
              {t("uploadData")}
            </button>

            {cities.length > 0 && (
              <CitySelector
                cities={cities}
                selectedCityId={selectedCityId}
                onChange={onCityChange}
              />
            )}

            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="lang-select"
              aria-label="Language"
            >
              <option value="en">🌐 EN</option>
              <option value="fr">🌐 FR</option>
              <option value="ar">🌐 AR</option>
            </select>
          </div>
        </div>
      </header>

      <main className="app-main">{children}</main>
    </div>
  );
}