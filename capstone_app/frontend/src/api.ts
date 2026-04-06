import { District, Hospital, SimulationRequest, SimulationResponse } from "./types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json"
    },
    ...options
  });

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

export function fetchDistricts(): Promise<District[]> {
  return request<District[]>("/districts");
}

export function fetchHospitals(): Promise<Hospital[]> {
  return request<Hospital[]>("/hospitals");
}

export function runSimulation(payload: SimulationRequest): Promise<SimulationResponse> {
  return request<SimulationResponse>("/simulate", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

