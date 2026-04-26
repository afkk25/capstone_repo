import { useEffect, useMemo } from "react";
import L from "leaflet";
import { Circle, CircleMarker, MapContainer, Marker, Pane, Popup, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { FALLBACK_CENTER } from "../../utils/adapters";
import { getLatLngFromFeature } from "../../utils/mapCoordinates";
import { useI18n } from "../../i18n/I18nProvider";

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

function layerLegend(layer, t) {
  if (layer === "impact") {
    return [
      { color: "#1d4ed8", label: t("map.improvedBaseline") },
      { color: "#6b7280", label: t("map.noMajorChange") },
      { color: "#b91c1c", label: t("map.declinedBaseline") }
    ];
  }
  if (layer === "after") {
    return [
      { color: "#2ecc71", label: t("mapPage.highAccessibility") },
      { color: "#f39c12", label: t("mapPage.moderateAccessibility") },
      { color: "#e74c3c", label: t("mapPage.lowAccessibility") }
    ];
  }
  return [
    { color: "#2ecc71", label: t("mapPage.highAccessibility") },
    { color: "#f39c12", label: t("mapPage.moderateAccessibility") },
    { color: "#e74c3c", label: t("mapPage.lowAccessibility") }
  ];
}

function mapPointForMarker(interventionType, t) {
  if (interventionType === "add_transport_stop") return { color: "#2563eb", symbol: "S", radiusM: 500, label: t("map.transportStop") };
  if (interventionType === "add_healthcare_facility")
    return { color: "#7c3aed", symbol: "H", radiusM: 1000, label: t("simflow.healthcareFacility") };
  return { color: "#7c3aed", symbol: "A", radiusM: 800, label: t("simflow.chooseInterventionHint") };
}

function buildScenarioIcon({ color, symbol, variant = "scenario", label = "" }) {
  const size = variant === "placement" ? 38 : variant === "scenario-facility" || variant === "scenario-stop" ? 20 : 28;
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

    const placementLatLng = getLatLngFromFeature(placement);
    if (placementLatLng) {
      points.push(placementLatLng);
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
  const { t } = useI18n();
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

  const markerDesign = mapPointForMarker(interventionType, t);
  const isPlacementMode = Boolean(interventionType) && !hasSimulation;
  const softenContextLayers = Boolean(interventionType);
  const scenarioIcon = useMemo(
    () => buildScenarioIcon({ color: markerDesign.color, symbol: markerDesign.symbol, variant: "placement", label: markerDesign.label }),
    [markerDesign.color, markerDesign.symbol]
  );
  const scenarioFacilityIcon = useMemo(() => buildScenarioIcon({ color: "#7c3aed", symbol: "H", variant: "scenario-facility", label: t("simflow.scenarioHealthcareFacility") }), [t]);
  const scenarioStopIcon = useMemo(() => buildScenarioIcon({ color: "#2563eb", symbol: "S", variant: "scenario-stop", label: t("simflow.scenarioTransportStop") }), [t]);
  const baselineFacilityNearIcon = useMemo(() => buildScenarioIcon({ color: "#0f9f6e", symbol: "H", variant: "baseline-facility", label: t("simflow.baselineHealthcareSupply") }), [t]);
  const baselineFacilityFarIcon = useMemo(() => buildScenarioIcon({ color: "#dc2626", symbol: "H", variant: "baseline-facility", label: t("simflow.lowTransitHealthcareSupply") }), [t]);
  const recommendedMarkerIcon = useMemo(() => buildScenarioIcon({ color: "#f59e0b", symbol: "R", variant: "recommended", label: t("simflow.recommendedCandidate") }), [t]);

  const canPlaceFromMap = Boolean(interventionType);
  const legendItems = layerLegend(activeLayer, t);
  const markerLegendItems = [
    { color: "#94a3b8", label: t("simflow.baselineDemandOrigins"), shape: "dot" },
    ...(showBaselineStops ? [{ color: "#9bdaf0", label: t("simflow.baselineTransportStops"), shape: "diamond" }] : []),
    ...(showBaselineFacilities
      ? [
          { color: "#0f9f6e", label: t("simflow.baselineHealthcareSupply"), shape: "square" },
          { color: "#dc2626", label: t("simflow.lowTransitHealthcareSupply"), shape: "square" }
        ]
      : []),
    ...(interventionType ? [{ color: markerDesign.color, label: t("simflow.plannerAddedIntervention"), shape: "rounded" }] : []),
    ...(recommendedPlacementMarkers.length ? [{ color: "#f59e0b", label: t("simflow.suggestedCandidateSite"), shape: "ring" }] : [])
  ];
  const mapCenter = useMemo(() => {
    const lat = Number(city?.center_lat);
    const lon = Number(city?.center_lon);
    if (Number.isFinite(lat) && Number.isFinite(lon)) return [lat, lon];
    const firstValid = baselineFacilities.map((row) => getLatLngFromFeature(row)).find((latLng) => Array.isArray(latLng));
    if (firstValid) return firstValid;
    return [FALLBACK_CENTER.center_lat, FALLBACK_CENTER.center_lon];
  }, [baselineFacilities, city?.center_lat, city?.center_lon]);
  const placementLatLng = getLatLngFromFeature(placement);

  if (!city) {
    return <div className="simulation-map-empty">{t("simflow.selectCityToPlan")}</div>;
  }

  return (
    <div className={`simulation-map-shell ${isPlacementMode ? "is-placement-mode" : ""}`}>
      {hasSimulation ? (
        <div className="simulation-map-view-toggle" aria-label={t("simflow.mapResultLayer")}>
          {[
            { id: "baseline", label: t("simflow.baselineMetrics") },
            { id: "after", label: t("map.scenario") },
            { id: "impact", label: t("simflow.impact") }
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
            const latLng = getLatLngFromFeature(row);
            if (!latLng) return null;
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
                center={latLng}
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
                    <div>{row.analysisUnit === "facility_proxy" ? t("simflow.facilityProxyAnalysisPoint") : t("simflow.demandOriginAnalysisPoint")}</div>
                    <div>{t("simflow.baselineAccessibility")}: {(row.accessibilityScore * 100).toFixed(1)}%</div>
                    {hasSimulation ? <div>{t("simflow.scenarioAccessibility")}: {(row.simulatedAccessibility * 100).toFixed(1)}%</div> : null}
                    {hasSimulation ? <div>{t("simflow.planningChange")}: {(row.deltaAccessibility * 100).toFixed(2)} pp</div> : null}
                    <div>{t("simflow.baselineTravelTime")}: {row.travelTimeMin.toFixed(1)} min</div>
                    {hasSimulation ? <div>{t("simflow.scenarioTravelTime")}: {row.simulatedTravelTime.toFixed(1)} min</div> : null}
                  </div>
                </Popup>
              </CircleMarker>
            );
          }) : null}
        </Pane>

        <Pane name="baseline-stops" style={{ zIndex: 460 }}>
          {showBaselineStops
            ? validStops.map((stop, idx) => {
                const latLng = getLatLngFromFeature(stop);
                if (!latLng) return null;
                return (
                <CircleMarker
                  key={`stop-${stop.cluster_id ?? idx}`}
                  center={latLng}
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
                      <div>{stop.stop_name || `${t("map.transportStop")} ${stop.cluster_id ?? idx + 1}`}</div>
                      <div>{t("simflow.baselineTransportAccessPoint")}</div>
                    </div>
                  </Popup>
                </CircleMarker>
                );
              })
            : null}
        </Pane>

        <Pane name="baseline-facilities" style={{ zIndex: 465 }}>
          {showBaselineFacilities
            ? baselineSupplyFacilities.map((row) => {
                const latLng = getLatLngFromFeature(row);
                if (!latLng) return null;
                const nearest = Number(row.nearestStopDistanceMeters);
                const color = Number.isFinite(nearest) && nearest <= 500 ? "#0f9f6e" : "#dc2626";
                return (
                  <Marker
                    key={`base-facility-${row.id || row.name}`}
                    position={latLng}
                    icon={color === "#0f9f6e" ? baselineFacilityNearIcon : baselineFacilityFarIcon}
                    opacity={softenContextLayers ? 0.58 : 0.88}
                  >
                    <Popup>
                      <div className="simulation-popup">
                        <div>{row.name || t("simflow.healthcareFacility")}</div>
                        <div>{t("simflow.nearestStop")}: {Number.isFinite(nearest) ? `${Math.round(nearest).toLocaleString()}m` : t("analytics.na")}</div>
                      </div>
                    </Popup>
                  </Marker>
                );
              })
            : null}
        </Pane>

        <Pane name="scenario-entities" style={{ zIndex: 470 }}>
          {recommendedPlacementMarkers.map((row, idx) => {
            const latLng = getLatLngFromFeature(row);
            if (!latLng) return null;
            return (
            <Marker
              key={`recommended-placement-${idx}`}
              position={latLng}
              icon={recommendedMarkerIcon}
              opacity={placement ? 0.2 : 0.88}
              eventHandlers={{
                click: () => onRecommendedPlacementSelect?.(row)
              }}
            >
              <Popup>
                <div className="simulation-popup">
                  <div>{row.label || t("simflow.recommendedCandidate")}</div>
                  <div>{t("simflow.clickMarkerPlaceHere")}</div>
                  <div>{t("simflow.rankScore")}: {Number(row.score || 0).toFixed(3)}</div>
                </div>
              </Popup>
            </Marker>
            );
          })}
          {scenarioAddedFacilities.map((row, idx) => {
            const latLng = getLatLngFromFeature(row);
            if (!latLng) return null;
            return (
            <Marker
              key={`scenario-facility-${idx}`}
              position={latLng}
              icon={scenarioFacilityIcon}
            >
              <Popup>
                <div className="simulation-popup">
                  <div>{t("simflow.scenarioHealthcareFacility")}</div>
                  <div>{row.source === "auto" ? t("simflow.modelPlacedOption") : t("simflow.plannerPlacedOption")}</div>
                </div>
              </Popup>
            </Marker>
            );
          })}
          {scenarioAddedStops.map((row, idx) => {
            const latLng = getLatLngFromFeature(row);
            if (!latLng) return null;
            return (
            <Marker
              key={`scenario-stop-${idx}`}
              position={latLng}
              icon={scenarioStopIcon}
            >
              <Popup>
                <div className="simulation-popup">
                  <div>{t("simflow.scenarioTransportStop")}</div>
                  <div>{row.source === "auto" ? t("simflow.modelPlacedOption") : t("simflow.plannerPlacedOption")}</div>
                </div>
              </Popup>
            </Marker>
            );
          })}
        </Pane>

        <Pane name="placement" style={{ zIndex: 480 }}>
          {placementLatLng ? (
            <>
              <Marker
                position={placementLatLng}
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
                  center={placementLatLng}
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
          <span>{t("map.showStops")}</span>
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
          {isPlacementMode ? <small className="simulation-legend-note">{t("simflow.baselineSoftenedNote")}</small> : null}
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
