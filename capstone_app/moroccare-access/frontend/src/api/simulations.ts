import apiClient, { ApiError, requestJson } from "./client";
import type { ComparisonResponse, SensitivityResponse, SimulationRequest, SimulationResponse } from "../types/api";

type PointSimulationRequest = {
  intervention_type: string;
  latitude: number;
  longitude: number;
};

export function runSimulation(cityId: string, payload: SimulationRequest | PointSimulationRequest) {
  const isPointPayload = payload && typeof payload === "object" && "intervention_type" in payload;
  if (isPointPayload && String(cityId || "").toLowerCase() === "casablanca") {
    return requestJson<SimulationResponse>(() => apiClient.post("/api/simulate", payload), 0);
  }
  if (isPointPayload) {
    const point = payload as PointSimulationRequest;
    const normalizedType = String(point.intervention_type || "").toLowerCase();
    const isHealthcare = normalizedType.includes("healthcare");
    const fallbackPayload: SimulationRequest = {
      stop_density_multiplier: 1.0,
      reduce_nearest_stop_distance_pct: 0.0,
      add_facilities: 0,
      facility_locations: isHealthcare ? [{ latitude: point.latitude, longitude: point.longitude }] : [],
      transport_stop_locations: isHealthcare ? [] : [{ latitude: point.latitude, longitude: point.longitude }]
    };
    return requestJson<SimulationResponse>(() => apiClient.post(`/api/cities/${cityId}/simulate`, fallbackPayload), 0);
  }
  return requestJson<SimulationResponse>(() => apiClient.post(`/api/cities/${cityId}/simulate`, payload), 0);
}

export function runComparison(cityId: string, payload: SimulationRequest) {
  return requestJson<ComparisonResponse>(() => apiClient.post(`/api/cities/${cityId}/compare`, payload), 0);
}

export function runSensitivity(cityId: string, payload: SimulationRequest) {
  return requestJson<SensitivityResponse>(() => apiClient.post(`/api/cities/${cityId}/sensitivity`, payload), 0);
}

export async function exportCityReport(cityId: string, format: "pdf" | "excel"): Promise<void> {
  try {
    const response = await apiClient.get(`/api/cities/${cityId}/export`, {
      params: { format },
      responseType: "blob"
    });
    const extension = format === "excel" ? "xlsx" : "pdf";
    const blob = new Blob([response.data]);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${cityId}_planning_report.${extension}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Export failed";
    throw new ApiError(message);
  }
}

