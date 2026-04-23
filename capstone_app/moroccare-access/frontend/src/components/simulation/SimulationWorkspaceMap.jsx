import { useEffect, useMemo } from "react";
import L from "leaflet";
import { Circle, CircleMarker, MapContainer, Marker, Pane, Popup, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { FALLBACK_CENTER } from "../../utils/adapters";

function getOriginColor(score, mode) {
  if (mode === "impact") {
    if (score > 0.02) return "#3eb489";
    if (score < -0.02) return "#d45353";
    return "#4d6678";
  }
  if (score >= 0.66) return "#3eb489";
  if (score >= 0.33) return "#e07d3c";
  return "#d45353";
}

function layerLegend(layer) {
  if (layer === "impact") {
    return [
      { color: "var(--accent)", label: "Improved" },
      { color: "var(--text-dim)", label: "Minimal effect" },
      { color: "var(--danger)", label: "Declined" }
    ];
  }
  if (layer === "after") {
    return [
      { color: "var(--accent)", label: "Higher access" },
      { color: "var(--yellow)", label: "Moderate access" },
      { color: "var(--danger)", label: "Lower access" }
    ];
  }
  return [
    { color: "var(--accent)", label: "Higher access" },
    { color: "var(--yellow)", label: "Moderate access" },
    { color: "var(--danger)", label: "Lower access" }
  ];
}

function mapPointForMarker(interventionType) {
  if (interventionType === "add_transport_stop") return { color: "#3eb489", symbol: "S", radiusM: 500, label: "New transport stop" };
  if (interventionType === "add_healthcare_facility")
    return { color: "#e07d3c", symbol: "H", radiusM: 1000, label: "New healthcare facility" };
  return { color: "#e07d3c", symbol: "A", radiusM: 800, label: "Access improvement focus area" };
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
  interventionType = "",
  placement = null,
  onPlacementChange,
  selectedDistrictId = null,
  impactedDistrictIds = [],
  mapLayer = "baseline",
  onMapLayerChange,
  showBaselineStops = false,
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
  const scenarioIcon = useMemo(
    () =>
      L.divIcon({
        className: "simulation-placement-icon",
        html: `<div style="width:24px;height:24px;border-radius:9999px;background:${markerDesign.color};color:var(--navy);border:2px solid var(--navy-2);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700">${markerDesign.symbol}</div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12]
      }),
    [markerDesign.color, markerDesign.symbol]
  );

  const canPlaceFromMap = Boolean(interventionType);
  const legendItems = layerLegend(activeLayer);
  const markerLegendItems = [
    { color: "var(--text-muted)", label: "Evaluated location" },
    ...(showBaselineStops ? [{ color: "var(--accent)", label: "Existing stop" }] : []),
    ...(showBaselineFacilities
      ? [
          { color: "#0f9f6e", label: "Facility near transit" },
          { color: "#dc2626", label: "Facility beyond 500m" }
        ]
      : []),
    ...(interventionType ? [{ color: markerDesign.color, label: "Placed intervention" }] : [])
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
    <div className="simulation-map-shell">
      <MapContainer center={mapCenter} zoom={city?.default_zoom || 11} className="h-full w-full" scrollWheelZoom preferCanvas>
        <FitToData center={mapCenter} rows={rowsForBounds} placement={placement} />
        <ResizeMapToContainer />
        <PlacementSelector enabled={canPlaceFromMap} onSelect={onPlacementChange} />
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

        <Pane name="origins" style={{ zIndex: 430 }}>
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
                radius={5}
                pathOptions={{
                  color: "#0f1923",
                  fillColor: getOriginColor(colorScore, activeLayer),
                  opacity: 1,
                  fillOpacity: 0.85,
                  weight: selected ? 2.4 : impacted ? 2 : 1,
                  dashArray: activeLayer === "impact" && impacted ? "4 3" : undefined
                }}
              >
                <Popup>
                  <div className="simulation-popup">
                    <div>{row.originName || row.districtName}</div>
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

        <Pane name="baseline-stops" style={{ zIndex: 420 }}>
          {showBaselineStops
            ? validStops.map((stop, idx) => (
                <CircleMarker
                  key={`stop-${stop.cluster_id ?? idx}`}
                  center={[Number(stop.latitude), Number(stop.longitude)]}
                  radius={2.8}
                  pathOptions={{ color: "#4d6678", fillColor: "#4d6678", fillOpacity: 0.45, opacity: 0.55, weight: 1 }}
                />
              ))
            : null}
        </Pane>

        <Pane name="baseline-facilities" style={{ zIndex: 425 }}>
          {showBaselineFacilities
            ? baselineSupplyFacilities.map((row) => {
                const nearest = Number(row.nearestStopDistanceMeters);
                const color = Number.isFinite(nearest) && nearest <= 500 ? "#0f9f6e" : "#dc2626";
                return (
                  <CircleMarker
                    key={`base-facility-${row.id || row.name}`}
                    center={[row.latitude, row.longitude]}
                    radius={3.2}
                    pathOptions={{ color, fillColor: color, fillOpacity: 0.85, weight: 1 }}
                  >
                    <Popup>
                      <div className="simulation-popup">
                        <div>{row.name || "Healthcare facility"}</div>
                        <div>Nearest stop: {Number.isFinite(nearest) ? `${Math.round(nearest).toLocaleString()}m` : "N/A"}</div>
                      </div>
                    </Popup>
                  </CircleMarker>
                );
              })
            : null}
        </Pane>

        <Pane name="scenario-entities" style={{ zIndex: 455 }}>
          {scenarioAddedFacilities.map((row, idx) => (
            <CircleMarker
              key={`scenario-facility-${idx}`}
              center={[Number(row.latitude), Number(row.longitude)]}
              radius={5}
              pathOptions={{ color: "#e07d3c", fillColor: "#e07d3c", fillOpacity: 0.85, weight: 1.4 }}
            >
              <Popup>
                <div className="simulation-popup">
                  <div>Scenario healthcare facility</div>
                  <div>{row.source === "auto" ? "Model-placed option" : "Planner-placed option"}</div>
                </div>
              </Popup>
            </CircleMarker>
          ))}
          {scenarioAddedStops.map((row, idx) => (
            <CircleMarker
              key={`scenario-stop-${idx}`}
              center={[Number(row.latitude), Number(row.longitude)]}
              radius={4.2}
              pathOptions={{ color: "#3eb489", fillColor: "#3eb489", fillOpacity: 0.85, weight: 1.4 }}
            >
              <Popup>
                <div className="simulation-popup">
                  <div>Scenario transport stop</div>
                  <div>{row.source === "auto" ? "Model-placed option" : "Planner-placed option"}</div>
                </div>
              </Popup>
            </CircleMarker>
          ))}
        </Pane>

        <Pane name="placement" style={{ zIndex: 460 }}>
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

      {hasSimulation ? (
        <div className="simulation-map-view-toggle" aria-label="Scenario map view">
          {[
            { id: "baseline", label: "Baseline" },
            { id: "impact", label: "Impact" },
            { id: "after", label: "After" }
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              className={activeLayer === item.id ? "is-selected" : ""}
              onClick={() => onMapLayerChange?.(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}

      {showMapLegend ? <div className="simulation-floating-legend map-legend" aria-label="Map legend">
        <section>
          <h4 className="legend-section-title">Access pattern</h4>
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
          <h4 className="legend-section-title">Planning layers</h4>
          <div>
              {markerLegendItems.map((item) => (
                <div key={item.label} className="simulation-legend-row legend-row">
                  <span className="legend-dot" style={{ backgroundColor: item.color }} />
                  <span>{item.label}</span>
                </div>
              ))}
          </div>
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
