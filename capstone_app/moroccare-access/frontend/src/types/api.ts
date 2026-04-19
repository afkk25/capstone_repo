export type ApiErrorPayload = {
  detail?: string;
  message?: string;
};

export type CityDto = {
  id?: string;
  name?: string;
  city_id?: string;
  display_name?: string;
  center_lat?: number | null;
  center_lon?: number | null;
};

export type BaselineFacilityDto = {
  id?: string | number;
  name?: string;
  district_name?: string;
  urban_ring?: string;
  latitude?: number;
  longitude?: number;
  geometry?: unknown;
  accessibility_score?: number;
  travel_time_min?: number;
  score_2sfca?: number;
  underserved?: number | boolean;
  vulnerability_score?: number;
  population?: number;
  baseline_score?: number;
  simulated_score?: number;
  delta?: number;
};

export type TransportStopDto = {
  stop_name?: string;
  latitude?: number;
  longitude?: number;
  cluster_id?: number | null;
  mode?: string | string[];
  lines?: string | string[];
};

export type BaselineResponse = {
  facilities?: BaselineFacilityDto[];
  transport_stops?: TransportStopDto[];
  equity?: Record<string, unknown>;
  scenarios_available?: string[];
};

export type DistrictGeoJsonResponse = {
  type?: string;
  features?: Array<{
    type?: string;
    geometry?: unknown;
    properties?: Record<string, unknown>;
  }>;
};

export type SummaryResponse = {
  city_id: string;
  summary: {
    avg_travel_time?: number;
    pct_above_45min?: number;
    underserved_population?: number;
    avg_accessibility_score?: number;
  };
};

export type RankingRowDto = {
  district?: string;
  avg_accessibility_score?: number;
  underserved_pct?: number;
  population?: number;
  rank?: number;
};

export type RankingResponse = {
  city_id: string;
  ranking: RankingRowDto[];
};

export type RecommendationDto = {
  rank: number;
  scenario: string;
  score?: number;
  inequality_reduction?: number;
  population_impact?: number;
  explanation?: string;
};

export type RecommendationResponse = {
  city_id: string;
  recommendations: RecommendationDto[];
};

export type ExplainabilityRowDto = {
  feature?: string;
  importance?: number;
};

export type ExplainabilityResponse = {
  city_id: string;
  feature_importance: ExplainabilityRowDto[];
};

export type SimulationRequest = {
  stop_density_multiplier?: number;
  reduce_nearest_stop_distance_pct?: number;
  add_facilities?: number;
  walking_speed_mps?: number;
  waiting_time_min?: number;
  transport_speed_kmh?: number;
};

export type SimulationResponse = {
  facilities?: BaselineFacilityDto[];
  avg_delta?: number;
  equity?: Record<string, unknown>;
};

export type SensitivityResponse = {
  city_id: string;
  assumptions?: {
    walking_speed_mps?: number;
    waiting_time_min?: number;
    transport_speed_kmh?: number;
  };
  derived_scenario?: SimulationRequest;
  comparison?: {
    delta_travel_time?: number;
    delta_accessibility?: number;
    improvement_percentage?: number;
    inequality_change?: number;
    waiting_time_factor?: number;
  };
};

export type ComparisonResponse = {
  city_id: string;
  scenario?: SimulationRequest;
  comparison?: {
    delta_travel_time?: number;
    delta_accessibility?: number;
    improvement_percentage?: number;
    inequality_change?: number;
  };
  districts_improved?: number;
  districts_total?: number;
  population_affected?: number;
  ranking_before?: RankingRowDto[];
  ranking_after?: RankingRowDto[];
};

export type UploadCityResponse = {
  success?: boolean;
  city_summary?: {
    city_id: string;
    display_name: string;
    center_lat: number;
    center_lon: number;
    facilities_count: number;
  };
};

export type FrontendDistrict = {
  id: string;
  districtName: string;
  urbanRing: string;
  latitude: number;
  longitude: number;
  geometry?: unknown;
  accessibilityScore: number;
  baselineScore: number;
  travelTimeMin: number;
  score2sfca: number;
  underserved: number;
  population: number;
  delta: number;
};

