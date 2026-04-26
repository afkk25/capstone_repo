const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

async function request(path, options = {}) {
  const url = `${API_BASE_URL}${path}`;

  const response = await fetch(url, options);

  if (!response.ok) {
    let detail = `Request failed: ${response.status}`;

    try {
      const body = await response.json();
      detail = body.detail || JSON.stringify(body);
    } catch {
      detail = await response.text();
    }

    throw new Error(detail);
  }

  return response.json();
}

export const api = {
  getHealth() {
    return request("/health");
  },

  getCities() {
    return request("/api/cities");
  },

  getBaseline(cityId) {
    return request(`/api/cities/${cityId}/baseline`);
  },

  getFacilities(cityId) {
    return request(`/api/cities/${cityId}/facilities`);
  },

  getStops(cityId) {
    return request(`/api/cities/${cityId}/stops`);
  },

  getDistricts(cityId) {
    return request(`/api/cities/${cityId}/districts`);
  },

  getRanking(cityId) {
    return request(`/api/cities/${cityId}/ranking`);
  },

  getAccessibilitySurface(cityId, gridSizeM = 350) {
    return request(
      `/api/cities/${cityId}/accessibility-surface?grid_size_m=${gridSizeM}`
    );
  },

  uploadCity(formData) {
    return request("/api/cities/upload", {
      method: "POST",
      body: formData,
    });
  },

  simulate(cityId, payload) {
    return request(`/api/cities/${cityId}/simulate`, {
        method: "POST",
        headers: {
        "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
    });
 },

  getSimulationRecommendations(cityId, scenarioType = "add_facility", limit = 5) {
    return request(`/api/cities/${cityId}/simulation-recommendations?scenario_type=${encodeURIComponent(
        scenarioType
      )}&limit=${limit}`
    );
  },

};

export { API_BASE_URL };