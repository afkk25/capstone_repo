import { useI18n } from "../i18n/I18nProvider";
import { toLocaleNumber } from "../utils/rtl";

function toneFromScore(score) {
  if (score > 0.65) {
    return {
      labelKey: "facility.highAccess",
      badge: "bg-[#E1F5EE] text-[#3B6D11]",
      bar: "bg-[#3B6D11]"
    };
  }
  if (score >= 0.35) {
    return {
      labelKey: "facility.medium",
      badge: "bg-[#FFF4E5] text-[#BA7517]",
      bar: "bg-[#BA7517]"
    };
  }
  return {
    labelKey: "facility.lowAccess",
    badge: "bg-[#FDECE6] text-[#993C1D]",
    bar: "bg-[#D85A30]"
  };
}

export default function FacilityCard({ facility }) {
  const { t, language, isRtl } = useI18n();
  const score = Number(facility.accessibilityScore || 0);
  const tone = toneFromScore(score);
  const pct = Math.max(0, Math.min(100, score * 100));
  const nearest = Number(facility.nearestStopDistanceMeters);
  const title = facility.originName || facility.name || facility.districtName || t("facility.analysisLocation");
  const district = facility.districtName && facility.districtName !== title ? facility.districtName : "";

  return (
    <article className={`rounded-xl border border-gray-200 bg-white p-4 shadow-sm rtl-safe-text ${isRtl ? "text-right" : "text-left"}`}>
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <h3 className="text-[14px] font-medium text-gray-900">{title}</h3>
          {district ? <p className="mt-0.5 text-[11px] text-gray-500">{district}</p> : null}
        </div>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${tone.badge}`}>{t(tone.labelKey)}</span>
      </div>
      <div className="h-[5px] rounded-full bg-gray-200">
        <div className={`h-[5px] rounded-full ${tone.bar}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 text-[13px] text-gray-600">
        <span>
          {t("facility.score")} <span className="num-ltr">{toLocaleNumber(score, language, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </span>
        <span>
          {t("facility.nearestStop")}{" "}
          <span className="num-ltr">{Number.isFinite(nearest) ? `${toLocaleNumber(Math.round(nearest), language, { maximumFractionDigits: 0 })}m` : t("analytics.na")}</span>
        </span>
      </div>
    </article>
  );
}
