import { useEffect, useMemo, useState } from "react";
import { api } from "./api/client.js";
import Layout from "./components/Layout.jsx";
import OverviewPage from "./pages/OverviewPage.jsx";
import MapPage from "./pages/MapPage.jsx";
import UploadPage from "./pages/UploadPage.jsx";
import AnalyticsPage from "./pages/AnalyticsPage.jsx";
import SimulationPage from "./pages/SimulationPage.jsx";


export default function App() {
  const [cities, setCities] = useState([]);
  const [selectedCityId, setSelectedCityId] = useState("");
  const [activePage, setActivePage] = useState("overview");
  const [loadingCities, setLoadingCities] = useState(true);
  const [error, setError] = useState(null);

  async function loadCities(preferredCityId = null) {
    setLoadingCities(true);
    setError(null);

    try {
      const data = await api.getCities();
      setCities(data);

      const cityToSelect =
        preferredCityId ||
        data.find((city) => city.baseline_ready)?.city_id ||
        data[0]?.city_id ||
        "";

      setSelectedCityId((current) => current || cityToSelect);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingCities(false);
    }
  }

  useEffect(() => {
    loadCities();
  }, []);

  function handleUploaded(cityId) {
    loadCities(cityId);
    setSelectedCityId(cityId);
    setActivePage("overview");
  }

  const selectedCity = useMemo(
    () => cities.find((city) => city.city_id === selectedCityId),
    [cities, selectedCityId]
  );

  let content;

  if (loadingCities) {
    content = <MessageCard title="Loading cities..." message="Checking backend city packages." />;
  } else if (error) {
    content = <MessageCard title="Could not load cities" message={error} />;
  } else if (activePage === "overview") {
    content = <OverviewPage cityId={selectedCityId} />;
  } else if (activePage === "map") {
    content = <MapPage cityId={selectedCityId} />;
  } else if (activePage === "upload") {
    content = <UploadPage onUploaded={handleUploaded} />;
  } else if (activePage === "analytics") {
    content = <AnalyticsPage cityId={selectedCityId} />;
  } else if (activePage === "simulation") {
    content = <SimulationPage cityId={selectedCityId} />;
    }

  return (
    <Layout
      cities={cities}
      selectedCityId={selectedCityId}
      onCityChange={setSelectedCityId}
      activePage={activePage}
      onPageChange={setActivePage}
    >
      {/* {selectedCity && activePage !== "upload" && activePage !== "overview" && (
        <div className="status-banner">
            <div>
            <strong>{selectedCity.city_name}</strong>
            <div style={{ color: "#64748b", fontSize: "13px", marginTop: "3px" }}>
                Active city package: {selectedCity.city_id}
            </div>
            </div>

            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <span className={`badge ${selectedCity.baseline_ready ? "ready" : "partial"}`}>
                Baseline {selectedCity.baseline_ready ? "Ready" : "Incomplete"}
            </span>
            <span className={`badge ${selectedCity.simulation_ready ? "ready" : "partial"}`}>
                Simulation {selectedCity.simulation_ready ? "Ready" : "Incomplete"}
            </span>
            </div>
        </div>
        )} */}

      {content}
    </Layout>
  );
}

function MessageCard({ title, message }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
      <h2 className="text-xl font-semibold">{title}</h2>
      <p className="mt-2 text-slate-500">{message}</p>
    </div>
  );
}