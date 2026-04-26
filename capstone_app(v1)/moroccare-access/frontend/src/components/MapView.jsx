import { useEffect, useMemo, useState } from "react";
import L from "leaflet";
import { CircleMarker, GeoJSON, MapContainer, Pane, Popup, TileLayer, useMap } from "react-leaflet";
import { mapLayerValue } from "../utils/dashboard";
import { useI18n } from "../i18n/I18nProvider";
import { sideClass, toLocaleNumber } from "../utils/rtl";
import { FALLBACK_CENTER } from "../utils/adapters";
import { getLatLngFromFeature } from "../utils/mapCoordinates";

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

function formatScoreDisplay(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "N/A";
  const normalized = numeric > 1 ? numeric : numeric * 100;
  const clamped = Math.max(0, Math.min(100, normalized));
  return `${clamped.toFixed(0)}/100`;
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
    const fallbackLat = Number.isFinite(Number(city?.center_lat)) ? Number(city.center_lat) : FALLBACK_CENTER.center_lat;
    const fallbackLon = Number.isFinite(Number(city?.center_lon)) ? Number(city.center_lon) : FALLBACK_CENTER.center_lon;
    if (!facilitiesForBounds.length) {
      map.setView([fallbackLat, fallbackLon], 11);
      return;
    }
    if (facilitiesForBounds.length === 1) {
      map.setView([facilitiesForBounds[0].latitude, facilitiesForBounds[0].longitude], 12);
      return;
    }
    const bounds = L.latLngBounds(facilitiesForBounds.map((row) => [row.latitude, row.longitude]));
    map.fitBounds(bounds.pad(0.15), { animate: false, maxZoom: 13 });
  }, [city?.center_lat, city?.center_lon, facilitiesForBounds, map]);

  return null;
}

export default function MapView({
  city,
  baselineFacilities = [],
  simulatedFacilities = null,
  communeGeojson = null,
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
  const [showHealthcareFacilities, setShowHealthcareFacilities] = useState(true);
  const [showCommunes, setShowCommunes] = useState(true);

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
  const activeOriginPoints = useMemo(
    () =>
      activeRows
        .map((row) => ({ row, latLng: getLatLngFromFeature(row) }))
        .filter((item) => Array.isArray(item.latLng)),
    [activeRows]
  );
  const facilitiesForBounds = activeOriginPoints.map(({ row, latLng }) => ({ ...row, latitude: latLng[0], longitude: latLng[1] }));
  const invalidOriginCount = activeRows.length - activeOriginPoints.length;

  const stopPoints = useMemo(
    () =>
      transportStops
        .map((stop) => ({ stop, latLng: getLatLngFromFeature(stop) }))
        .filter((item) => Array.isArray(item.latLng)),
    [transportStops]
  );
  const invalidStopCount = transportStops.length - stopPoints.length;

  const facilityPoints = useMemo(
    () =>
      baselineSupplyFacilities
        .map((facility) => ({ facility, latLng: getLatLngFromFeature(facility) }))
        .filter((item) => Array.isArray(item.latLng)),
    [baselineSupplyFacilities]
  );
  const invalidFacilityCount = baselineSupplyFacilities.length - facilityPoints.length;

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    console.log("Facility feature count", baselineSupplyFacilities.length);
    console.log("Invalid facility coordinate count", invalidFacilityCount);
  }, [baselineSupplyFacilities.length, invalidFacilityCount]);
  const mapCenter = useMemo(() => {
    const lat = Number(city?.center_lat);
    const lon = Number(city?.center_lon);
    if (Number.isFinite(lat) && Number.isFinite(lon)) return [lat, lon];
    const firstValid = baselineFacilities.find((row) => {
      const rlat = Number(row?.latitude);
      const rlon = Number(row?.longitude);
      return Number.isFinite(rlat) && Number.isFinite(rlon);
    });
    if (firstValid) return [Number(firstValid.latitude), Number(firstValid.longitude)];
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

        <Pane name="communes" style={{ zIndex: 430 }}>
          {showCommunes && communeGeojson?.type === "FeatureCollection" ? (
            <GeoJSON
              data={communeGeojson}
              style={{
                color: "#64748b",
                weight: 1,
                opacity: 0.6,
                fillColor: "#94a3b8",
                fillOpacity: 0.08
              }}
            />
          ) : null}
        </Pane>

        <Pane name="origins" style={{ zIndex: 450 }}>
          {activeOriginPoints.map(({ row, latLng }) => {
            const value = mapLayerValue(row, activeLayer);
            const color = getColor(value, activeLayer);
            const selected = selectedDistrictId === row.id;
            return (
              <CircleMarker
                key={`${isSimulated ? "sim-origin" : "base-origin"}-${row.id}`}
                center={latLng}
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
                      {row.analysisUnit === "facility_proxy" ? t("simflow.facilityProxyAnalysisPoint") : t("simflow.demandOriginAnalysisPoint")}
                    </div>
                    {isSimulated ? <div className="inline-flex rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700">{t("map.simulated")}</div> : null}
                    <div>
                      {t("map.accessibilityScore")}: <span className="num-ltr">{formatScoreDisplay(row.accessibilityScore)}</span>
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
            stopPoints.map(({ stop, latLng }, idx) => (
              <CircleMarker
                key={`stop-${stop.cluster_id ?? idx}`}
                center={latLng}
                radius={3}
                pathOptions={{ color: "#48cae4", fillColor: "#48cae4", fillOpacity: 0.45, opacity: 0.65, weight: 1 }}
              />
            ))}
        </Pane>

        <Pane name="facilities" style={{ zIndex: 465 }}>
          {showHealthcareFacilities &&
            facilityPoints.map(({ facility, latLng }, idx) => (
                <CircleMarker
                  key={`facility-${facility.id ?? idx}`}
                  center={latLng}
                  radius={5}
                  pathOptions={{ color: "#7C3AED", fillColor: "#8B5CF6", fillOpacity: 0.8, opacity: 0.95, weight: 1.5 }}
                >
                  <Popup>
                    <div className="space-y-1 text-xs">
                      <div className="font-semibold text-slate-900">{facility.name || "Healthcare facility"}</div>
                      <div className="text-slate-600">Healthcare destination</div>
                    </div>
                  </Popup>
                </CircleMarker>
              ))}
        </Pane>

        <Pane name="scenario-added" style={{ zIndex: 470 }}>
          {addedScenarioFacilities.map((facility, idx) => {
            const latLng = getLatLngFromFeature(facility);
            if (!latLng) return null;
            return (
            <CircleMarker
              key={`added-facility-${idx}`}
              center={latLng}
              radius={5}
              pathOptions={{ color: "#5B21B6", fillColor: "#7C3AED", fillOpacity: 0.85, opacity: 0.9, weight: 1.5 }}
            >
              <Popup>
                <div className="text-xs">
                  <div className="font-semibold text-slate-900">{t("simflow.scenarioFacility")}</div>
                  <div>{facility.source === "auto" ? t("simflow.automaticallyPlaced") : t("simflow.userPlaced")}</div>
                </div>
              </Popup>
            </CircleMarker>
            );
          })}
          {addedScenarioStops.map((stop, idx) => {
            const latLng = getLatLngFromFeature(stop);
            if (!latLng) return null;
            return (
            <CircleMarker
              key={`added-stop-${idx}`}
              center={latLng}
              radius={4.2}
              pathOptions={{ color: "#1D4ED8", fillColor: "#2563EB", fillOpacity: 0.85, opacity: 0.9, weight: 1.4 }}
            >
              <Popup>
                <div className="text-xs">
                  <div className="font-semibold text-slate-900">{t("simflow.scenarioTransportStop")}</div>
                  <div>{stop.source === "auto" ? t("simflow.automaticallyPlaced") : t("simflow.userPlaced")}</div>
                </div>
              </Popup>
            </CircleMarker>
            );
          })}
        </Pane>
      </MapContainer>

      {onLayerChange ? (
        <div className={`absolute top-3 z-[900] rounded-xl border border-[var(--border-color)] bg-white/95 p-3 text-[var(--text-primary)] shadow-sm backdrop-blur ${sideClass(isRtl, "right-3", "left-3")}`}>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-secondary)]">{t("map.layers")}</div>
          <label className="mt-2 flex items-center gap-2 text-xs text-[var(--text-primary)]">
            <input type="checkbox" checked={showTransportStops} onChange={(event) => setShowTransportStops(event.target.checked)} />
            {t("map.showStops")}
          </label>
          <label className="mt-2 flex items-center gap-2 text-xs text-[var(--text-primary)]">
            <input type="checkbox" checked={showCommunes} onChange={(event) => setShowCommunes(event.target.checked)} />
            Commune polygons
          </label>
          <label className="mt-2 flex items-center gap-2 text-xs text-[var(--text-primary)]">
            <input type="checkbox" checked={showHealthcareFacilities} onChange={(event) => setShowHealthcareFacilities(event.target.checked)} />
            Healthcare facilities
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
      {(invalidOriginCount > 0 || invalidStopCount > 0 || invalidFacilityCount > 0) && (
        <div className="absolute bottom-3 left-3 z-[910] rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Some map features were skipped because their coordinates were invalid.
        </div>
      )}
    </div>
  );
}
