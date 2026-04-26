import axios, { AxiosError, type AxiosResponse } from "axios";
import type { ApiErrorPayload } from "../types/api";

export const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000
});

export class ApiError extends Error {
  status?: number;
  detail?: string;
  constructor(message: string, status?: number, detail?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

function unwrapResponse<T>(response: AxiosResponse<T>): T {
  return response.data;
}

function toApiError(error: unknown): never {
  const axiosError = error as AxiosError<ApiErrorPayload>;
  const status = axiosError.response?.status;
  const rawDetail = axiosError.response?.data?.detail ?? axiosError.response?.data?.message ?? axiosError.message;
  const detail =
    typeof rawDetail === "string"
      ? rawDetail
      : (() => {
          try {
            return JSON.stringify(rawDetail);
          } catch {
            return String(rawDetail);
          }
        })();
  const requestPath = axiosError.config?.url || "unknown endpoint";
  const message = status
    ? `Request to ${requestPath} failed with status ${status}: ${detail}`
    : `Request to ${requestPath} failed: ${detail}`;
  throw new ApiError(message || "Unexpected API error", status, detail);
}

// Generic request helper centralizes retries, timeout behavior, and error shape.
export async function requestJson<T>(request: () => Promise<AxiosResponse<T>>, retries = 1): Promise<T> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await request();
      return unwrapResponse(response);
    } catch (error) {
      lastError = error;
      const axiosError = error as AxiosError;
      const isRetryable = !axiosError.response || (axiosError.response.status >= 500 && axiosError.response.status < 600);
      if (!isRetryable || attempt === retries) {
        toApiError(lastError);
      }
    }
  }
  toApiError(lastError);
}

export default apiClient;

