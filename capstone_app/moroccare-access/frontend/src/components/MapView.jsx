import { useEffect } from "react";
import L from "leaflet";
import { CircleMarker, MapContainer, Pane, TileLayer, Tooltip, useMap } from "react-leaflet";
import { LAYER_OPTIONS, mapLayerValue } from "../utils/dashboard";

function getColor(value, layer, deltaMode, delta = 0) {
  if (deltaMode) {
    if (delta > 0.01) return "#2563eb";
    if (delta < -0.01) return "#dc2626";
    return "#64748b";
  }
  if (layer === "travel_time") {
    if (value <= 20) return "#0f766e";
    if (value <= 35) return "#f59e0b";
    return "#b91c1c";
  }
  if (layer === "risk") {
    return Number(value) >= 1 ? "#dc2626" : "#16a34a";
  }
  if (layer === "priority") {
    if (value >= 0.67) return "#7f1d1d";
    if (value >= 0.34) return "#b45309";
    return "#0f766e";
  }
  if (value >= 0.67) return "#15803d";
  if (value >= 0.4) return "#f59e0b";
  return "#b91c1c";
}

function markerRadius(value, layer, selected) {
  if (selected) return 10;
  if (layer === "risk") return 7;
  if (layer === "travel_time") return 7;
  if (layer === "priority") return 8;
  const dynamic = 6 + Math.max(0, Math.min(5, Number(value || 0) * 8));
  return Number.isFinite(dynamic) ? dynamic : 7;
}

function FitBounds({ city, facilities }) {
  const map = useMap();

  useEffect(() => {
    if (!facilities.length) {
      map.setView([city.center_lat, city.center_lon], 11);
      return;
    }
    if (facilities.length === 1) {
      map.setView([facilities[0].latitude, facilities[0].longitude], 12);
      return;
    }
    const bounds = L.latLngBounds(facilities.map((row) => [row.latitude, row.longitude]));
    map.fitBounds(bounds.pad(0.15), { animate: false, maxZoom: 13 });
  }, [city.center_lat, city.center_lon, facilities, map]);

  return null;
}

function layerLegendRows(activeLayer, deltaMode) {
  if (deltaMode) {
    return [
      { color: "#2563eb", label: "Improved vs baseline" },
      { color: "#64748b", label: "Minimal change" },
      { color: "#dc2626", label: "Declined vs baseline" }
    ];
  }
  if (activeLayer === "travel_time") {
    return [
      { color: "#0f766e", label: "Lower travel time" },
      { color: "#f59e0b", label: "Moderate travel time" },
      { color: "#b91c1c", label: "High travel time" }
    ];
  }
  if (activeLayer === "risk") {
    return [
      { color: "#16a34a", label: "Served" },
      { color: "#dc2626", label: "Underserved" }
    ];
  }
  if (activeLayer === "priority") {
    return [
      { color: "#7f1d1d", label: "Critical priority" },
      { color: "#b45309", label: "Moderate priority" },
      { color: "#0f766e", label: "Lower priority" }
    ];
  }
  return [
    { color: "#b91c1c", label: "Lower accessibility" },
    { color: "#f59e0b", label: "Medium accessibility" },
    { color: "#15803d", label: "Higher accessibility" }
  ];
}

// Main map canvas for district markers, hover summary, and click selection.
export default function MapView({
  city,
  facilities = [],
  transportStops = [],
  deltaMode = false,
  isLoading = false,
  activeLayer = "accessibility",
  onLayerChange,
  onSelectPoint,
  selectedDistrictId = null,
  priorityByDistrict = {},
  error = null
}) {
  if (!city) {
    return <div className="panel-card flex h-full items-center justify-center p-6 text-sm text-slate-500">Select a city to display district accessibility.</div>;
  }

  const rows = facilities.map((row) => ({
    ...row,
    priorityScore: Number(priorityByDistrict?.[row.districtName] || 0)
  }));

  const legendRows = layerLegendRows(activeLayer, deltaMode);

  return (
    <div className="panel-card relative h-full overflow-hidden">
      <MapContainer center={[city.center_lat, city.center_lon]} zoom={11} scrollWheelZoom className="h-full w-full" preferCanvas>
        <FitBounds city={city} facilities={rows} />
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

        <Pane name="districts" style={{ zIndex: 450 }}>
          {rows.map((row) => {
            const value = mapLayerValue(row, activeLayer);
            const color = getColor(value, activeLayer, deltaMode, row.delta);
            const selected = selectedDistrictId === row.id;
            return (
              <CircleMarker
                key={row.id}
                center={[row.latitude, row.longitude]}
                radius={markerRadius(value, activeLayer, selected)}
                eventHandlers={{ click: () => onSelectPoint?.(row) }}
                pathOptions={{
                  color: selected ? "#0f172a" : color,
                  fillColor: color,
                  fillOpacity: 0.82,
                  weight: selected ? 3 : 1.2
                }}
              >
                <Tooltip direction="top" offset={[0, -8]} opacity={0.95}>
                  <div className="space-y-0.5 text-xs">
                    <div className="font-semibold">{row.districtName}</div>
                    <div>Accessibility: {row.accessibilityScore.toFixed(3)}</div>
                    <div>Travel time: {row.travelTimeMin.toFixed(1)} min</div>
                    <div>Status: {row.underserved ? "Underserved" : "Served"}</div>
                    <div>Priority score: {row.priorityScore.toFixed(2)}</div>
                  </div>
                </Tooltip>
              </CircleMarker>
            );
          })}
        </Pane>

        <Pane name="stops" style={{ zIndex: 460 }}>
          {(activeLayer === "travel_time" || activeLayer === "priority") &&
            transportStops.map((stop, idx) => (
              <CircleMarker
                key={`stop-${stop.cluster_id ?? idx}`}
                center={[Number(stop.latitude), Number(stop.longitude)]}
                radius={2.8}
                pathOptions={{ color: "#0f766e", fillColor: "#0f766e", fillOpacity: 0.8, weight: 1 }}
              >
                <Tooltip direction="top" offset={[0, -8]} opacity={0.95}>
                  <div className="text-xs">
                    <div className="font-semibold">{stop.stop_name || "Transport stop"}</div>
                    <div>Mode: {String(stop.mode || "N/A")}</div>
                  </div>
                </Tooltip>
              </CircleMarker>
            ))}
        </Pane>
      </MapContainer>

      <div className="pointer-events-none absolute left-3 top-3 z-[900] rounded-xl border border-slate-200 bg-white/95 px-3 py-2 shadow-sm">
        <div className="text-xs font-semibold text-slate-800">Casablanca District Accessibility Map</div>
        <div className="text-[11px] text-slate-600">Click a district for details, hover to inspect metrics.</div>
      </div>

      {onLayerChange ? (
        <div className="absolute right-3 top-3 z-[900] rounded-xl border border-slate-200 bg-white/95 p-2 shadow-sm">
          <label htmlFor="map-layer-select" className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Layer
          </label>
          <select
            id="map-layer-select"
            value={activeLayer}
            onChange={(event) => onLayerChange(event.target.value)}
            className="pointer-events-auto rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-200"
          >
            {LAYER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div className="absolute bottom-3 left-3 z-[900] max-w-xs rounded-xl border border-slate-200 bg-white/95 px-3 py-2 shadow-sm">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Legend</div>
        <div className="mt-1 space-y-1.5">
          {legendRows.map((row) => (
            <div key={row.label} className="flex items-center gap-2 text-xs text-slate-700">
              <span className="h-2.5 w-5 rounded-full" style={{ backgroundColor: row.color }} />
              <span>{row.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="absolute bottom-3 right-3 z-[900] max-w-xs rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-[11px] text-slate-600 shadow-sm">
        Interpretation: red indicates higher planning pressure (low access, high travel time, or higher intervention priority).
      </div>

      {(isLoading || error) && (
        <div className="absolute inset-0 z-[920] flex items-center justify-center bg-white/80 p-4">
          {isLoading ? (
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm">
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-500 border-t-transparent" />
              Loading map data...
            </div>
          ) : (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
          )}
        </div>
      )}
    </div>
  );
}
