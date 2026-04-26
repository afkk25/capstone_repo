import { useEffect, useMemo, useState } from "react";
import {
  CircleMarker,
  GeoJSON,
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import { api } from "../api/client.js";
import { getLatLng, getProps, toFeatureArray } from "../utils/mapAdapters.js";
import {
  formatCompactNumber,
  formatMinutes,
  formatScore,
} from "../utils/formatters.js";
import { useI18n } from "../i18n/I18nContext.jsx";
import {
  exportImpactedCommunesCsv,
  exportSimulationHtmlReport,
  exportSimulationJson,
} from "../utils/exportSimulationReport.js";

const DEFAULT_CENTER = [33.5731, -7.5898];

export default function SimulationPage({ cityId }) {
  const { t } = useI18n();

  const [scenarioType, setScenarioType] = useState("add_facility");
  const [marker, setMarker] = useState(null);
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(null);

  const [districts, setDistricts] = useState(null);
  const [surface, setSurface] = useState(null);
  const [facilities, setFacilities] = useState(null);
  const [stops, setStops] = useState(null);
  const [loadingLayers, setLoadingLayers] = useState(false);

  const [showSurface, setShowSurface] = useState(true);
  const [showBoundaries, setShowBoundaries] = useState(true);
  const [showFacilities, setShowFacilities] = useState(true);
  const [showStops, setShowStops] = useState(false);
  const [gridSize, setGridSize] = useState(750);

  const [recommendations, setRecommendations] = useState([]);
  const [loadingRecommendations, setLoadingRecommendations] = useState(false);
  const [recommendationError, setRecommendationError] = useState(null);

  

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

      const [districtResult, surfaceResult, facilityResult, stopResult] =
        results;

      if (districtResult.status === "fulfilled") {
        setDistricts(districtResult.value);
      } else {
        console.error("Simulation districts failed:", districtResult.reason);
      }

      if (surfaceResult.status === "fulfilled") {
        setSurface(surfaceResult.value);
      } else {
        console.error("Simulation surface failed:", surfaceResult.reason);
      }

      if (facilityResult.status === "fulfilled") {
        setFacilities(facilityResult.value);
      } else {
        console.error("Simulation facilities failed:", facilityResult.reason);
      }

      if (stopResult.status === "fulfilled") {
        setStops(stopResult.value);
      } else {
        console.error("Simulation stops failed:", stopResult.reason);
      }

      setLoadingLayers(false);
    }

    loadLayers();

    return () => {
      cancelled = true;
    };
  }, [cityId, gridSize]);

  const facilityFeatures = useMemo(
    () => toFeatureArray(facilities),
    [facilities]
  );

  const stopFeatures = useMemo(() => toFeatureArray(stops), [stops]);

  async function runScenario() {
    if (!cityId || !marker) return;

    setRunning(true);
    setError(null);
    setResult(null);

    const payload = {
      scenario_type: scenarioType,
      location: {
        latitude: marker.lat,
        longitude: marker.lng,
      },
      grid_size_m: gridSize,
    };

    try {
      const response = await api.simulate(cityId, payload);
      setResult(response);
    } catch (err) {
      setError(err.message);
    } finally {
      setRunning(false);
    }
  }


  async function suggestLocations() {
    if (!cityId) return;

    setLoadingRecommendations(true);
    setRecommendationError(null);
    setRecommendations([]);

    try {
      const response = await api.getSimulationRecommendations(
        cityId,
        scenarioType,
        5
      );

      console.log("Simulation recommendations response:", response);

      const rows = Array.isArray(response)
        ? response
        : response?.recommendations || [];

      const validRows = rows
        .map((item) => ({
          ...item,
          latitude: Number(item.latitude),
          longitude: Number(item.longitude),
        }))
        .filter(
          (item) =>
            Number.isFinite(item.latitude) &&
            Number.isFinite(item.longitude)
        );

      setRecommendations(validRows);
    } catch (err) {
      setRecommendationError(err.message);
    } finally {
      setLoadingRecommendations(false);
    }
  }

  function resetScenario() {
    setMarker(null);
    setResult(null);
    setError(null);
  }

  return (
    <div className="section-space simulation-page">
      <section className="simulation-header">
        <div>
          <h2 className="page-title">{t("simulationTitle")}</h2>
          <p className="page-subtitle">{t("simulationSubtitle")}</p>
        </div>
      </section>

      {loadingLayers && (
        <div className="warning-box">
          Building simulation map layers... this may take a few seconds.
        </div>
      )}

      <section className="simulation-control-bar card">
        <div className="control-step control-step-intervention">
          <span className="control-step-number">1</span>

          <div className="control-field">
            <label className="control-label">Intervention</label>
            <select
              value={scenarioType}
              onChange={(e) => {
                setScenarioType(e.target.value);
                setResult(null);
                setRecommendations([]);
                setRecommendationError(null);
              }}
              className="control-select"
            >
              <option value="add_facility">{t("addFacility")}</option>
              <option value="add_stop">{t("addStop")}</option>
            </select>
          </div>
        </div>

        <div className="control-step control-step-placement">
          <span className="control-step-number">2</span>

          <div className="control-field">
            <label className="control-label">Placement</label>

            <div className="control-placement">
              {marker ? (
                <>
                  <strong>{t("markerPlaced")}</strong>
                  <span>
                    {marker.lat.toFixed(5)}, {marker.lng.toFixed(5)}
                  </span>
                </>
              ) : (
                <>
                  <strong>{t("placeIntervention")}</strong>
                  <span>Click on the map to choose the location.</span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="control-step control-step-grid">
          <span className="control-step-number">3</span>

          <div className="control-field">
            <label className="control-label">Surface grid</label>
            <select
              value={gridSize}
              onChange={(e) => setGridSize(Number(e.target.value))}
              className="control-select"
            >
              <option value={500}>500m</option>
              <option value={750}>750m</option>
              <option value={1000}>1km</option>
            </select>
          </div>
        </div>

        <details className="control-layers">
          <summary>Advanced layers</summary>

          <div className="control-layer-list">
            <LayerCheckbox
              label="Accessibility surface"
              checked={showSurface}
              onChange={setShowSurface}
            />

            <LayerCheckbox
              label="Boundaries"
              checked={showBoundaries}
              onChange={setShowBoundaries}
            />

            <LayerCheckbox
              label={t("healthcareFacilitiesLayer")}
              checked={showFacilities}
              onChange={setShowFacilities}
            />

            <LayerCheckbox
              label={t("transportStopsLayer")}
              checked={showStops}
              onChange={setShowStops}
            />
          </div>
        </details>


        <button
          type="button"
          onClick={suggestLocations}
          disabled={loadingRecommendations}
          className="control-suggest-button"
        >
          {loadingRecommendations ? "Finding..." : "Suggest sites"}
        </button>

        <button
          onClick={runScenario}
          disabled={!marker || running}
          className="control-run-button"
        >
          {running ? t("runningScenario") : t("runScenario")}
        </button>

        <button
          onClick={() => {
            setMarker(null);
            setResult(null);
            setError(null);
          }}
          className="control-reset-button"
        >
          {t("reset")}
        </button>
      </section>

      {error && <div className="error-box">{error}</div>}
      {recommendationError && (
        <div className="error-box">{recommendationError}</div>
      )}

      <div className="simulation-content-grid">
        <section className="map-card sim-map simulation-map-panel">
          <MapContainer
            center={DEFAULT_CENTER}
            zoom={10}
            style={{ height: "100%", width: "100%" }}
          >
            <TileLayer
              attribution="&copy; OpenStreetMap contributors"
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            {districts && <FitBounds geojson={districts} />}

            {/* Baseline accessibility surface: always shown as the background heatmap */}
            {surface && showSurface && (
              <GeoJSON
                key={`baseline-surface-${cityId}-${gridSize}-${
                  surface?.features?.length || 0
                }`}
                data={surface}
                interactive={false}
                style={(feature) => getSurfaceStyle(feature?.properties?.score)}
              />
            )}

            {/* Scenario impact overlay: shown only after running a scenario */}
            {result?.scenario_surface && showSurface && (
              <GeoJSON
                key={`scenario-impact-surface-${cityId}-${gridSize}-${
                  result.scenario_surface?.features?.length || 0
                }`}
                data={result.scenario_surface}
                interactive={false}
                style={(feature) => getScenarioImpactStyle(feature?.properties)}
              />
            )}

            {districts && showBoundaries && (
              <GeoJSON
                key={`sim-boundaries-${cityId}-${
                  districts?.features?.length || 0
                }`}
                data={districts}
                interactive={false}
                style={() => ({
                  color: "#111827",
                  weight: 1,
                  opacity: 0.65,
                  fillOpacity: 0,
                })}
              />
            )}

            {showStops &&
              stopFeatures.map((feature, index) => {
                const latLng = getLatLng(feature);
                if (!latLng) return null;

                const props = getProps(feature);

                return (
                  <CircleMarker
                    key={props.stop_key || `stop-${index}`}
                    center={latLng}
                    radius={2.2}
                    pathOptions={{
                      color: "#1d4ed8",
                      fillColor: "#3b82f6",
                      fillOpacity: 0.5,
                      opacity: 0.55,
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

                    {recommendations.map((recommendation) => (
  <CircleMarker
    key={`recommendation-${recommendation.rank}`}
    center={[recommendation.latitude, recommendation.longitude]}
    radius={10}
    pathOptions={{
      color: "#ffffff",
      fillColor: "#f59e0b",
      fillOpacity: 1,
      opacity: 1,
      weight: 3,
    }}
  >
    <Popup>
      <strong>
        #{recommendation.rank} Suggested{" "}
        {scenarioType === "add_facility" ? "facility" : "stop"} site
      </strong>
      <br />
      Population benefiting:{" "}
      {formatCompactNumber(recommendation.population_improved)}
      <br />
      Score gain:{" "}
      {formatSignedScore(recommendation.average_accessibility_score_gain)}
      <br />
      Top impacted area: {recommendation.top_impacted_area || "Unknown"}
      <br />
      <br />
      <button
        type="button"
        className="popup-action-button"
        onClick={() => {
          setMarker({
            lat: recommendation.latitude,
            lng: recommendation.longitude,
          });
          setResult(null);
        }}
      >
        Use this location
      </button>
    </Popup>
  </CircleMarker>
))}
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


            {recommendations.map((recommendation, index) => {
              const lat = Number(recommendation.latitude);
              const lng = Number(recommendation.longitude);
              const rank = recommendation.rank || index + 1;

              if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
                console.warn("Invalid recommendation coordinates:", recommendation);
                return null;
              }

              return (
                <Marker
                  key={`recommendation-${rank}-${lat}-${lng}`}
                  position={[lat, lng]}
                  icon={createRecommendationIcon(rank)}
                >
                  <Popup>
                    <strong>
                      #{rank} Suggested{" "}
                      {scenarioType === "add_facility" ? "facility" : "stop"} site
                    </strong>
                    <br />
                    Population benefiting:{" "}
                    {formatCompactNumber(recommendation.population_improved)}
                    <br />
                    Score gain:{" "}
                    {formatSignedScore(recommendation.average_accessibility_score_gain)}
                    <br />
                    Top impacted area:{" "}
                    {recommendation.top_impacted_area || "Unknown"}
                    <br />
                    <br />
                    <button
                      type="button"
                      className="popup-action-button"
                      onClick={() => {
                        setMarker({
                          lat,
                          lng,
                        });
                        setResult(null);
                      }}
                    >
                      Use this location
                    </button>
                  </Popup>
                </Marker>
              );
            })}
            <ClickHandler
              onPick={(picked) => {
                setMarker(picked);
                setResult(null);
                setError(null);
              }}
            />

            {marker && (
              <CircleMarker
                center={[marker.lat, marker.lng]}
                radius={9}
                pathOptions={{
                  color: "#ffffff",
                  fillColor:
                    scenarioType === "add_facility" ? "#7c3aed" : "#2563eb",
                  fillOpacity: 1,
                  opacity: 1,
                  weight: 3,
                }}
              >
                <Popup>
                  {scenarioType === "add_facility"
                    ? t("addFacility")
                    : t("addStop")}
                </Popup>
              </CircleMarker>
            )}
            <MapLegend hasScenario={Boolean(result?.scenario_surface)} />
          </MapContainer>
        </section>

        <ScenarioResultsPanel
          result={result}
          running={running}
          marker={marker}
          scenarioType={scenarioType}
          recommendations={recommendations}
          cityId={cityId}
        />
      </div>

      <ImpactedCommunesTable result={result} />
    </div>
  );
}

function LayerCheckbox({ label, checked, onChange }) {
  return (
    <label className="layer-checkbox">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}

function ClickHandler({ onPick }) {
  useMapEvents({
    click(event) {
      onPick({
        lat: event.latlng.lat,
        lng: event.latlng.lng,
      });
    },
  });

  return null;
}

function ScenarioResultsPanel({
  result,
  running,
  marker,
  scenarioType,
  recommendations,
  cityId,
}){
  const { t } = useI18n();

  if (running) {
    return (
      <aside className="card card-pad simulation-results-panel">
        <div className="panel-heading">
          <p className="eyebrow">Output</p>
          <h3>{t("evaluatingScenario")}</h3>
        </div>

        <div className="results-loading">
          <div className="spinner-dot" />
          <p>{t("evaluatingMessage")}</p>
        </div>
      </aside>
    );
  }

  if (!result) {
    return (
      <aside className="card card-pad simulation-results-panel">
        <div className="panel-heading">
          <p className="eyebrow">Output</p>
          <h3>Scenario impact</h3>
        </div>

        <div className="results-empty-state">
          <strong>{t("noScenarioResult")}</strong>
          <p>
            Choose an intervention, click on the map to place it, then run the
            scenario.
          </p>
        </div>

        <div className="preview-note">
          Preview mode: results estimate local accessibility impact only.
        </div>
      </aside>
    );
  }

  const summary = result.summary || {};

  return (
    <aside className="card card-pad simulation-results-panel">
      <div className="panel-heading">
        <p className="eyebrow">Output</p>
        <h3>Scenario impact</h3>
      </div>

      <div className="scenario-warning">
        Preview mode: Results estimate local accessibility impact only. They do
        not model full route scheduling or service capacity.
      </div>

      <div className="results-kpi-list">
        <ResultCard
          title="Population benefiting"
          value={formatCompactNumber(summary.population_improved)}
          subtitle="People with improved accessibility"
        />

        <ResultCard
          title="Newly within 60 min"
          value={formatCompactNumber(summary.newly_covered_population_60min)}
          subtitle="People crossing the 60-minute threshold"
        />

        <ResultCard
          title="Avg. time reduction"
          value={formatMinutes(summary.average_travel_time_reduction_min)}
          subtitle="Population-weighted time saved"
        />

        <ResultCard
          title="Accessibility improvement"
          value={formatSignedScore(summary.average_accessibility_score_gain)}
          subtitle="Average score gain"
        />
      </div>
      <SimulationExportActions
        result={result}
        marker={marker}
        scenarioType={scenarioType}
        recommendations={recommendations}
        cityId={cityId}
      />
    </aside>
  );
}

function ImpactedCommunesTable({ result }) {
  const { t } = useI18n();
  const [showAll, setShowAll] = useState(false);

  if (!result) return null;

  const allImpacts = result.zone_impacts || result.commune_impacts || [];
  const impactedRows = allImpacts.filter(hasMeaningfulImpact);

  const rows =
    !showAll && impactedRows.length > 0 ? impactedRows : allImpacts;

  const displayedRows = showAll ? rows : rows.slice(0, 8);

  return (
    <section className="table-wrap simulation-impact-table">
      <div className="table-header-row">
        <div>
          <p className="eyebrow">Detailed output</p>
          <strong>{t("mostImpactedCommunes")}</strong>
        </div>

        <div className="table-actions">
          <span>
            Showing {displayedRows.length} of {allImpacts.length}
          </span>

          {allImpacts.length > impactedRows.length && (
            <button
              type="button"
              className="text-button"
              onClick={() => setShowAll((value) => !value)}
            >
              {showAll ? "Show impacted only" : "Show all communes"}
            </button>
          )}
        </div>
      </div>

      <table className="data-table">
        <thead>
          <tr>
            <th>{t("communeArea")}</th>
            <th>{t("parentDistrict")}</th>
            <th>Population benefiting</th>
            <th>Avg. time reduction</th>
            <th>Accessibility change</th>
          </tr>
        </thead>

        <tbody>
          {displayedRows.map((row, index) => (
            <tr
              key={`${row.zone_name || row.commune_name || "area"}-${index}`}
              className={index === 0 && impactedRows.length > 0 ? "top-impact-row" : ""}
            >
              <td>
                <div className="commune-cell">
                  {index === 0 && impactedRows.length > 0 && (
                    <span className="rank-badge">#1</span>
                  )}
                  <strong>
                    {row.zone_name || row.commune_name || t("unknown")}
                  </strong>
                </div>
              </td>
              <td>{row.district_name || "—"}</td>
              <td>{formatCompactNumber(row.population_improved)}</td>
              <td>{formatMinutes(row.average_travel_time_reduction_min)}</td>
              <td>
                {formatSignedScore(row.average_accessibility_score_gain)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {displayedRows.length === 0 && (
        <div className="empty-state table-empty-state">{t("noImpact")}</div>
      )}
    </section>
  );
}

function ResultCard({ title, value, subtitle }) {
  return (
    <div className="result-metric-card">
      <p className="kpi-label">{title}</p>
      <p className="kpi-value">{value}</p>
      {subtitle && <p className="kpi-subtitle">{subtitle}</p>}
    </div>
  );
}

function SimulationExportActions({
  result,
  marker,
  scenarioType,
  recommendations,
  cityId,
}) {
  if (!result) return null;

  return (
    <div className="simulation-export-box">
      <div>
        <p className="kpi-label">Export</p>
        <strong>Download scenario outputs</strong>
      </div>

      <div className="simulation-export-actions">
        <button
          type="button"
          onClick={() =>
            exportSimulationHtmlReport({
              result,
              marker,
              scenarioType,
              recommendations,
              cityId,
            })
          }
        >
          Report
        </button>

        <button
          type="button"
          onClick={() => exportImpactedCommunesCsv({ result, cityId })}
        >
          CSV
        </button>

        <button
          type="button"
          onClick={() =>
            exportSimulationJson({
              result,
              marker,
              scenarioType,
              recommendations,
              cityId,
            })
          }
        >
          JSON
        </button>
      </div>
    </div>
  );
}

function createRecommendationIcon(rank) {
  return L.divIcon({
    className: "recommendation-marker",
    html: `<div class="recommendation-marker-inner">${rank}</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -16],
  });
}

function MapLegend({ hasScenario }) {
  return (
    <div className="simulation-map-legend">
      <strong>{hasScenario ? "Scenario impact" : "Accessibility surface"}</strong>

      {hasScenario ? (
        <>
          <span><i className="legend-swatch impact-low" /> Small gain</span>
          <span><i className="legend-swatch impact-mid" /> Medium gain</span>
          <span><i className="legend-swatch impact-high" /> High gain</span>
        </>
      ) : (
        <>
          <span><i className="legend-swatch access-low" /> Low access</span>
          <span><i className="legend-swatch access-mid" /> Medium access</span>
          <span><i className="legend-swatch access-high" /> High access</span>
        </>
      )}
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

      if (!looksLikeLatLng) return;

      map.fitBounds(bounds, { padding: [18, 18] });
    } catch (err) {
      console.warn("Could not fit bounds", err);
    }
  }, [geojson, map]);

  return null;
}


function getScenarioImpactStyle(props = {}) {
  const gain = Number(props.score_gain ?? 0);
  const timeReduction = Number(props.time_reduction_min ?? 0);

  const hasImpact =
    Number.isFinite(gain) &&
    Number.isFinite(timeReduction) &&
    (gain > 0.05 || timeReduction > 0.05);

  return {
    color: hasImpact ? "#166534" : "transparent",
    weight: hasImpact ? 0.4 : 0,
    fillColor: colorForScenarioGain(gain),
    fillOpacity: hasImpact ? 0.5 : 0,
  };
}



function colorForScenarioGain(gain) {
  if (!Number.isFinite(gain) || gain <= 0) return "#cbd5e1";
  if (gain < 2) return "#dcfce7";
  if (gain < 5) return "#bbf7d0";
  if (gain < 10) return "#86efac";
  if (gain < 20) return "#22c55e";
  return "#15803d";
}

function getSurfaceStyle(score) {
  const normalized = normalizeScore(score);

  return {
    color: "transparent",
    weight: 0,
    fillColor: colorForAccessibility(normalized),
    fillOpacity: normalized === null ? 0.08 : 0.26,
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

function hasMeaningfulImpact(row) {
  const population = Number(row.population_improved || 0);
  const timeSaved = Number(row.average_travel_time_reduction_min || 0);
  const scoreGain = Number(row.average_accessibility_score_gain || 0);

  return population > 0 || timeSaved > 0 || scoreGain > 0;
}

function formatSignedScore(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return formatScore(value);
  }

  const numericValue = Number(value);
  const formatted = formatScore(numericValue);

  return numericValue > 0 ? `+${formatted}` : formatted;
}