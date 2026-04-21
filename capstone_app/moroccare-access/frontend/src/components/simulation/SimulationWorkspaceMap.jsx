import { useEffect, useMemo } from "react";
import L from "leaflet";
import { Circle, CircleMarker, MapContainer, Marker, Pane, Popup, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { FALLBACK_CENTER } from "../../utils/adapters";

function accessibilityColor(value) {
  if (value < 0.35) return "#D85A30";
  if (value <= 0.65) return "#EF9F27";
  return "#3B6D11";
}

function impactColor(delta) {
  if (delta >= 0.02) return "#1D4ED8";
  if (delta >= 0.005) return "#60A5FA";
  if (delta <= -0.02) return "#B91C1C";
  if (delta <= -0.005) return "#F87171";
  return "#6B7280";
}

function layerLegend(layer) {
  if (layer === "impact") {
    return [
      { color: "#1D4ED8", label: "Noticeable improvement" },
      { color: "#60A5FA", label: "Small improvement" },
      { color: "#6B7280", label: "Little or no change" },
      { color: "#F87171", label: "Small decline" },
      { color: "#B91C1C", label: "Noticeable decline" }
    ];
  }
  if (layer === "after") {
    return [
      { color: "#3B6D11", label: "Higher access after scenario" },
      { color: "#EF9F27", label: "Moderate access after scenario" },
      { color: "#D85A30", label: "Lower access after scenario" }
    ];
  }
  return [
    { color: "#3B6D11", label: "Higher baseline access" },
    { color: "#EF9F27", label: "Moderate baseline access" },
    { color: "#D85A30", label: "Lower baseline access" }
  ];
}

function mapPointForMarker(interventionType) {
  if (interventionType === "add_transport_stop") return { color: "#2563EB", symbol: "S", radiusM: 500, label: "New transport stop" };
  if (interventionType === "add_healthcare_facility")
    return { color: "#7C3AED", symbol: "H", radiusM: 1000, label: "New healthcare facility" };
  return { color: "#B45309", symbol: "I", radiusM: 800, label: "Service improvement focus area" };
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
  showInfluenceZone = true,
  isLoading = false
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
        html: `<div style="width:24px;height:24px;border-radius:9999px;background:${markerDesign.color};color:white;border:2px solid white;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;box-shadow:0 2px 8px rgba(0,0,0,0.25)">${markerDesign.symbol}</div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12]
      }),
    [markerDesign.color, markerDesign.symbol]
  );

  const canPlaceFromMap = Boolean(interventionType);
  const legendItems = layerLegend(activeLayer);
  const markerLegendItems = [
    { color: "#334155", label: "Baseline origin points" }
  ];
  if (showBaselineStops) {
    markerLegendItems.push({ color: "#6B7280", label: "Existing transport stops" });
  }
  if (showBaselineFacilities) {
    markerLegendItems.push({ color: "#CBD5E1", label: "Existing healthcare facilities" });
  }
  if (hasSimulation && impactedSet.size) {
    markerLegendItems.push({ color: "#1E3A8A", label: "Impacted origins" });
  }
  if (scenarioAddedFacilities.length) {
    markerLegendItems.push({ color: "#7C3AED", label: "Added scenario facilities" });
  }
  if (scenarioAddedStops.length) {
    markerLegendItems.push({ color: "#2563EB", label: "Added scenario stops" });
  }
  if (interventionType) {
    markerLegendItems.push({ color: markerDesign.color, label: markerDesign.label });
  }
  const mapCenter = useMemo(() => {
    const lat = Number(city?.center_lat);
    const lon = Number(city?.center_lon);
    if (Number.isFinite(lat) && Number.isFinite(lon)) return [lat, lon];
    if (baselineFacilities.length) return [baselineFacilities[0].latitude, baselineFacilities[0].longitude];
    return [FALLBACK_CENTER.center_lat, FALLBACK_CENTER.center_lon];
  }, [baselineFacilities, city?.center_lat, city?.center_lon]);

  if (!city) {
    return <div className="panel-card flex h-full items-center justify-center p-6 text-sm text-gray-500">Select a city to start map-based simulation.</div>;
  }

  return (
    <div className="panel-card relative h-full overflow-hidden">
      <MapContainer center={mapCenter} zoom={city?.default_zoom || 11} className="h-full w-full" scrollWheelZoom preferCanvas>
        <FitToData center={mapCenter} rows={rowsForBounds} placement={placement} />
        <PlacementSelector enabled={canPlaceFromMap} onSelect={onPlacementChange} />
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

        <Pane name="origins" style={{ zIndex: 430 }}>
          {mergedRows.map((row) => {
            const selected = selectedDistrictId === row.id;
            const impacted = impactedSet.has(row.id);
            const displayScore = activeLayer === "after" ? row.simulatedAccessibility : row.accessibilityScore;
            const fillColor = activeLayer === "impact" ? impactColor(row.deltaAccessibility) : accessibilityColor(displayScore);
            return (
              <CircleMarker
                key={`origin-${row.id}`}
                center={[row.latitude, row.longitude]}
                radius={activeLayer === "impact" && impacted ? 9.5 : 8}
                pathOptions={{
                  color: selected ? "#0F172A" : impacted ? "#1E3A8A" : fillColor,
                  fillColor,
                  fillOpacity: 0.82,
                  weight: selected ? 2.4 : impacted ? 2 : 1.3,
                  dashArray: activeLayer === "impact" && impacted ? "4 3" : undefined
                }}
              >
                <Popup>
                  <div className="space-y-1 text-xs">
                    <div className="font-semibold text-gray-900">{row.originName || row.districtName}</div>
                    <div>Baseline accessibility: {(row.accessibilityScore * 100).toFixed(1)}%</div>
                    {hasSimulation ? <div>After scenario: {(row.simulatedAccessibility * 100).toFixed(1)}%</div> : null}
                    {hasSimulation ? <div>Change: {(row.deltaAccessibility * 100).toFixed(2)} percentage points</div> : null}
                    <div>Baseline travel time: {row.travelTimeMin.toFixed(1)} min</div>
                    {hasSimulation ? <div>After travel time: {row.simulatedTravelTime.toFixed(1)} min</div> : null}
                  </div>
                </Popup>
              </CircleMarker>
            );
          })}
        </Pane>

        <Pane name="baseline-stops" style={{ zIndex: 420 }}>
          {showBaselineStops
            ? validStops.map((stop, idx) => (
                <CircleMarker
                  key={`stop-${stop.cluster_id ?? idx}`}
                  center={[Number(stop.latitude), Number(stop.longitude)]}
                  radius={2.8}
                  pathOptions={{ color: "#6B7280", fillColor: "#6B7280", fillOpacity: 0.45, opacity: 0.55, weight: 1 }}
                />
              ))
            : null}
        </Pane>

        <Pane name="baseline-facilities" style={{ zIndex: 425 }}>
          {showBaselineFacilities
            ? baselineSupplyFacilities.map((row) => (
                <CircleMarker
                  key={`base-facility-${row.id || row.name}`}
                  center={[row.latitude, row.longitude]}
                  radius={3.2}
                  pathOptions={{ color: "#475569", fillColor: "#CBD5E1", fillOpacity: 0.85, weight: 1 }}
                />
              ))
            : null}
        </Pane>

        <Pane name="scenario-entities" style={{ zIndex: 455 }}>
          {scenarioAddedFacilities.map((row, idx) => (
            <CircleMarker
              key={`scenario-facility-${idx}`}
              center={[Number(row.latitude), Number(row.longitude)]}
              radius={5}
              pathOptions={{ color: "#5B21B6", fillColor: "#7C3AED", fillOpacity: 0.85, weight: 1.4 }}
            >
              <Popup>
                <div className="text-xs">
                  <div className="font-semibold text-gray-900">Scenario facility</div>
                  <div>{row.source === "auto" ? "Automatically placed" : "User placed"}</div>
                </div>
              </Popup>
            </CircleMarker>
          ))}
          {scenarioAddedStops.map((row, idx) => (
            <CircleMarker
              key={`scenario-stop-${idx}`}
              center={[Number(row.latitude), Number(row.longitude)]}
              radius={4.2}
              pathOptions={{ color: "#1E40AF", fillColor: "#2563EB", fillOpacity: 0.85, weight: 1.4 }}
            >
              <Popup>
                <div className="text-xs">
                  <div className="font-semibold text-gray-900">Scenario transport stop</div>
                  <div>{row.source === "auto" ? "Automatically placed" : "User placed"}</div>
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

      <div className="absolute left-3 top-3 z-[900] rounded-lg border border-gray-200 bg-white/95 p-3 text-xs shadow-sm">
        <div className="font-semibold uppercase tracking-wide text-gray-500">Map layers</div>
        <div className="mt-2 space-y-1">
          <label className="flex items-center gap-2">
            <input type="radio" name="sim-map-layer" checked={activeLayer === "baseline"} onChange={() => onMapLayerChange?.("baseline")} />
            Baseline view
          </label>
          {hasSimulation ? (
            <label className="flex items-center gap-2">
              <input type="radio" name="sim-map-layer" checked={activeLayer === "impact"} onChange={() => onMapLayerChange?.("impact")} />
              Impact view
            </label>
          ) : null}
          {hasSimulation ? (
            <label className="flex items-center gap-2">
              <input type="radio" name="sim-map-layer" checked={activeLayer === "after"} onChange={() => onMapLayerChange?.("after")} />
              After scenario
            </label>
          ) : null}
        </div>
      </div>

      <div className="absolute right-3 top-3 z-[900] max-w-[260px] rounded-lg border border-gray-200 bg-white/95 p-3 text-xs shadow-sm">
        <div className="font-semibold uppercase tracking-wide text-gray-500">Map guide</div>
        <div className="mt-2 space-y-3">
          <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Origin shading</div>
            <div className="mt-1 space-y-1.5">
              {legendItems.map((item) => (
                <div key={item.label} className="flex items-center gap-2 text-gray-700">
                  <span className="inline-block h-3.5 w-5 rounded-full" style={{ backgroundColor: item.color }} />
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Map markers</div>
            <div className="mt-1 space-y-1.5">
              {markerLegendItems.map((item) => (
                <div key={item.label} className="flex items-center gap-2 text-gray-700">
                  <span className="inline-block h-3.5 w-5 rounded-full" style={{ backgroundColor: item.color }} />
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="absolute bottom-3 left-3 z-[900] max-w-[350px] rounded-lg border border-gray-200 bg-white/95 px-3 py-2 text-xs text-gray-700 shadow-sm">
        {canPlaceFromMap ? "Click the map to place the marker, then drag it to fine-tune the location." : "Select an intervention to enable map placement."}
      </div>

      {isLoading ? (
        <div className="absolute inset-0 z-[920] flex items-center justify-center bg-white/75 p-4">
          <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm">Loading map data...</div>
        </div>
      ) : null}
    </div>
  );
}
