import { useMemo, useState } from "react";
import FacilityCard from "../components/FacilityCard";
import { useI18n } from "../i18n/I18nProvider";
import { toLocaleNumber } from "../utils/rtl";

export default function Overview({ cityName, facilities, transportStops, isLoading }) {
  const { t, language, isRtl } = useI18n();
  const [bestFirst, setBestFirst] = useState(false);

  const sorted = useMemo(() => {
    const rows = [...facilities];
    rows.sort((a, b) => (bestFirst ? b.accessibilityScore - a.accessibilityScore : a.accessibilityScore - b.accessibilityScore));
    return rows;
  }, [facilities, bestFirst]);

  const lowAccess = facilities.filter((item) => Number(item.nearestStopDistanceMeters) > 250);
  const avgDistance =
    facilities.length > 0
      ? facilities.reduce((sum, item) => sum + (Number.isFinite(Number(item.nearestStopDistanceMeters)) ? Number(item.nearestStopDistanceMeters) : 0), 0) / facilities.length
      : 0;
  const mostIsolated = [...facilities]
    .filter((item) => Number.isFinite(Number(item.nearestStopDistanceMeters)))
    .sort((a, b) => Number(b.nearestStopDistanceMeters) - Number(a.nearestStopDistanceMeters))[0];

  return (
    <section className={`space-y-3 rtl-safe-text ${isRtl ? "text-right" : "text-left"}`}>
      <article className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="font-heading text-[18px] font-bold text-gray-900">{t("overview.title")}</h2>
        <p className="mt-2 text-[14px] text-gray-800">
          {t("overview.findingTemplate", { count: lowAccess.length, city: cityName || t("overview.selectedCity") })}{" "}
          {mostIsolated
            ? t("overview.isolatedTemplate", {
                district: mostIsolated.districtName,
                distance: `${toLocaleNumber(Math.round(Number(mostIsolated.nearestStopDistanceMeters)), language, { maximumFractionDigits: 0 })}m`
              })
            : ""}
        </p>
      </article>

      <div className="grid grid-cols-1 gap-[10px] md:grid-cols-4">
        <article className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="text-[12px] font-heading font-semibold uppercase tracking-wide text-gray-500">Total origin points</div>
          <div className="num-ltr mt-1 font-heading text-[24px] font-bold">{facilities.length.toLocaleString(language === "ar" ? "ar-MA" : language)}</div>
        </article>
        <article className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="text-[12px] font-heading font-semibold uppercase tracking-wide text-gray-500">{t("overview.totalStops")}</div>
          <div className="num-ltr mt-1 font-heading text-[24px] font-bold">{transportStops.length.toLocaleString(language === "ar" ? "ar-MA" : language)}</div>
        </article>
        <article className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="text-[12px] font-heading font-semibold uppercase tracking-wide text-gray-500">{t("overview.avgDistance")}</div>
          <div className="num-ltr mt-1 font-heading text-[24px] font-bold">{toLocaleNumber(Math.round(avgDistance), language, { maximumFractionDigits: 0 })}m</div>
        </article>
        <article className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="text-[12px] font-heading font-semibold uppercase tracking-wide text-gray-500">Low-access origin points</div>
          <div className="num-ltr mt-1 font-heading text-[24px] font-bold">{lowAccess.length.toLocaleString(language === "ar" ? "ar-MA" : language)}</div>
        </article>
      </div>

      <article className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-heading text-[12px] font-semibold uppercase tracking-wide text-gray-500">{t("overview.ranking")}</h3>
          <button
            type="button"
            onClick={() => setBestFirst((prev) => !prev)}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-semibold text-gray-700"
          >
            {bestFirst ? t("overview.switchWorst") : t("overview.switchBest")}
          </button>
        </div>
        {isLoading ? (
          <div className="text-[13px] text-gray-600">{t("overview.loadingBaseline")}</div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {sorted.map((facility) => (
              <FacilityCard key={facility.id} facility={facility} />
            ))}
          </div>
        )}
      </article>
    </section>
  );
}
