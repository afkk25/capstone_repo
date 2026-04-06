import { useEffect, useMemo, useState } from "react";
import { fetchDistricts, fetchHospitals } from "./api";
import BarChart from "./components/BarChart";
import DistrictsTable from "./components/DistrictsTable";
import HospitalsTable from "./components/HospitalsTable";
import SimulationPanel from "./components/SimulationPanel";
import SummaryCard from "./components/SummaryCard";
import { District, Hospital } from "./types";

function App() {
  const [districts, setDistricts] = useState<District[]>([]);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [simulatedHospitals, setSimulatedHospitals] = useState<Hospital[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setError(null);
      try {
        const [districtData, hospitalData] = await Promise.all([
          fetchDistricts(),
          fetchHospitals()
        ]);
        setDistricts(districtData);
        setHospitals(hospitalData);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load data.");
      } finally {
        setLoading(false);
      }
    }
    void loadData();
  }, []);

  const averageAccessibility = useMemo(() => {
    if (!districts.length) return 0;
    return (
      districts.reduce((sum, district) => sum + district.accessibility_score, 0) /
      districts.length
    );
  }, [districts]);

  const underservedShare = useMemo(() => {
    if (!districts.length) return 0;
    const underserved = districts.filter((district) => district.accessibility_score < 55).length;
    return (underserved / districts.length) * 100;
  }, [districts]);

  const chartData = useMemo(
    () =>
      districts.map((district) => ({
        label: district.district_name,
        value: district.accessibility_score
      })),
    [districts]
  );

  return (
    <main className="mx-auto max-w-7xl p-4 md:p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 md:text-3xl">
          Healthcare Accessibility Dashboard
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Capstone web app prototype for Casablanca healthcare accessibility.
        </p>
      </header>

      {loading && <p className="mb-4 rounded bg-white p-3 text-slate-700 shadow-sm">Loading data...</p>}
      {error && <p className="mb-4 rounded bg-red-50 p-3 text-red-700">{error}</p>}

      <section className="mb-6 grid gap-4 md:grid-cols-2">
        <SummaryCard
          title="Average Accessibility"
          value={averageAccessibility.toFixed(1)}
          subtitle="District-level average score"
        />
        <SummaryCard
          title="% Underserved Districts"
          value={`${underservedShare.toFixed(1)}%`}
          subtitle="Threshold: accessibility score < 55"
        />
      </section>

      <section className="mb-6 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <DistrictsTable districts={districts} />
        </div>
        <SimulationPanel onResult={setSimulatedHospitals} />
      </section>

      <section className="mb-6">
        <HospitalsTable hospitals={simulatedHospitals ?? hospitals} title="Hospitals View" />
      </section>

      <section className="mb-6">
        <BarChart title="Accessibility by District" data={chartData} />
      </section>
    </main>
  );
}

export default App;

