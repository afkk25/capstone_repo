export type District = {
  district_name: string;
  population: number;
  accessibility_score: number;
  stop_density: number;
};

export type Hospital = {
  facility_name: string;
  predicted_accessibility: number;
  delta_transport: number;
  delta_network: number;
  population_served: number;
};

export type SimulationRequest = {
  increase_stop_density: number;
  increase_facilities: number;
};

export type SimulationResponse = {
  assumptions: {
    increase_stop_density: number;
    increase_facilities: number;
  };
  hospitals: Hospital[];
};

