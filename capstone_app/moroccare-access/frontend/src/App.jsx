import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import OverviewPage from "./pages/OverviewPage";
import MapPage from "./pages/MapPage";
import SimulationPage from "./pages/SimulationPage";
import AnalyticsPage from "./pages/AnalyticsPage";
import MethodologyPage from "./pages/MethodologyPage";
import DataPage from "./pages/DataPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/overview" replace />} />
        <Route path="/overview" element={<OverviewPage />} />
        <Route path="/map" element={<MapPage />} />
        <Route path="/simulation" element={<SimulationPage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route path="/methodology" element={<MethodologyPage />} />
        <Route path="/data" element={<DataPage />} />
      </Routes>
    </BrowserRouter>
  );
}

