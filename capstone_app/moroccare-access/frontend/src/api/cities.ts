import apiClient, { requestJson } from "./client";
import type {
  BaselineResponse,
  CityDto,
  DistrictGeoJsonResponse,
  ExplainabilityResponse,
  RankingResponse,
  RecommendationResponse,
  SummaryResponse,
  UploadCityResponse
} from "../types/api";

export function fetchCities() {
  return requestJson<CityDto[]>(() => apiClient.get("/api/cities"), 1);
}

export function fetchApiHealth() {
  return requestJson<{ status: string }>(() => apiClient.get("/api/health"), 0);
}

export function fetchCityBaseline(cityId: string) {
  return requestJson<BaselineResponse>(() => apiClient.get(`/api/cities/${cityId}/baseline`), 1);
}

export function fetchCitySummary(cityId: string) {
  return requestJson<SummaryResponse>(() => apiClient.get(`/api/cities/${cityId}/summary`), 1);
}

export function fetchCityDistrictGeojson(cityId: string) {
  return requestJson<DistrictGeoJsonResponse>(() => apiClient.get(`/api/cities/${cityId}/districts`), 1);
}

export function fetchCityRanking(cityId: string) {
  return requestJson<RankingResponse>(() => apiClient.get(`/api/cities/${cityId}/ranking`), 1);
}

export function fetchCityRecommendations(cityId: string) {
  return requestJson<RecommendationResponse>(() => apiClient.get(`/api/cities/${cityId}/recommendations`), 1);
}

export function fetchCityExplainability(cityId: string) {
  return requestJson<ExplainabilityResponse>(() => apiClient.get(`/api/cities/${cityId}/explainability`), 1);
}

export function uploadCityData(formData: FormData) {
  return requestJson<UploadCityResponse>(
    () =>
      apiClient.post("/api/cities/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" }
      }),
    0
  );
}

export function uploadCityDataForCity(
  cityId: string,
  formData: FormData,
  opts?: { cityName?: string; isNewCity?: boolean; onUploadProgress?: (evt: { loaded: number; total?: number }) => void }
) {
  const params = new URLSearchParams();
  params.set("is_new_city", String(Boolean(opts?.isNewCity)));
  if (opts?.cityName) params.set("city_name", opts.cityName);
  return requestJson<UploadCityResponse>(
    () =>
      apiClient.post(`/api/cities/${cityId}/upload?${params.toString()}`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: opts?.onUploadProgress as never
      }),
    0
  );
}

