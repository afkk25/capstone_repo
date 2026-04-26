import type { FrontendDistrict } from "./api";

export type LayerKey = "accessibility" | "travel_time" | "2sfca" | "risk" | "priority";

export type DashboardSummary = {
  averageAccessibility: number;
  averageTravelTime: number;
  underservedCount: number;
  underservedPct: number;
  bestDistrict: FrontendDistrict | null;
  worstDistrict: FrontendDistrict | null;
};

