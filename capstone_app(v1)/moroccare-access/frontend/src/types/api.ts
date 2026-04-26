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
  origin_name?: string;
  district?: string;
  district_name?: string;
  district_id?: string | number | null;
  urban_ring?: string;
  analysis_unit?: string;
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
  feature_changed?: boolean;
};

export type OriginDto = BaselineFacilityDto;

export type RecommendedPlacementDto = {
  city_id?: string;
  intervention_type?: "healthcare_facility" | "transport_stop" | string;
  latitude?: number;
  longitude?: number;
  origin_id?: string | number;
  origin_name?: string;
  district_name?: string;
  baseline_accessibility?: number;
  local_population?: number;
  score?: number;
  avg_accessibility_delta?: number;
  avg_travel_time_delta?: number;
  improved_origin_count?: number;
  improved_population?: number;
  max_origin_delta?: number;
  method?: string;
};

export type RecommendedPlacementsResponse = {
  city_id?: string;
  analysis_unit?: string;
  placements?: RecommendedPlacementDto[];
  facility_recommendations?: RecommendedPlacementDto[];
  transport_stop_recommendations?: RecommendedPlacementDto[];
  methodology_notes?: string[];
};

export type FacilityPointDto = {
  id?: string | number;
  name?: string;
  latitude?: number;
  longitude?: number;
  source?: string;
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
  kpis?: {
    population?: number;
    facility_count?: number;
    transport_stop_count?: number;
    average_access_time_min?: number;
    avg_total_travel_time_min_pw?: number;
    average_accessibility_score?: number;
    pop_weighted_accessibility_score?: number;
    pct_population_within_30_min?: number;
    pct_population_within_60_min?: number;
    pct_pop_access_60min?: number;
    coverage_gap_pct?: number;
    pct_pop_score_below_50?: number;
    facilities_near_transit?: number;
    avg_accessibility_score?: number;
    avg_total_travel_time_min?: number;
    population_covered_45min_pct?: number;
    underserved_population?: number;
  };
  population?: number;
  facility_count?: number;
  methodology?: {
    analysis_unit?: string;
    demand_surface?: string;
    supply_surface?: string;
    access_infrastructure?: string;
    district_role?: string;
    simulation_mode?: string;
    notes?: string[];
  };
  methodology_notes?: string[];
  baseline_rows?: OriginDto[];
  origins?: OriginDto[];
  facilities_baseline?: FacilityPointDto[];
  facilities?: FacilityPointDto[] | BaselineFacilityDto[]; // legacy backends may still send origin rows here
  transport_stops_baseline?: TransportStopDto[];
  transport_stops?: TransportStopDto[];
  district_summaries?: Array<{
    district_name?: string;
    district_id?: string | number | null;
    population_raster?: number;
    origin_count?: number;
    population?: number;
    avg_accessibility_score?: number;
    pop_weighted_accessibility_score?: number;
    avg_total_travel_time_min_pw?: number;
    pct_pop_access_threshold?: number;
    pct_pop_score_below_50?: number;
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
    population?: number;
    population_raster?: number;
    facility_count?: number;
    healthcare_facilities?: number;
    transport_stop_count?: number;
    stop_count?: number;
    average_access_time_min?: number;
    avg_total_travel_time_min_pw?: number;
    average_accessibility_score?: number;
    pop_weighted_accessibility_score?: number;
    pct_population_within_60_min?: number;
    pct_pop_access_60min?: number;
    pct_pop_access_threshold?: number;
    coverage_gap_pct?: number;
    pct_pop_score_below_50?: number;
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
  ranking?: RankingRowDto[];
  rows?: RankingRowDto[];
  data?: RankingRowDto[];
  districts?: RankingRowDto[];
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
  scenario_type?: "add_facility" | "add_stop" | string;
  location?: { latitude: number; longitude: number };
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
  scenario_type?: string;
  warnings?: string[];
  methodology?: BaselineResponse["methodology"];
  methodology_notes?: string[];
  summary?: {
    total_population?: number;
    population_improved?: number;
    newly_covered_population_60min?: number;
    average_travel_time_reduction_min?: number;
    average_accessibility_score_gain?: number;
    avg_score_before?: number;
    avg_score_after?: number;
    avg_travel_time_before?: number;
    avg_travel_time_after?: number;
    city_before_avg_score: number;
    city_after_avg_score: number;
    city_before_avg_tt: number;
    city_after_avg_tt: number;
    total_pop_improved: number;
    total_origins_improved: number;
  };
  delta_summary?: {
    avg_accessibility_delta?: number;
    avg_travel_time_delta?: number;
    improved_population?: number;
    improved_origin_count?: number;
    feature_changed_origin_count?: number;
  };
  feature_delta_summary?: Record<string, number>;
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
  commune_impacts?: Array<{
    commune_id?: string;
    district_id?: string;
    commune_name?: string;
    district_name?: string;
    baseline_score?: number;
    scenario_score?: number;
    score_gain?: number;
    baseline_time?: number;
    scenario_time?: number;
    time_reduction?: number;
    population?: number;
  }>;
  district_impacts?: Array<{
    commune_id?: string;
    district_id?: string;
    commune_name?: string;
    district_name?: string;
    baseline_score?: number;
    scenario_score?: number;
    score_gain?: number;
    baseline_time?: number;
    scenario_time?: number;
    time_reduction?: number;
    population?: number;
  }>;
  origin_metrics_sample?: OriginDto[];
  baseline_rows?: OriginDto[];
  simulated_rows?: OriginDto[];
  origins?: OriginDto[];
  facilities?: BaselineFacilityDto[]; // legacy alias
  added_facilities?: Array<{ latitude: number; longitude: number; source?: string }>;
  facilities_added?: Array<{ latitude: number; longitude: number; source?: string }>;
  added_transport_stops?: Array<{ latitude: number; longitude: number; source?: string }>;
  transport_stops_added?: Array<{ latitude: number; longitude: number; source?: string }>;
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
  detected_files?: Array<{
    filename?: string;
    detected_type?: string;
    required_columns_found?: string[];
    required_columns?: string[];
    missing_columns?: string[];
    warnings?: string[];
  }>;
  dataset_readiness?: {
    baseline_ready?: boolean;
    simulation_ready?: boolean;
    missing_files?: string[];
    missing_required_files?: string[];
    missing_baseline_files?: string[];
    missing_simulation_files?: string[];
    warnings?: string[];
  };
  file_requirements?: Record<
    string,
    {
      required_columns?: string[];
      normalized_filename?: string;
      required_for_baseline?: boolean;
      required_for_simulation?: boolean;
    }
  >;
};

export type FrontendDistrict = {
  id: string;
  districtName: string; // display label, usually district aggregate name
  originName?: string;
  analysisUnit?: string;
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

