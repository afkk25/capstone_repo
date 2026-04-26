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
        title={t("loadingBaseline") || "Loading baseline..."}
        message={
          t("loadingBaselineMessage") || "Fetching accessibility indicators."
        }
      />
    );
  }

  if (error) {
    return (
      <EmptyState
        title={t("baselineLoadError") || "Could not load baseline"}
        message={error}
      />
    );
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
            {t("cityWideAccessibilityIndicators")} · {t("activeCityPackage")}:{" "}
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

        <SectionLabel label={t("coverageInputs")} />

        <section className="overview-card-grid inputs">
          <OverviewMetricCard
            label={t("populationCovered")}
            value={formatCompactNumber(kpis.population)}
            helper={t("populationCoveredSub")}
          />

          <OverviewMetricCard
            label={t("healthcareFacilities")}
            value={formatNumber(kpis.facility_count)}
            helper={t("healthcareFacilitiesSub")}
          />

          <OverviewMetricCard
            label={t("transportStops")}
            value={formatNumber(kpis.transport_stop_count)}
            helper={t("transportStopsSub")}
          />
        </section>

        <SectionLabel label={t("accessibilityOutcomes")} />

        <section className="overview-card-grid outcomes">
          <OverviewMetricCard
            label={t("averageAccessTime")}
            value={formatMinutes(kpis.average_access_time_min)}
            helper={t("averageAccessTimeSub")}
            accent="green"
            badge={t("baselineLabel")}
          />

          <OverviewMetricCard
            label={t("averageAccessibilityScore")}
            value={formatScore(kpis.average_accessibility_score)}
            helper={t("averageAccessibilityScoreSub")}
            accent="green"
            progress={accessScore}
          />

          <OverviewMetricCard
            label={t("populationWithin60")}
            value={formatPercent(kpis.pct_population_within_60_min)}
            helper={t("populationWithin60Sub")}
            accent="green"
            progress={within60}
          />

          <OverviewMetricCard
            label={t("coverageGap")}
            value={formatPercent(kpis.coverage_gap_pct)}
            helper={t("coverageGapSub")}
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
    <article
      className={`overview-metric-card ${
        accent !== "neutral" ? `accent-${accent}` : ""
      }`}
    >
      <p className="overview-metric-label">{label}</p>
      <div className="overview-metric-value">{value}</div>
      <p className="overview-metric-helper">{helper}</p>

      {badge && <span className="overview-mini-badge">↘ {badge}</span>}

      {progress !== null && (
        <div className="overview-progress-track">
          <div
            className={`overview-progress-fill ${
              accent === "amber" ? "amber" : "green"
            }`}
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