from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: str
    message: str


class DistrictData(BaseModel):
    district_name: str
    population: int
    accessibility_score: float
    stop_density: float


class HospitalData(BaseModel):
    facility_name: str
    predicted_accessibility: float
    delta_transport: float
    delta_network: float
    population_served: int


class SimulationRequest(BaseModel):
    increase_stop_density: float = Field(
        default=0.0,
        description="Percent increase represented as decimal (e.g., 0.2 for 20%).",
        ge=0.0,
    )
    increase_facilities: int = Field(default=0, ge=0)


class SimulationResponse(BaseModel):
    assumptions: dict[str, float | int]
    hospitals: list[HospitalData]

