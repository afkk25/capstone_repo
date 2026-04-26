// import { useEffect, useState } from "react";
// import { api } from "../api/client.js";
// import KpiCard from "../components/KpiCard.jsx";
// import {
//   formatCompactNumber,
//   formatMinutes,
//   formatNumber,
//   formatPercent,
//   formatScore,
// } from "../utils/formatters.js";
// import { useI18n } from "../i18n/I18nContext.jsx";

// export default function OverviewPage({ cityId }) {
//   const { t } = useI18n();

//   const [baseline, setBaseline] = useState(null);
//   const [loading, setLoading] = useState(Boolean(cityId));
//   const [error, setError] = useState(null);

//   useEffect(() => {
//     if (!cityId) return;

//     let cancelled = false;

//     async function load() {
//       setLoading(true);
//       setError(null);

//       try {
//         const data = await api.getBaseline(cityId);

//         if (!cancelled) {
//           console.log("Baseline response", data);
//           setBaseline(data);
//         }
//       } catch (err) {
//         if (!cancelled) setError(err.message);
//       } finally {
//         if (!cancelled) setLoading(false);
//       }
//     }

//     load();

//     return () => {
//       cancelled = true;
//     };
//   }, [cityId]);

//   if (!cityId) {
//     return (
//       <EmptyState
//         title="No city selected"
//         message="Upload or select a city first."
//       />
//     );
//   }

//   if (loading) {
//     return (
//       <EmptyState
//         title="Loading baseline..."
//         message="Fetching accessibility indicators."
//       />
//     );
//   }

//   if (error) {
//     return <EmptyState title="Could not load baseline" message={error} />;
//   }

//   const kpis = baseline?.kpis || {};
//   const cityName = baseline?.city_name || cityId;

//   return (
//     <div className="section-space">
//       <section>
//         <h2 className="page-title">
//           {t("overviewTitle", { city: cityName })}
//         </h2>
//         <p className="page-subtitle">{t("overviewSubtitle")}</p>
//       </section>

//       {baseline?.warnings?.length > 0 && (
//         <div className="warning-box">
//           {baseline.warnings.map((warning, index) => (
//             <p key={index} style={{ margin: index === 0 ? 0 : "8px 0 0" }}>
//               {warning}
//             </p>
//           ))}
//         </div>
//       )}

//       <section className="kpi-grid">
//         <KpiCard
//           title={t("populationCovered")}
//           value={formatCompactNumber(kpis.population)}
//           subtitle={t("populationCoveredSub")}
//         />

//         <KpiCard
//           title={t("healthcareFacilities")}
//           value={formatNumber(kpis.facility_count)}
//           subtitle={t("healthcareFacilitiesSub")}
//         />

//         <KpiCard
//           title={t("transportStops")}
//           value={formatNumber(kpis.transport_stop_count)}
//           subtitle={t("transportStopsSub")}
//         />

//         <KpiCard
//           title={t("averageAccessTime")}
//           value={formatMinutes(kpis.average_access_time_min)}
//           subtitle={t("averageAccessTimeSub")}
//         />

//         <KpiCard
//           title={t("averageAccessibilityScore")}
//           value={formatScore(kpis.average_accessibility_score)}
//           subtitle={t("averageAccessibilityScoreSub")}
//         />

//         <KpiCard
//           title={t("populationWithin60")}
//           value={formatPercent(kpis.pct_population_within_60_min)}
//           subtitle={t("populationWithin60Sub")}
//         />

//         <KpiCard
//           title={t("coverageGap")}
//           value={formatPercent(kpis.coverage_gap_pct)}
//           subtitle={t("coverageGapSub")}
//         />
//       </section>

//       <section className="card card-pad">
//         <div
//           style={{
//             display: "flex",
//             justifyContent: "space-between",
//             gap: "16px",
//             alignItems: "flex-start",
//             flexWrap: "wrap",
//           }}
//         >
//           <div>
//             <h3 style={{ margin: 0, fontSize: "18px" }}>{t("readiness")}</h3>
//             <p
//               style={{
//                 margin: "6px 0 0",
//                 color: "#64748b",
//                 fontSize: "14px",
//               }}
//             >
//               {t("readinessDescription")}
//             </p>
//           </div>

//           <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
//             <ReadinessBadge
//               label={t("baseline")}
//               ready={baseline?.readiness?.baseline_ready}
//               missing={baseline?.readiness?.missing_baseline_files}
//               t={t}
//             />

//             <ReadinessBadge
//               label={t("simulation")}
//               ready={baseline?.readiness?.simulation_ready}
//               missing={baseline?.readiness?.missing_simulation_files}
//               t={t}
//             />
//           </div>
//         </div>
//       </section>
//     </div>
//   );
// }

// function ReadinessBadge({ label, ready, missing = [], t }) {
//   return (
//     <div>
//       <span className={`badge ${ready ? "ready" : "partial"}`}>
//         {label} {ready ? t("ready") : t("incomplete")}
//       </span>

//       {!ready && missing?.length > 0 && (
//         <p style={{ margin: "8px 0 0", color: "#64748b", fontSize: "13px" }}>
//           Missing: {missing.join(", ")}
//         </p>
//       )}
//     </div>
//   );
// }

// function EmptyState({ title, message }) {
//   return (
//     <div className="card card-pad empty-state">
//       <h2 style={{ marginTop: 0 }}>{title}</h2>
//       <p style={{ color: "#64748b", marginBottom: 0 }}>{message}</p>
//     </div>
//   );
// }

import { useEffect, useState } from "react";
import { api } from "../api/client.js";
import {
  formatCompactNumber,
  formatMinutes,
  formatNumber,
  formatPercent,
  formatScore,
} from "../utils/formatters.js";
import { useI18n } from "../i18n/I18nContext.jsx";

export default function OverviewPage({ cityId }) {
  const { t } = useI18n();

  const [baseline, setBaseline] = useState(null);
  const [loading, setLoading] = useState(Boolean(cityId));
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!cityId) return;

    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const data = await api.getBaseline(cityId);
        if (!cancelled) {
          console.log("Baseline response", data);
          setBaseline(data);
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [cityId]);

  if (!cityId) {
    return (
      <EmptyState
        title={t("noCitySelected") || "No city selected"}
        message={t("selectCityFirst") || "Upload or select a city first."}
      />
    );
  }

  if (loading) {
    return (
      <EmptyState
        title="Loading baseline..."
        message="Fetching accessibility indicators."
      />
    );
  }

  if (error) {
    return <EmptyState title="Could not load baseline" message={error} />;
  }

  const kpis = baseline?.kpis || {};
  const cityName = baseline?.city_name || cityId;

  const accessScore = normalizePercent(kpis.average_accessibility_score);
  const within60 = normalizePercent(kpis.pct_population_within_60_min);
  const coverageGap = normalizePercent(kpis.coverage_gap_pct);

  return (
    <div className="section-space">
        <section className="overview-summary-header">
        <div>
            <h2 className="overview-panel-title">
            {t("overviewTitle", { city: cityName })}
            </h2>
            <p className="overview-panel-subtitle">
            City-wide accessibility indicators · Active package:{" "}
            <strong>{cityId}</strong>
            </p>
        </div>

        <div className="overview-pills">
            <span
            className={`overview-pill ${
                baseline?.readiness?.baseline_ready ? "ready" : "partial"
            }`}
            >
            {baseline?.readiness?.baseline_ready
                ? t("baselineReady")
                : t("baselineIncomplete")}
            </span>

            <span
            className={`overview-pill ${
                baseline?.readiness?.simulation_ready ? "ready" : "partial"
            }`}
            >
            {baseline?.readiness?.simulation_ready
                ? t("simulationReady")
                : t("simulationIncomplete")}
            </span>
        </div>
        </section>

        <div className="overview-panel">
        {baseline?.warnings?.length > 0 && (
            <div className="warning-box">
            {baseline.warnings.map((warning, index) => (
                <p key={index} style={{ margin: index === 0 ? 0 : "8px 0 0" }}>
                {warning}
                </p>
            ))}
            </div>
        )}

        <SectionLabel label="Coverage inputs" />

        <section className="overview-card-grid inputs">
            <OverviewMetricCard
            label={t("populationCovered")}
            value={formatCompactNumber(kpis.population)}
            helper="Included in city package"
            />

            <OverviewMetricCard
            label={t("healthcareFacilities")}
            value={formatNumber(kpis.facility_count)}
            helper="Destinations available"
            />

            <OverviewMetricCard
            label={t("transportStops")}
            value={formatNumber(kpis.transport_stop_count)}
            helper="Public access points"
            />
        </section>

        <SectionLabel label="Accessibility outcomes" />

        <section className="overview-card-grid outcomes">
            <OverviewMetricCard
            label={t("averageAccessTime")}
            value={formatMinutes(kpis.average_access_time_min)}
            helper="Population-weighted travel time"
            accent="green"
            badge="baseline"
            />

            <OverviewMetricCard
            label={t("averageAccessibilityScore")}
            value={formatScore(kpis.average_accessibility_score)}
            helper="Score on a 0–100 scale"
            accent="green"
            progress={accessScore}
            />

            <OverviewMetricCard
            label={t("populationWithin60")}
            value={formatPercent(kpis.pct_population_within_60_min)}
            helper="Population-weighted coverage"
            accent="green"
            progress={within60}
            />

            <OverviewMetricCard
            label={t("coverageGap")}
            value={formatPercent(kpis.coverage_gap_pct)}
            helper="Population with accessibility score below 50"
            accent="amber"
            progress={coverageGap}
            />
        </section>
        </div>
    </div>
    );
}

function SectionLabel({ label }) {
  return <div className="overview-section-label">{label}</div>;
}

function OverviewMetricCard({
  label,
  value,
  helper,
  accent = "neutral",
  progress = null,
  badge = null,
}) {
  return (
    <article className={`overview-metric-card ${accent !== "neutral" ? `accent-${accent}` : ""}`}>
      <p className="overview-metric-label">{label}</p>
      <div className="overview-metric-value">{value}</div>
      <p className="overview-metric-helper">{helper}</p>

      {badge && <span className="overview-mini-badge">↘ {badge}</span>}

      {progress !== null && (
        <div className="overview-progress-track">
          <div
            className={`overview-progress-fill ${accent === "amber" ? "amber" : "green"}`}
            style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
          />
        </div>
      )}
    </article>
  );
}

function EmptyState({ title, message }) {
  return (
    <div className="card card-pad empty-state">
      <h2 style={{ marginTop: 0 }}>{title}</h2>
      <p style={{ color: "#64748b", marginBottom: 0 }}>{message}</p>
    </div>
  );
}

function normalizePercent(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return 0;
  }

  const number = Number(value);
  return number <= 1 ? number * 100 : number;
}