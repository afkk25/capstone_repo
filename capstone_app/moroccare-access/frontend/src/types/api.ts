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
  default_zoom?: number | null;
  datasets?: Record<string, string>;
  simulation?: {
    capabilities?: Record<string, boolean>;
    default_parameters?: {
      stop_density_multiplier?: number;
      reduce_nearest_stop_distance_pct?: number;
      add_facilities?: number;
      walking_speed_mps?: number;
      waiting_time_min?: number;
      transport_speed_kmh?: number;
    };
    interventions?: Array<{
      id?: string;
      label?: string;
      backend_intervention_type?: string;
      placement_target?: "facility_locations" | "transport_stop_locations" | string;
      scenario_patch?: Record<string, unknown>;
      aliases?: string[];
    }>;
  };
  simulation_capabilities?: Record<string, boolean>;
  supported_intervention_types?: string[];
  artifact_paths?: Record<string, string>;
  feature_flags?: Record<string, boolean>;
};

export type BaselineFacilityDto = {
  id?: string | number;
  name?: string;
  origin_id?: string | number;
  district?: string;
  district_name?: string;
  district_id?: string | number | null;
  urban_ring?: string;
  lat?: number;
  lon?: number;
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
  before_score?: number;
  after_score?: number;
  before_travel_time_min?: number;
  delta?: number;
};

export type OriginDto = BaselineFacilityDto;

export type FacilityPointDto = {
  id?: string | number;
  name?: string;
  latitude?: number;
  longitude?: number;
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
  analysis_unit?: string;
  warnings?: string[];
  origins?: OriginDto[];
  facilities?: FacilityPointDto[] | BaselineFacilityDto[]; // legacy backends may still send origin rows here
  transport_stops?: TransportStopDto[];
  district_summaries?: Array<{
    district_name?: string;
    district_id?: string | number | null;
    origin_count?: number;
    population?: number;
    avg_accessibility_score?: number;
    underserved_pct?: number;
    rank?: number;
    centroid_latitude?: number;
    centroid_longitude?: number;
  }>;
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
  intervention_type?: string;
  latitude?: number;
  longitude?: number;
  stop_density_multiplier?: number;
  reduce_nearest_stop_distance_pct?: number;
  add_facilities?: number;
  facility_locations?: Array<{ latitude: number; longitude: number }>;
  transport_stop_locations?: Array<{ latitude: number; longitude: number }>;
  existing_facility_locations?: Array<{ latitude: number; longitude: number }>;
  walking_speed_mps?: number;
  waiting_time_min?: number;
  transport_speed_kmh?: number;
};

export type PointSimulationRequest = {
  city_id?: string;
  intervention_type: string;
  latitude: number;
  longitude: number;
};

export type SimulationResponse = {
  city_id?: string;
  analysis_unit?: string;
  warnings?: string[];
  summary?: {
    city_before_avg_score: number;
    city_after_avg_score: number;
    city_before_avg_tt: number;
    city_after_avg_tt: number;
    total_pop_improved: number;
    total_origins_improved: number;
  };
  districts?: Array<{
    district_name: string;
    before_avg_score: number;
    after_avg_score: number;
    score_delta: number;
    before_avg_tt: number;
    after_avg_tt: number;
    pop_improved: number;
    origins_improved: number;
  }>;
  origins?: OriginDto[];
  facilities?: BaselineFacilityDto[]; // legacy alias
  added_facilities?: Array<{ latitude: number; longitude: number; source?: string }>;
  added_transport_stops?: Array<{ latitude: number; longitude: number; source?: string }>;
  auto_placed_facilities?: Array<{ latitude: number; longitude: number; source?: string }>;
  impacted_origin_ids?: Array<string>;
  district_summaries_before?: BaselineResponse["district_summaries"];
  district_summaries_after?: BaselineResponse["district_summaries"];
  scenario?: SimulationRequest;
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
  districtName: string; // display label, usually district aggregate name
  originName?: string;
  districtId?: string | number | null;
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

export type FrontendOrigin = FrontendDistrict;

