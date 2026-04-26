import SectionCard from "./layout/SectionCard";
import { useI18n } from "../i18n/I18nProvider";
import { toLocaleNumber, toLocalePercent } from "../utils/rtl";

function StatCard({ label, value, hint }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm rtl-safe-text">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-slate-900">{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

export default function SummaryCards({ summary, isLoading = false }) {
  const { t, language } = useI18n();
  if (isLoading) {
    return (
      <SectionCard title={t("summary.title")} subtitle={t("summary.subtitle")}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, idx) => (
            <div key={idx} className="h-24 animate-pulse rounded-xl bg-slate-100" />
          ))}
        </div>
      </SectionCard>
    );
  }

  return (
    <SectionCard title={t("summary.title")} subtitle={t("summary.subtitle")}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label={t("summary.avgAccessibility")} value={<span className="num-ltr">{toLocaleNumber(summary.averageAccessibility, language, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}</span>} />
        <StatCard label={t("summary.avgTravel")} value={<span className="num-ltr">{`${toLocaleNumber(summary.averageTravelTime, language, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} min`}</span>} />
        <StatCard
          label={t("summary.underservedDistricts")}
          value={<span className="num-ltr">{toLocaleNumber(summary.underservedCount, language, { maximumFractionDigits: 0 })}</span>}
          hint={t("summary.ofAll", { pct: toLocalePercent(summary.underservedPct, language, 1) })}
        />
        <StatCard
          label={t("summary.bestDistrict")}
          value={summary.bestDistrict?.districtName || t("analytics.na")}
          hint={
            summary.bestDistrict
              ? t("summary.scoreHint", {
                  score: toLocaleNumber(summary.bestDistrict.accessibilityScore, language, { minimumFractionDigits: 3, maximumFractionDigits: 3 })
                })
              : undefined
          }
        />
        <StatCard
          label={t("summary.worstDistrict")}
          value={summary.worstDistrict?.districtName || t("analytics.na")}
          hint={
            summary.worstDistrict
              ? t("summary.scoreHint", {
                  score: toLocaleNumber(summary.worstDistrict.accessibilityScore, language, { minimumFractionDigits: 3, maximumFractionDigits: 3 })
                })
              : undefined
          }
        />
      </div>
    </SectionCard>
  );
}

