import { useEffect, useMemo, useState } from "react";
import {
  CircleMarker,
  GeoJSON,
  MapContainer,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import { api } from "../api/client.js";
import { getLatLng, getProps, toFeatureArray } from "../utils/mapAdapters.js";
import { formatMinutes, formatPercent, formatScore } from "../utils/formatters.js";
import { useI18n } from "../i18n/I18nContext.jsx";

const DEFAULT_CENTER = [33.5731, -7.5898];

export default function MapPage({ cityId }) {
  const { t } = useI18n();

  const [districts, setDistricts] = useState(null);
  const [surface, setSurface] = useState(null);
  const [facilities, setFacilities] = useState(null);
  const [stops, setStops] = useState(null);

  const [loadingLayers, setLoadingLayers] = useState(false);

  const [showSurface, setShowSurface] = useState(true);
  const [showBoundaries, setShowBoundaries] = useState(true);
  const [showFacilities, setShowFacilities] = useState(true);
  const [showStops, setShowStops] = useState(false);
  const [gridSize, setGridSize] = useState(500);

  const [error, setError] = useState(null);

  useEffect(() => {
    if (!cityId) return;

    let cancelled = false;

    async function loadLayers() {
        setError(null);
        setLoadingLayers(true);

        const results = await Promise.allSettled([
            api.getDistricts(cityId),
            api.getAccessibilitySurface(cityId, gridSize),
            api.getFacilities(cityId),
            api.getStops(cityId),
        ]);

        if (cancelled) return;

        const [districtResult, surfaceResult, facilityResult, stopResult] = results;

        if (districtResult.status === "fulfilled") {
            console.log("Districts:", districtResult.value);
            setDistricts(districtResult.value);
        } else {
            console.error("Districts failed:", districtResult.reason);
            setDistricts(null);
        }

        if (surfaceResult.status === "fulfilled") {
            console.log("Surface:", surfaceResult.value);
            setSurface(surfaceResult.value);
        } else {
            console.error("Surface failed:", surfaceResult.reason);
            setSurface(null);
        }

        if (facilityResult.status === "fulfilled") {
            console.log("Facilities:", facilityResult.value);
            setFacilities(facilityResult.value);
        } else {
            console.error("Facilities failed:", facilityResult.reason);
            setFacilities(null);
        }

        if (stopResult.status === "fulfilled") {
            console.log("Stops:", stopResult.value);
            setStops(stopResult.value);
        } else {
            console.error("Stops failed:", stopResult.reason);
            setStops(null);
        }

        const failed = results
            .map((result, index) => ({ result, index }))
            .filter((item) => item.result.status === "rejected");

        if (failed.length > 0) {
            setError(
            "Some map layers could not load. Facilities/stops may still appear if their endpoints are working."
            );
        }
        setLoadingLayers(false);

    }

    loadLayers();

    return () => {
      cancelled = true;
    };
  }, [cityId, gridSize]);

  const facilityFeatures = useMemo(() => toFeatureArray(facilities), [facilities]);
  const stopFeatures = useMemo(() => toFeatureArray(stops), [stops]);

  if (!cityId) {
    return (
      <div className="card card-pad empty-state">
        Select or upload a city first.
      </div>
    );
  }

  return (
    <div className="section-space">
      <section className="toolbar">
        <div>
          <h2 className="page-title">{t("mapTitle")}</h2>
          <p className="page-subtitle">
            Blended accessibility surface, commune boundaries, healthcare facilities,
            and transport stops.
          </p>
        </div>

        <div className="layer-toggle-group">
          <label className="layer-toggle">
            <input
              type="checkbox"
              checked={showSurface}
              onChange={(e) => setShowSurface(e.target.checked)}
            />
            Accessibility surface
          </label>

          <label className="layer-toggle">
            <input
              type="checkbox"
              checked={showBoundaries}
              onChange={(e) => setShowBoundaries(e.target.checked)}
            />
            Boundaries
          </label>

          <label className="layer-toggle">
            <input
              type="checkbox"
              checked={showFacilities}
              onChange={(e) => setShowFacilities(e.target.checked)}
            />
            {t("healthcareFacilitiesLayer")}
          </label>

          <label className="layer-toggle">
            <input
              type="checkbox"
              checked={showStops}
              onChange={(e) => setShowStops(e.target.checked)}
            />
            {t("transportStopsLayer")}
          </label>

          <label className="layer-toggle">
            Grid
            <select
              value={gridSize}
              onChange={(e) => setGridSize(Number(e.target.value))}
              style={{
                border: "none",
                background: "transparent",
                fontWeight: 700,
                color: "#334155",
                outline: "none",
              }}
            >
              <option value={250}>250m</option>
              <option value={350}>350m</option>
              <option value={500}>500m</option>
              <option value={750}>750m</option>
            </select>
          </label>
        </div>
      </section>

      {error && <div className="error-box">{error}</div>}
      {loadingLayers && (
        <div className="warning-box">
            Building accessibility surface... this may take a few seconds for large origin datasets.
        </div>
        )}

      <div className="map-card">
        <MapContainer
          center={DEFAULT_CENTER}
          zoom={11}
          style={{ height: "100%", width: "100%" }}
        >
          <TileLayer
            attribution="&copy; OpenStreetMap contributors"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {districts && <FitBounds geojson={districts} />}

          {surface && showSurface && (
            <GeoJSON
              key={`surface-${cityId}-${gridSize}-${surface?.features?.length || 0}`}
              data={surface}
              style={(feature) => getSurfaceStyle(feature?.properties?.score)}
              onEachFeature={(feature, layer) => {
                const props = feature.properties || {};
                layer.bindPopup(`
                  <strong>Accessibility surface cell</strong><br/>
                  Score: ${formatPopupValue(props.score, "score")}<br/>
                  Avg. travel time: ${formatPopupValue(
                    props.avg_travel_time_min,
                    "minutes"
                  )}<br/>
                  Population: ${formatNumberForPopup(props.population)}<br/>
                  Origins: ${props.origin_count ?? "N/A"}
                `);
              }}
            />
          )}

          {districts && showBoundaries && (
            <GeoJSON
              key={`boundaries-${cityId}-${districts?.features?.length || 0}`}
              data={districts}
              style={() => ({
                color: "#111827",
                weight: 1,
                opacity: 0.7,
                fillOpacity: 0,
              })}
              onEachFeature={(feature, layer) => {
                const props = feature.properties || {};
                const name =
                  props.zone_name ||
                  props.commune_name ||
                  props.district_name ||
                  "Area";

                layer.bindPopup(`
                  <strong>${name}</strong><br/>
                  District: ${props.district_name || "Unknown"}
                `);
              }}
            />
          )}

          {/* Stops are drawn before facilities, so facilities stay visually above. */}
          {showStops &&
            stopFeatures.map((feature, index) => {
              const latLng = getLatLng(feature);
              if (!latLng) return null;

              const props = getProps(feature);

              return (
                <CircleMarker
                  key={props.stop_key || `stop-${index}`}
                  center={latLng}
                  radius={1.8}
                  pathOptions={{
                    color: "#1d4ed8",
                    fillColor: "#3b82f6",
                    fillOpacity: 0.5,
                    opacity: 0.5,
                    weight: 0.8,
                  }}
                >
                  <Popup>
                    <strong>{props.stop_name || "Transport stop"}</strong>
                    <br />
                    {t("mode")}: {props.mode || t("unknown")}
                    <br />
                    {t("lines")}: {props.Lines || t("notSpecified")}
                  </Popup>
                </CircleMarker>
              );
            })}

          {showFacilities &&
            facilityFeatures.map((feature, index) => {
              const latLng = getLatLng(feature);
              if (!latLng) return null;

              const props = getProps(feature);

              return (
                <CircleMarker
                  key={props.facility_id || `facility-${index}`}
                  center={latLng}
                  radius={5.2}
                  pathOptions={{
                    color: "#6d28d9",
                    fillColor: "#a78bfa",
                    fillOpacity: 0.95,
                    opacity: 1,
                    weight: 1.5,
                    }}
                >
                  <Popup>
                    <strong>{props.name || "Healthcare facility"}</strong>
                    <br />
                    {t("type")}: {props.type || "healthcare"}
                    <br />
                    {t("commune")}: {props.commune_name || t("unknown")}
                  </Popup>
                </CircleMarker>
              );
            })}
        </MapContainer>
      </div>

      <div className="map-legend-card">
        <div>
          <strong>Accessibility surface</strong>
          <div className="heatmap-legend">
            <span>Low access</span>
            <div className="heatmap-gradient" />
            <span>High access</span>
          </div>
        </div>

        <div className="map-counts">
          <span>
            Cells: <strong>{surface?.features?.length || 0}</strong>
          </span>
          <span>
            <span className="legend-dot facility" /> Facilities:{" "}
            <strong>{facilityFeatures.length}</strong>
          </span>
          <span>
            <span className="legend-dot stop" /> Stops:{" "}
            <strong>{stopFeatures.length}</strong>
          </span>
        </div>
      </div>
    </div>
  );
}

function FitBounds({ geojson }) {
  const map = useMap();

  useEffect(() => {
    if (!geojson?.features?.length) return;

    try {
      const layer = L.geoJSON(geojson);
      const bounds = layer.getBounds();

      if (!bounds.isValid()) return;

      const south = bounds.getSouth();
      const north = bounds.getNorth();
      const west = bounds.getWest();
      const east = bounds.getEast();

      const looksLikeLatLng =
        south >= -90 && north <= 90 && west >= -180 && east <= 180;

      if (!looksLikeLatLng) {
        console.warn("Skipping fitBounds because bounds are not lat/lng:", {
          south,
          north,
          west,
          east,
        });
        return;
      }

      map.fitBounds(bounds, { padding: [30, 30] });
    } catch (err) {
      console.warn("Could not fit bounds", err);
    }
  }, [geojson, map]);

  return null;
}

function getSurfaceStyle(score) {
  const normalized = normalizeScore(score);

  return {
    color: "transparent",
    weight: 0,
    fillColor: colorForAccessibility(normalized),
    fillOpacity: normalized === null ? 0.08 : 0.38,
  };
}

function normalizeScore(score) {
  if (score === null || score === undefined || Number.isNaN(Number(score))) {
    return null;
  }

  const value = Number(score);
  return value <= 1 ? value * 100 : value;
}

function colorForAccessibility(score) {
  if (score === null) return "#cbd5e1";

  if (score < 25) return "#b91c1c";
  if (score < 40) return "#ef4444";
  if (score < 55) return "#f97316";
  if (score < 70) return "#facc15";
  if (score < 85) return "#84cc16";
  return "#16a34a";
}

function formatPopupValue(value, type) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "Not available";
  }

  if (type === "score") return formatScore(value);
  if (type === "minutes") return formatMinutes(value);
  if (type === "percent") return formatPercent(value);

  return String(value);
}

function formatNumberForPopup(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "Not available";
  }

  return Number(value).toLocaleString(undefined, {
    maximumFractionDigits: 0,
  });
}