import { useEffect, useMemo, useState } from "react";
import L from "leaflet";
import { CircleMarker, MapContainer, Pane, Popup, TileLayer, useMap } from "react-leaflet";
import { mapLayerValue } from "../utils/dashboard";
import { useI18n } from "../i18n/I18nProvider";
import { sideClass, toLocaleNumber } from "../utils/rtl";
import { FALLBACK_CENTER } from "../utils/adapters";

function haversineMeters(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const earthRadiusMeters = 6371e3;
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const dPhi = toRad(lat2 - lat1);
  const dLambda = toRad(lon2 - lon1);
  const a = Math.sin(dPhi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2;
  return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getAccessibilityColor(value) {
  if (value < 0.33) return "#e74c3c";
  if (value <= 0.66) return "#f39c12";
  return "#2ecc71";
}

function getColor(value, layer) {
  if (layer === "accessibility") {
    return getAccessibilityColor(Number(value || 0));
  }
  if (layer === "travel_time") {
    if (value <= 20) return "#0f766e";
    if (value <= 35) return "#EF9F27";
    return "#D85A30";
  }
  if (value >= 0.67) return "#D85A30";
  if (value >= 0.34) return "#EF9F27";
  return "#3B6D11";
}

function getNearestStopMetrics(row, stops) {
  if (!Array.isArray(stops) || !stops.length) {
    return { nearestStopDistanceMeters: NaN, stopsWithin500m: 0 };
  }
  let nearest = Number.POSITIVE_INFINITY;
  let within500 = 0;
  for (const stop of stops) {
    const lat = Number(stop.latitude);
    const lon = Number(stop.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const distance = haversineMeters(Number(row.latitude), Number(row.longitude), lat, lon);
    if (distance < nearest) nearest = distance;
    if (distance <= 500) within500 += 1;
  }
  return { nearestStopDistanceMeters: Number.isFinite(nearest) ? nearest : NaN, stopsWithin500m: within500 };
}

function FitBounds({ city, facilitiesForBounds }) {
  const map = useMap();

  useEffect(() => {
    if (!facilitiesForBounds.length) {
      map.setView([city.center_lat, city.center_lon], 11);
      return;
    }
    if (facilitiesForBounds.length === 1) {
      map.setView([facilitiesForBounds[0].latitude, facilitiesForBounds[0].longitude], 12);
      return;
    }
    const bounds = L.latLngBounds(facilitiesForBounds.map((row) => [row.latitude, row.longitude]));
    map.fitBounds(bounds.pad(0.15), { animate: false, maxZoom: 13 });
  }, [city.center_lat, city.center_lon, facilitiesForBounds, map]);

  return null;
}

export default function MapView({
  city,
  baselineFacilities = [],
  simulatedFacilities = null,
  transportStops = [],
  baselineSupplyFacilities = [],
  addedScenarioFacilities = [],
  addedScenarioStops = [],
  isLoading = false,
  activeLayer = "accessibility",
  onLayerChange,
  onSelectPoint,
  selectedDistrictId = null,
  priorityByDistrict = {},
  error = null,
  onWhyScore
}) {
  const { t, language, isRtl } = useI18n();
  const [showTransportStops, setShowTransportStops] = useState(true);

  if (!city) {
    return <div className="panel-card flex h-full items-center justify-center p-6 text-sm text-slate-500">{t("map.selectCity")}</div>;
  }

  const baselineRows = useMemo(
    () =>
      baselineFacilities.map((row) => ({
        ...row,
        priorityScore: Number(priorityByDistrict?.[row.districtName] || 0),
        ...getNearestStopMetrics(row, transportStops)
      })),
    [baselineFacilities, priorityByDistrict, transportStops]
  );

  const simulatedRows = useMemo(
    () =>
      (Array.isArray(simulatedFacilities) ? simulatedFacilities : []).map((row) => ({
        ...row,
        priorityScore: Number(priorityByDistrict?.[row.districtName] || 0),
        ...getNearestStopMetrics(row, transportStops)
      })),
    [simulatedFacilities, priorityByDistrict, transportStops]
  );

  const isSimulated = simulatedRows.length > 0;
  const activeRows = isSimulated ? simulatedRows : baselineRows;
  const facilitiesForBounds = activeRows;
  const mapCenter = useMemo(() => {
    const lat = Number(city?.center_lat);
    const lon = Number(city?.center_lon);
    if (Number.isFinite(lat) && Number.isFinite(lon)) return [lat, lon];
    if (baselineFacilities.length) return [baselineFacilities[0].latitude, baselineFacilities[0].longitude];
    return [FALLBACK_CENTER.center_lat, FALLBACK_CENTER.center_lon];
  }, [baselineFacilities, city?.center_lat, city?.center_lon]);

  return (
    <div className="panel-card relative h-full overflow-hidden">
      <MapContainer center={mapCenter} zoom={city.default_zoom || 11} scrollWheelZoom className="h-full w-full mc-leaflet-dark" preferCanvas>
        <FitBounds city={city} facilitiesForBounds={facilitiesForBounds} />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        />

        <Pane name="origins" style={{ zIndex: 450 }}>
          {activeRows.map((row) => {
            const value = mapLayerValue(row, activeLayer);
            const color = getColor(value, activeLayer);
            const selected = selectedDistrictId === row.id;
            return (
              <CircleMarker
                key={`${isSimulated ? "sim-origin" : "base-origin"}-${row.id}`}
                center={[row.latitude, row.longitude]}
                radius={9}
                eventHandlers={{ click: () => onSelectPoint?.(row) }}
                pathOptions={{
                  color: selected ? "#0f172a" : color,
                  fillColor: color,
                  fillOpacity: 0.8,
                  weight: isSimulated ? 2 : selected ? 2.5 : 1.2,
                  dashArray: isSimulated ? "4 3" : undefined
                }}
              >
                <Popup>
                  <div className={`space-y-1 text-xs rtl-safe-text ${isRtl ? "text-right" : "text-left"}`}>
                    <div className="font-bold text-slate-900">{row.originName || row.districtName}</div>
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                      {row.analysisUnit === "facility_proxy" ? "Facility-proxy analysis point" : "Demand origin analysis point"}
                    </div>
                    {isSimulated ? <div className="inline-flex rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700">{t("map.simulated")}</div> : null}
                    <div>
                      {t("map.accessibilityScore")}: <span className="num-ltr">{toLocaleNumber(Number(row.accessibilityScore).toFixed(2), language, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                    <div>
                      {t("map.distanceToStop")}:{" "}
                      <span className="num-ltr">
                        {Number.isFinite(row.nearestStopDistanceMeters) ? `${toLocaleNumber(Math.round(row.nearestStopDistanceMeters), language)}m` : "N/A"}
                      </span>
                    </div>
                    <div>
                      {t("map.stopsWithin500")}: <span className="num-ltr">{toLocaleNumber(row.stopsWithin500m, language, { maximumFractionDigits: 0 })}</span>
                    </div>
                    <button
                      type="button"
                      className={`mt-1 p-0 text-[11px] font-semibold text-blue-700 underline hover:text-blue-800 ${
                        isRtl ? "text-right" : "text-left"
                      }`}
                      onClick={() => onWhyScore?.(row)}
                    >
                      {t("map.whyScore")}
                    </button>
                  </div>
                </Popup>
              </CircleMarker>
            );
          })}
        </Pane>

        <Pane name="stops" style={{ zIndex: 460 }}>
          {showTransportStops &&
            transportStops.map((stop, idx) => (
              <CircleMarker
                key={`stop-${stop.cluster_id ?? idx}`}
                center={[Number(stop.latitude), Number(stop.longitude)]}
                radius={3}
                pathOptions={{ color: "#48cae4", fillColor: "#48cae4", fillOpacity: 0.45, opacity: 0.65, weight: 1 }}
              />
            ))}
        </Pane>

        <Pane name="scenario-added" style={{ zIndex: 470 }}>
          {addedScenarioFacilities.map((facility, idx) => (
            <CircleMarker
              key={`added-facility-${idx}`}
              center={[Number(facility.latitude), Number(facility.longitude)]}
              radius={5}
              pathOptions={{ color: "#5B21B6", fillColor: "#7C3AED", fillOpacity: 0.85, opacity: 0.9, weight: 1.5 }}
            >
              <Popup>
                <div className="text-xs">
                  <div className="font-semibold text-slate-900">Scenario facility</div>
                  <div>{facility.source === "auto" ? "Automatically placed" : "User placed"}</div>
                </div>
              </Popup>
            </CircleMarker>
          ))}
          {addedScenarioStops.map((stop, idx) => (
            <CircleMarker
              key={`added-stop-${idx}`}
              center={[Number(stop.latitude), Number(stop.longitude)]}
              radius={4.2}
              pathOptions={{ color: "#1D4ED8", fillColor: "#2563EB", fillOpacity: 0.85, opacity: 0.9, weight: 1.4 }}
            >
              <Popup>
                <div className="text-xs">
                  <div className="font-semibold text-slate-900">Scenario transport stop</div>
                  <div>{stop.source === "auto" ? "Automatically placed" : "User placed"}</div>
                </div>
              </Popup>
            </CircleMarker>
          ))}
        </Pane>
      </MapContainer>

      {onLayerChange ? (
        <div className={`absolute top-3 z-[900] rounded-xl border border-[var(--border-color)] bg-white/95 p-3 text-[var(--text-primary)] shadow-sm backdrop-blur ${sideClass(isRtl, "right-3", "left-3")}`}>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-secondary)]">{t("map.layers")}</div>
          <label className="mt-2 flex items-center gap-2 text-xs text-[var(--text-primary)]">
            <input type="checkbox" checked={showTransportStops} onChange={(event) => setShowTransportStops(event.target.checked)} />
            {t("map.showStops")}
          </label>

          <div className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-secondary)]">{t("map.colorBy")}</div>
          <div className="mt-1 space-y-1 text-xs text-[var(--text-primary)]">
            <label className="flex items-center gap-2">
              <input type="radio" name="colorBy" value="accessibility" checked={activeLayer === "accessibility"} onChange={(event) => onLayerChange(event.target.value)} />
              {t("map.accessibilityScore")}
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="colorBy" value="travel_time" checked={activeLayer === "travel_time"} onChange={(event) => onLayerChange(event.target.value)} />
              {t("map.travelTime")}
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="colorBy" value="priority" checked={activeLayer === "priority"} onChange={(event) => onLayerChange(event.target.value)} />
              {t("map.priority")}
            </label>
          </div>
        </div>
      ) : null}

      {(isLoading || error) && (
        <div className="absolute inset-0 z-[920] flex items-center justify-center bg-white/80 p-4">
          {isLoading ? (
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm">
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-500 border-t-transparent" />
               {t("map.loadingMap")}
            </div>
          ) : (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
          )}
        </div>
      )}
    </div>
  );
}
