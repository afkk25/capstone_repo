import { useEffect, useMemo } from "react";
import L from "leaflet";
import { Circle, CircleMarker, MapContainer, Marker, Pane, Popup, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { FALLBACK_CENTER } from "../../utils/adapters";

function getOriginColor(score, mode) {
  if (mode === "impact") {
    if (score > 0.02) return "#1d4ed8";
    if (score < -0.02) return "#b91c1c";
    return "#6b7280";
  }
  if (score >= 0.66) return "#2ecc71";
  if (score >= 0.33) return "#f39c12";
  return "#e74c3c";
}

function layerLegend(layer) {
  if (layer === "impact") {
    return [
      { color: "#1d4ed8", label: "Improved vs baseline" },
      { color: "#6b7280", label: "Minimal effect" },
      { color: "#b91c1c", label: "Declined vs baseline" }
    ];
  }
  if (layer === "after") {
    return [
      { color: "#2ecc71", label: "High accessibility" },
      { color: "#f39c12", label: "Moderate accessibility" },
      { color: "#e74c3c", label: "Low accessibility" }
    ];
  }
  return [
    { color: "#2ecc71", label: "High accessibility" },
    { color: "#f39c12", label: "Moderate accessibility" },
    { color: "#e74c3c", label: "Low accessibility" }
  ];
}

function mapPointForMarker(interventionType) {
  if (interventionType === "add_transport_stop") return { color: "#2563eb", symbol: "S", radiusM: 500, label: "New transport stop" };
  if (interventionType === "add_healthcare_facility")
    return { color: "#7c3aed", symbol: "H", radiusM: 1000, label: "New healthcare facility" };
  return { color: "#7c3aed", symbol: "A", radiusM: 800, label: "Access improvement focus area" };
}

function buildScenarioIcon({ color, symbol, variant = "scenario", label = "" }) {
  const size = variant === "placement" ? 38 : 28;
  const anchor = size / 2;
  return L.divIcon({
    className: `simulation-marker-icon simulation-marker-icon--${variant}`,
    html: `<div class="simulation-marker simulation-marker--${variant}" style="--marker-color:${color}" aria-label="${label}"><span>${symbol}</span></div>`,
    iconSize: [size, size],
    iconAnchor: [anchor, anchor]
  });
}

function FitToData({ center, rows, placement }) {
  const map = useMap();

  useEffect(() => {
    const points = rows
      .filter((row) => Number.isFinite(row.latitude) && Number.isFinite(row.longitude))
      .map((row) => [row.latitude, row.longitude]);

    if (placement) {
      points.push([placement.latitude, placement.longitude]);
    }

    if (!points.length) {
      map.setView(center, 11);
      return;
    }

    if (points.length === 1) {
      map.setView(points[0], 12);
      return;
    }

    const bounds = L.latLngBounds(points);
    map.fitBounds(bounds.pad(0.18), { animate: false, maxZoom: 13 });
  }, [center, map, placement, rows]);

  return null;
}

function PlacementSelector({ enabled, onSelect }) {
  useMapEvents({
    click(event) {
      if (!enabled || !onSelect) return;
      onSelect({
        latitude: event.latlng.lat,
        longitude: event.latlng.lng
      });
    }
  });

  return null;
}

function ResizeMapToContainer() {
  const map = useMap();

  useEffect(() => {
    const container = map.getContainer();
    const invalidate = () => map.invalidateSize({ animate: false });
    invalidate();
    const timeout = window.setTimeout(invalidate, 120);
    const observer = new ResizeObserver(invalidate);
    observer.observe(container);
    return () => {
      window.clearTimeout(timeout);
      observer.disconnect();
    };
  }, [map]);

  return null;
}

export default function SimulationWorkspaceMap({
  city,
  baselineFacilities = [],
  simulatedFacilities = [],
  transportStops = [],
  baselineSupplyFacilities = [],
  scenarioAddedFacilities = [],
  scenarioAddedStops = [],
  recommendedPlacementMarkers = [],
  interventionType = "",
  placement = null,
  onPlacementChange,
  selectedDistrictId = null,
  impactedDistrictIds = [],
  mapLayer = "baseline",
  onMapLayerChange,
  onRecommendedPlacementSelect,
  showBaselineStops = false,
  onShowBaselineStopsChange,
  showBaselineFacilities = false,
  showAccessibilityLayer = true,
  showMapLegend = true,
  showInfluenceZone = true,
  isLoading = false,
  loadingLabel = "Loading map data...",
  interactionHint = "",
  selectedInterventionLabel = ""
}) {
  const mergedRows = useMemo(() => {
    const simById = new Map(simulatedFacilities.map((row) => [row.id, row]));
    return baselineFacilities.map((baseRow) => {
      const afterRow = simById.get(baseRow.id);
      const afterAccessibility = afterRow?.accessibilityScore ?? baseRow.accessibilityScore;
      return {
        ...baseRow,
        simulatedAccessibility: afterAccessibility,
        simulatedTravelTime: afterRow?.travelTimeMin ?? baseRow.travelTimeMin,
        deltaAccessibility: afterAccessibility - baseRow.accessibilityScore
      };
    });
  }, [baselineFacilities, simulatedFacilities]);

  const hasSimulation = simulatedFacilities.length > 0;
  const activeLayer = hasSimulation ? mapLayer : "baseline";
  const impactedSet = useMemo(() => new Set(impactedDistrictIds), [impactedDistrictIds]);

  const rowsForBounds = useMemo(() => {
    if (activeLayer === "after" && hasSimulation) return simulatedFacilities;
    return baselineFacilities;
  }, [activeLayer, baselineFacilities, hasSimulation, simulatedFacilities]);

  const validStops = useMemo(
    () =>
      transportStops.filter((stop) => {
        const lat = Number(stop.latitude);
        const lon = Number(stop.longitude);
        return Number.isFinite(lat) && Number.isFinite(lon);
      }),
    [transportStops]
  );

  const markerDesign = mapPointForMarker(interventionType);
  const isPlacementMode = Boolean(interventionType) && !hasSimulation;
  const softenContextLayers = Boolean(interventionType);
  const scenarioIcon = useMemo(
    () => buildScenarioIcon({ color: markerDesign.color, symbol: markerDesign.symbol, variant: "placement", label: markerDesign.label }),
    [markerDesign.color, markerDesign.symbol]
  );
  const scenarioFacilityIcon = useMemo(() => buildScenarioIcon({ color: "#7c3aed", symbol: "H", label: "Scenario healthcare facility" }), []);
  const scenarioStopIcon = useMemo(() => buildScenarioIcon({ color: "#2563eb", symbol: "S", label: "Scenario transport stop" }), []);
  const baselineFacilityNearIcon = useMemo(() => buildScenarioIcon({ color: "#0f9f6e", symbol: "H", variant: "baseline-facility", label: "Baseline healthcare supply" }), []);
  const baselineFacilityFarIcon = useMemo(() => buildScenarioIcon({ color: "#dc2626", symbol: "H", variant: "baseline-facility", label: "Low-transit healthcare supply" }), []);
  const recommendedMarkerIcon = useMemo(() => buildScenarioIcon({ color: "#f59e0b", symbol: "R", variant: "recommended", label: "Recommended candidate site" }), []);

  const canPlaceFromMap = Boolean(interventionType);
  const legendItems = layerLegend(activeLayer);
  const markerLegendItems = [
    { color: "#94a3b8", label: "Baseline demand origins", shape: "dot" },
    ...(showBaselineStops ? [{ color: "#9bdaf0", label: "Baseline transport stops", shape: "diamond" }] : []),
    ...(showBaselineFacilities
      ? [
          { color: "#0f9f6e", label: "Baseline healthcare supply", shape: "square" },
          { color: "#dc2626", label: "Low-transit healthcare supply", shape: "square" }
        ]
      : []),
    ...(interventionType ? [{ color: markerDesign.color, label: "Planner-added intervention", shape: "rounded" }] : []),
    ...(recommendedPlacementMarkers.length ? [{ color: "#f59e0b", label: "Suggested candidate site", shape: "ring" }] : [])
  ];
  const mapCenter = useMemo(() => {
    const lat = Number(city?.center_lat);
    const lon = Number(city?.center_lon);
    if (Number.isFinite(lat) && Number.isFinite(lon)) return [lat, lon];
    if (baselineFacilities.length) return [baselineFacilities[0].latitude, baselineFacilities[0].longitude];
    return [FALLBACK_CENTER.center_lat, FALLBACK_CENTER.center_lon];
  }, [baselineFacilities, city?.center_lat, city?.center_lon]);

  if (!city) {
    return <div className="simulation-map-empty">Select a city to begin scenario planning.</div>;
  }

  return (
    <div className={`simulation-map-shell ${isPlacementMode ? "is-placement-mode" : ""}`}>
      {hasSimulation ? (
        <div className="simulation-map-view-toggle" aria-label="Map result layer">
          {[
            { id: "baseline", label: "Baseline" },
            { id: "after", label: "Scenario" },
            { id: "impact", label: "Impact" }
          ].map((option) => (
            <button
              key={option.id}
              type="button"
              className={activeLayer === option.id ? "is-selected" : ""}
              onClick={() => onMapLayerChange?.(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
      <MapContainer center={mapCenter} zoom={city?.default_zoom || 11} className="h-full w-full mc-leaflet-dark" scrollWheelZoom={false} preferCanvas>
        <FitToData center={mapCenter} rows={rowsForBounds} placement={placement} />
        <ResizeMapToContainer />
        <PlacementSelector enabled={canPlaceFromMap} onSelect={onPlacementChange} />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        />

        <Pane name="origins" style={{ zIndex: 450 }}>
          {showAccessibilityLayer ? mergedRows.map((row) => {
            const selected = selectedDistrictId === row.id;
            const impacted = impactedSet.has(row.id);
            const colorScore =
              activeLayer === "impact"
                ? row.deltaAccessibility
                : activeLayer === "after"
                ? row.simulatedAccessibility
                : row.accessibilityScore;
            return (
              <CircleMarker
                key={`origin-${row.id}`}
                center={[row.latitude, row.longitude]}
                radius={selected ? 8.5 : isPlacementMode ? 6.4 : 8}
                pathOptions={{
                  color: selected ? "#0f172a" : getOriginColor(colorScore, activeLayer),
                  fillColor: getOriginColor(colorScore, activeLayer),
                  opacity: softenContextLayers ? 0.42 : 0.9,
                  fillOpacity: softenContextLayers ? 0.28 : 0.72,
                  weight: selected ? 2.4 : hasSimulation ? 1.6 : impacted ? 1.7 : 1,
                  dashArray: hasSimulation && activeLayer !== "baseline" ? "4 3" : undefined
                }}
              >
                <Popup>
                  <div className="simulation-popup simulation-popup-card">
                    <div>{row.originName || row.districtName}</div>
                    <div>{row.analysisUnit === "facility_proxy" ? "Facility-proxy analysis point" : "Demand origin analysis point"}</div>
                    <div>Baseline accessibility: {(row.accessibilityScore * 100).toFixed(1)}%</div>
                    {hasSimulation ? <div>Scenario accessibility: {(row.simulatedAccessibility * 100).toFixed(1)}%</div> : null}
                    {hasSimulation ? <div>Planning change: {(row.deltaAccessibility * 100).toFixed(2)} percentage points</div> : null}
                    <div>Baseline travel time: {row.travelTimeMin.toFixed(1)} min</div>
                    {hasSimulation ? <div>Scenario travel time: {row.simulatedTravelTime.toFixed(1)} min</div> : null}
                  </div>
                </Popup>
              </CircleMarker>
            );
          }) : null}
        </Pane>

        <Pane name="baseline-stops" style={{ zIndex: 460 }}>
          {showBaselineStops
            ? validStops.map((stop, idx) => (
                <CircleMarker
                  key={`stop-${stop.cluster_id ?? idx}`}
                  center={[Number(stop.latitude), Number(stop.longitude)]}
                  radius={softenContextLayers ? 1.4 : 1.8}
                  pathOptions={{
                    color: "#7dc7e3",
                    fillColor: "#7dc7e3",
                    fillOpacity: softenContextLayers ? 0.12 : 0.24,
                    opacity: softenContextLayers ? 0.2 : 0.35,
                    weight: 0.7
                  }}
                >
                  <Popup>
                    <div className="simulation-popup">
                      <div>{stop.stop_name || `Transport stop ${stop.cluster_id ?? idx + 1}`}</div>
                      <div>Baseline transport access point</div>
                    </div>
                  </Popup>
                </CircleMarker>
              ))
            : null}
        </Pane>

        <Pane name="baseline-facilities" style={{ zIndex: 465 }}>
          {showBaselineFacilities
            ? baselineSupplyFacilities.map((row) => {
                const nearest = Number(row.nearestStopDistanceMeters);
                const color = Number.isFinite(nearest) && nearest <= 500 ? "#0f9f6e" : "#dc2626";
                return (
                  <Marker
                    key={`base-facility-${row.id || row.name}`}
                    position={[row.latitude, row.longitude]}
                    icon={color === "#0f9f6e" ? baselineFacilityNearIcon : baselineFacilityFarIcon}
                    opacity={softenContextLayers ? 0.58 : 0.88}
                  >
                    <Popup>
                      <div className="simulation-popup">
                        <div>{row.name || "Healthcare facility"}</div>
                        <div>Nearest stop: {Number.isFinite(nearest) ? `${Math.round(nearest).toLocaleString()}m` : "N/A"}</div>
                      </div>
                    </Popup>
                  </Marker>
                );
              })
            : null}
        </Pane>

        <Pane name="scenario-entities" style={{ zIndex: 470 }}>
          {recommendedPlacementMarkers.map((row, idx) => (
            <Marker
              key={`recommended-placement-${idx}`}
              position={[Number(row.latitude), Number(row.longitude)]}
              icon={recommendedMarkerIcon}
              opacity={placement ? 0.2 : 0.88}
              eventHandlers={{
                click: () => onRecommendedPlacementSelect?.(row)
              }}
            >
              <Popup>
                <div className="simulation-popup">
                  <div>{row.label || "Recommended candidate"}</div>
                  <div>Click marker to place scenario here</div>
                  <div>Rank score: {Number(row.score || 0).toFixed(3)}</div>
                </div>
              </Popup>
            </Marker>
          ))}
          {scenarioAddedFacilities.map((row, idx) => (
            <Marker
              key={`scenario-facility-${idx}`}
              position={[Number(row.latitude), Number(row.longitude)]}
              icon={scenarioFacilityIcon}
            >
              <Popup>
                <div className="simulation-popup">
                  <div>Scenario healthcare facility</div>
                  <div>{row.source === "auto" ? "Model-placed option" : "Planner-placed option"}</div>
                </div>
              </Popup>
            </Marker>
          ))}
          {scenarioAddedStops.map((row, idx) => (
            <Marker
              key={`scenario-stop-${idx}`}
              position={[Number(row.latitude), Number(row.longitude)]}
              icon={scenarioStopIcon}
            >
              <Popup>
                <div className="simulation-popup">
                  <div>Scenario transport stop</div>
                  <div>{row.source === "auto" ? "Model-placed option" : "Planner-placed option"}</div>
                </div>
              </Popup>
            </Marker>
          ))}
        </Pane>

        <Pane name="placement" style={{ zIndex: 480 }}>
          {placement ? (
            <>
              <Marker
                position={[placement.latitude, placement.longitude]}
                draggable
                icon={scenarioIcon}
                eventHandlers={{
                  dragend: (event) => {
                    const latLng = event.target.getLatLng();
                    onPlacementChange?.({
                      latitude: latLng.lat,
                      longitude: latLng.lng
                    });
                  }
                }}
              >
                <Popup>{markerDesign.label}</Popup>
              </Marker>
              {showInfluenceZone ? (
                <Circle
                  center={[placement.latitude, placement.longitude]}
                  radius={markerDesign.radiusM}
                  pathOptions={{
                    color: markerDesign.color,
                    fillColor: markerDesign.color,
                    fillOpacity: 0.12,
                    weight: 1.8,
                    dashArray: "6 4"
                  }}
                />
              ) : null}
            </>
          ) : null}
        </Pane>
      </MapContainer>

      <div className="simulation-map-quick-toggles" aria-label="Map display options">
        <label className="simulation-map-toggle">
          <input type="checkbox" checked={showBaselineStops} onChange={(event) => onShowBaselineStopsChange?.(event.target.checked)} />
          <span>Transport stops</span>
        </label>
      </div>

      {showMapLegend ? <div className="simulation-floating-legend map-legend" aria-label="Map legend">
        <section>
          <h4 className="legend-section-title">{isPlacementMode ? "Accessibility context" : "Access pattern"}</h4>
          <div>
              {legendItems.map((item) => (
                <div key={item.label} className="simulation-legend-row legend-row">
                  <span className="legend-dot" style={{ backgroundColor: item.color }} />
                  <span>{item.label}</span>
                </div>
              ))}
          </div>
        </section>
        <section>
          <div className="legend-divider" />
          <h4 className="legend-section-title">{isPlacementMode ? "Planner markers" : "Planning layers"}</h4>
          <div>
              {markerLegendItems.map((item) => (
                <div key={item.label} className="simulation-legend-row legend-row">
                  <span
                    className={`legend-dot simulation-legend-swatch simulation-legend-swatch--${item.shape || "dot"}`}
                    style={{ "--swatch-color": item.color, backgroundColor: item.shape === "ring" ? "transparent" : item.color, borderColor: item.color }}
                  />
                  <span>{item.label}</span>
                </div>
              ))}
          </div>
          {isPlacementMode ? <small className="simulation-legend-note">Baseline layers are softened during placement to keep the tested intervention visible.</small> : null}
        </section>
      </div> : null}

      {isLoading ? (
        <div className="simulation-map-loading">
          <div>{loadingLabel}</div>
        </div>
      ) : null}
    </div>
  );
}
