import Badge from "./ui/Badge";
import SectionCard from "./layout/SectionCard";
import { useI18n } from "../i18n/I18nProvider";
import { sideClass, toLocaleNumber } from "../utils/rtl";

function interpretationText(row, t) {
  if (!row) return "";
  if (row.underserved >= 1) {
    return t("details.interpUnderserved");
  }
  return t("details.interpServed");
}

function MetricRow({ label, value }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 rtl-safe-text">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-sm font-semibold text-slate-800">{value}</div>
    </div>
  );
}

export default function DistrictDetailsPanel({ district, open, onClose }) {
  const { t, language, isRtl } = useI18n();
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[1200]">
      <button type="button" className="absolute inset-0 bg-slate-900/45 backdrop-blur-[1px]" aria-label={t("common.close")} onClick={onClose} />
      <aside className={`absolute bottom-0 top-0 w-full max-w-lg p-3 sm:p-4 ${sideClass(isRtl, "right-0", "left-0")}`}>
        <SectionCard
          title={t("details.title")}
          subtitle={district ? t("details.subtitleSelected") : t("details.subtitleEmpty")}
          className="flex h-full flex-col overflow-hidden shadow-xl"
          bodyClassName="space-y-4 overflow-y-auto"
          headerRight={
            <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50">
              {t("common.close")}
            </button>
          }
        >
          {!district ? (
            <div className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">{t("details.noDistrict")}</div>
          ) : (
            <>
              <section className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("nav.overview")}</div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="text-xs text-slate-500">{t("details.district")}</div>
                  <div className="text-lg font-semibold text-slate-900">{district.districtName}</div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Badge tone={district.underserved ? "danger" : "success"}>{district.underserved ? t("details.underserved") : t("details.served")}</Badge>
                    <Badge tone="neutral">{district.urbanRing}</Badge>
                  </div>
                </div>
              </section>

              <section className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Metrics</div>
                <div className="grid grid-cols-2 gap-2">
                  <MetricRow label={t("details.accessibility")} value={<span className="num-ltr">{toLocaleNumber(district.accessibilityScore, language, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}</span>} />
                  <MetricRow label={t("details.travel")} value={<span className="num-ltr">{`${toLocaleNumber(district.travelTimeMin, language, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} min`}</span>} />
                  <MetricRow label={t("details.sfca")} value={<span className="num-ltr">{toLocaleNumber(district.score2sfca, language, { minimumFractionDigits: 6, maximumFractionDigits: 6 })}</span>} />
                  <MetricRow label={t("details.population")} value={<span className="num-ltr">{toLocaleNumber(district.population, language, { maximumFractionDigits: 0 })}</span>} />
                  <MetricRow label="Baseline" value={<span className="num-ltr">{toLocaleNumber(district.baselineScore, language, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}</span>} />
                  <MetricRow
                    label="Δ"
                    value={
                      <span className="num-ltr">
                        {district.delta >= 0
                          ? `+${toLocaleNumber(district.delta, language, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`
                          : toLocaleNumber(district.delta, language, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                      </span>
                    }
                  />
                </div>
              </section>

              <section className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Insights</div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">{interpretationText(district, t)}</div>
              </section>
              <div className="h-px bg-slate-100" />
              <div className="text-xs text-slate-500">Tip: use ranking and explainability tabs to compare this district against others.</div>
            </>
          )}
        </SectionCard>
      </aside>
    </div>
  );
}

