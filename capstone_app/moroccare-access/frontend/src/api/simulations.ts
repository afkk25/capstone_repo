import apiClient, { ApiError, requestJson } from "./client";
import type { ComparisonResponse, PointSimulationRequest, SensitivityResponse, SimulationRequest, SimulationResponse } from "../types/api";

export function runSimulation(cityId: string, payload: SimulationRequest | PointSimulationRequest) {
  const isPointPayload = payload && typeof payload === "object" && "intervention_type" in payload;
  if (isPointPayload) {
    const point = payload as PointSimulationRequest;
    return requestJson<SimulationResponse>(
      () =>
        apiClient.post(`/api/simulate`, {
          city_id: point.city_id || cityId,
          intervention_type: point.intervention_type,
          latitude: point.latitude,
          longitude: point.longitude
        }),
      0
    );
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

