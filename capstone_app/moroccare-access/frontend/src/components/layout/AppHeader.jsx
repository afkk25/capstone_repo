import { useState } from "react";
import Badge from "../ui/Badge";
import ExportButton from "../ExportButton";

const NAV_ITEMS = [
  { id: "overview", label: "Overview", path: "/overview" },
  { id: "map", label: "Map", path: "/map" },
  { id: "simulation", label: "Simulate", path: "/simulation" },
  { id: "analytics", label: "Analytics", path: "/analytics" }
];

export default function AppHeader({
  cityId,
  cities,
  onCityChange,
  onOpenUpload,
  healthStatus = "unknown",
  healthLoading = false,
  onOpenMethodology,
  activePage = "overview",
  onPageChange
}) {
  const [navOpen, setNavOpen] = useState(false);
  const statusTone = healthStatus === "ok" ? "success" : healthStatus === "down" ? "danger" : "warning";
  const statusLabel = healthLoading ? "Checking API..." : healthStatus === "ok" ? "API online" : "API unavailable";

  const navButtonClass = (id) =>
    `rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
      activePage === id ? "border-blue-200 bg-blue-50 text-blue-700" : "border-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-800"
    }`;

  return (
    <header className="border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur">
      <div className="mx-auto max-w-[1680px] px-3 py-3 sm:px-4 lg:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-[220px] flex-1">
            <h1 className="text-lg font-bold text-slate-900 sm:text-xl">
              Moroc<span className="morocco-accent">C</span>are <span className="morocco-green">Access</span>
            </h1>
            <p className="text-xs text-slate-600 sm:text-sm">Healthcare accessibility planning platform</p>
          </div>

          <div className="hidden flex-wrap items-center gap-2 xl:flex">
            <label className="sr-only" htmlFor="city-selector">
              Select city
            </label>
            <select
              id="city-selector"
              className="min-w-[180px] rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              value={cityId || ""}
              onChange={(event) => onCityChange(event.target.value)}
            >
              {cities.map((city) => (
                <option key={city.city_id} value={city.city_id}>
                  {city.display_name}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={onOpenUpload}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-50"
            >
              + Add city
            </button>
            <button
              type="button"
              onClick={onOpenMethodology}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-50"
              aria-label="Open methodology help"
            >
              ?
            </button>
            <ExportButton cityId={cityId} compact />
            <Badge tone={statusTone}>{statusLabel}</Badge>
          </div>

          <button
            type="button"
            className="inline-flex rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 xl:hidden"
            onClick={() => setNavOpen((prev) => !prev)}
            aria-label="Toggle navigation"
          >
            {navOpen ? "Close menu" : "Open menu"}
          </button>
        </div>

        <div className="mt-3 hidden items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1 xl:flex">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={navButtonClass(item.id)}
              onClick={() => onPageChange?.(item.id, item.path)}
            >
              {item.label}
            </button>
          ))}
        </div>

        {navOpen && (
          <div className="mt-3 space-y-3 rounded-2xl border border-slate-200 bg-white p-3 xl:hidden">
            <div className="grid grid-cols-2 gap-2">
              {NAV_ITEMS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={navButtonClass(item.id)}
                  onClick={() => {
                    onPageChange?.(item.id, item.path);
                    setNavOpen(false);
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div className="space-y-2 border-t border-slate-100 pt-3">
              <label className="sr-only" htmlFor="city-selector-mobile">
                Select city
              </label>
              <select
                id="city-selector-mobile"
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                value={cityId || ""}
                onChange={(event) => onCityChange(event.target.value)}
              >
                {cities.map((city) => (
                  <option key={city.city_id} value={city.city_id}>
                    {city.display_name}
                  </option>
                ))}
              </select>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={onOpenUpload}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
                >
                  + Add city
                </button>
                <button
                  type="button"
                  onClick={onOpenMethodology}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
                >
                  Methodology (?)
                </button>
              </div>
              <div className="flex items-center justify-between gap-2">
                <ExportButton cityId={cityId} compact />
                <Badge tone={statusTone}>{statusLabel}</Badge>
              </div>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}

