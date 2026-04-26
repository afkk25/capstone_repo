import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useI18n } from "../i18n/I18nProvider";
import { sideClass, swapChartMargin, toLocaleNumber, toLocalePercent } from "../utils/rtl";

const ANALYTICS_COPY = {
  en: {
    featureDisplayNames: {
      stop_density: "Transport stops nearby",
      nearest_stop_dist: "Distance to nearest stop",
      stop_count_500m: "Stops within 500m walk",
      healthcare_density_1km: "Other healthcare facilities within 1km",
      healthcare_density_500m: "Other healthcare facilities within 500m",
      interaction_density_stops: "Transit–facility overlap score",
      stop_rank: "Stop network rank",
      distance_rank: "Distance rank among facilities",
      nearest_stop_dist_sq: "Distance penalty (squared)",
      log_stop_count: "Stop count (log scale)"
    },
    featureDescriptions: {
      stop_density: "How many bus or tram stops exist within a short radius of this facility.",
      nearest_stop_dist: "How far (in metres) a patient must walk to reach the closest stop.",
      stop_count_500m: "The number of stops reachable within a typical 6-minute walk.",
      healthcare_density_1km: "Whether other facilities are clustered nearby and if people have alternatives.",
      healthcare_density_500m: "Very close facility clustering that can indicate urban health hubs.",
      interaction_density_stops: "A combined score: facilities with many stops and nearby healthcare facilities rank highest.",
      stop_rank: "Rank against all facilities by stop count — 1 means best connected.",
      distance_rank: "Rank against all facilities by nearest stop distance — 1 means closest stop.",
      nearest_stop_dist_sq: "Penalizes long walking distances more strongly than short distances.",
      log_stop_count: "Stop count on a log scale to avoid extreme values dominating."
    },
    modeLabels: { bus: "Bus (Casabus)", tram: "Tram", busway: "Busway", multi: "Multi-mode" },
    defaultFeatureDescription: "This feature contributes to the model output.",
    insights: {
      stop_density:
        "The strongest lever is adding more transport stops near facilities. A stop within 300m can raise accessibility meaningfully.",
      nearest_stop_dist:
        "Reducing walking distance to the nearest stop has major impact. Facilities with no nearby stop underperform.",
      stop_count_500m: "Stops reachable within a short walk drive accessibility more than relying on one stop.",
      healthcare_density_1km:
        "Facility clustering matters. Isolated healthcare facilities can remain less resilient even when they are relatively connected.",
      default:
        "The top driver remains transport coverage around facilities. Improving transit access yields the strongest gains."
    }
  },
  fr: {
    featureDisplayNames: {
      stop_density: "Arrêts de transport à proximité",
      nearest_stop_dist: "Distance à l’arrêt le plus proche",
      stop_count_500m: "Arrêts à moins de 500 m",
      healthcare_density_1km: "Autres etablissements de sante dans 1 km",
      healthcare_density_500m: "Autres etablissements de sante dans 500 m",
      interaction_density_stops: "Score de recouvrement transport–soins",
      stop_rank: "Rang de connectivité des arrêts",
      distance_rank: "Rang de distance aux arrêts",
      nearest_stop_dist_sq: "Pénalité de distance (carrée)",
      log_stop_count: "Nombre d’arrêts (échelle log)"
    },
    featureDescriptions: {
      stop_density: "Nombre d’arrêts de bus ou de tram dans un rayon proche de l’établissement.",
      nearest_stop_dist: "Distance (en mètres) à parcourir pour atteindre l’arrêt le plus proche.",
      stop_count_500m: "Nombre d’arrêts accessibles en environ 6 minutes de marche.",
      healthcare_density_1km: "Présence d’autres établissements proches, donc alternatives pour les usagers.",
      healthcare_density_500m: "Concentration très proche d’établissements, typique des pôles de santé urbains.",
      interaction_density_stops: "Score combiné : beaucoup d’arrêts + établissements voisins = meilleure accessibilité.",
      stop_rank: "Classement de l’établissement selon le nombre d’arrêts (1 = mieux connecté).",
      distance_rank: "Classement selon la distance à l’arrêt le plus proche (1 = plus proche).",
      nearest_stop_dist_sq: "Pénalise plus fortement les longues distances de marche.",
      log_stop_count: "Nombre d’arrêts en échelle logarithmique pour réduire les extrêmes."
    },
    modeLabels: { bus: "Bus (Casabus)", tram: "Tramway", busway: "Busway", multi: "Multimodal" },
    defaultFeatureDescription: "Cette variable contribue au résultat du modèle.",
    insights: {
      stop_density:
        "Le levier principal est l’ajout d’arrêts de transport près des établissements. Un arrêt à moins de 300 m améliore nettement l’accès.",
      nearest_stop_dist:
        "Réduire la distance de marche vers l’arrêt le plus proche a un impact fort sur l’accessibilité.",
      stop_count_500m: "Le nombre d’arrêts accessibles à pied est déterminant pour offrir des options d’itinéraires.",
      healthcare_density_1km:
        "La concentration des etablissements compte : les etablissements de sante isoles restent plus vulnerables.",
      default:
        "Le facteur dominant reste la couverture de transport autour des établissements de santé."
    }
  },
  ar: {
    featureDisplayNames: {
      stop_density: "عدد محطات النقل القريبة",
      nearest_stop_dist: "المسافة إلى أقرب محطة",
      stop_count_500m: "المحطات ضمن 500 متر",
      healthcare_density_1km: "مرافق صحية أخرى ضمن 1 كم",
      healthcare_density_500m: "مرافق صحية أخرى ضمن 500 متر",
      interaction_density_stops: "مؤشر تداخل النقل مع المرافق الصحية",
      stop_rank: "ترتيب الاتصال بشبكة المحطات",
      distance_rank: "ترتيب المسافة إلى المحطة",
      nearest_stop_dist_sq: "عقوبة المسافة (تربيع)",
      log_stop_count: "عدد المحطات (مقياس لوغاريتمي)"
    },
    featureDescriptions: {
      stop_density: "عدد محطات الحافلات أو الترام القريبة من المؤسسة الصحية.",
      nearest_stop_dist: "المسافة بالأمتار التي يقطعها المريض للوصول إلى أقرب محطة.",
      stop_count_500m: "عدد المحطات التي يمكن الوصول إليها خلال مشي قصير (حوالي 6 دقائق).",
      healthcare_density_1km: "وجود مرافق صحية بديلة ضمن نطاق قريب للحي.",
      healthcare_density_500m: "تركز المرافق الصحية بشكل قريب جداً، وهو شائع في المراكز الحضرية.",
      interaction_density_stops: "مؤشر مركب: كثرة المحطات مع قرب المرافق الصحية تعني وصولاً أفضل.",
      stop_rank: "ترتيب المؤسسة حسب عدد المحطات القريبة (1 = الأفضل اتصالاً).",
      distance_rank: "ترتيب المؤسسة حسب قربها من أقرب محطة (1 = الأقرب).",
      nearest_stop_dist_sq: "يزيد تأثير العقوبة عندما تكون مسافة المشي طويلة.",
      log_stop_count: "عدد المحطات بمقياس لوغاريتمي لتقليل تأثير القيم المتطرفة."
    },
    modeLabels: { bus: "حافلات (كازاباص)", tram: "ترام", busway: "باص واي", multi: "متعدد الوسائط" },
    defaultFeatureDescription: "هذا العامل يساهم في ناتج النموذج.",
    insights: {
      stop_density:
        "أقوى عامل هو زيادة المحطات قرب المرافق الصحية. محطة ضمن 300 متر قد تحسن الوصول بشكل واضح.",
      nearest_stop_dist:
        "تقليل مسافة المشي إلى أقرب محطة له أثر كبير على مستوى الولوجية.",
      stop_count_500m: "عدد المحطات المتاحة على مسافة مشي قصيرة مهم لتوفير بدائل تنقل للمستخدمين.",
      healthcare_density_1km: "تمركز المرافق مهم؛ المرافق الصحية المعزولة تبقى أقل مرونة حتى مع اتصال مقبول.",
      default: "يبقى العامل الأهم هو تغطية النقل العمومي حول المرافق الصحية."
    }
  }
};

function parseModes(stop) {
  const modeText = String(stop?.mode || "").toLowerCase();
  const linesText = String(stop?.lines || "").toLowerCase();
  const merged = `${modeText} ${linesText}`;
  const hasBus = merged.includes("bus") || merged.includes("casabus") || /\bl\d{2,3}\b/.test(merged);
  const hasTram = merged.includes("tram");
  const hasBusway = merged.includes("busway");
  return { hasBus, hasTram, hasBusway };
}

function humanizeFeatureName(key) {
  return String(key || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function generateInsight(topFeatures, copy) {
  const top = topFeatures[0]?.name;
  return copy.insights[top] ?? copy.insights.default;
}

export default function Analytics({ facilities, transportStops, explainabilityRows, isLoading, equity }) {
  const { t, language, isRtl } = useI18n();
  const copy = ANALYTICS_COPY[language] || ANALYTICS_COPY.en;
  const [openInfoKey, setOpenInfoKey] = useState("");
  const labelAxisWidth = isRtl ? 170 : 135;

  const distanceDistributionRows = useMemo(() => {
    const rows = [
      { bucket: "< 100m", count: 0, color: "#3B6D11" },
      { bucket: "100–200m", count: 0, color: "#BA7517" },
      { bucket: "200–300m", count: 0, color: "#D85A30" },
      { bucket: "> 300m", count: 0, color: "#993C1D" }
    ];
    for (const facility of facilities) {
      const distance = Number(facility.nearestStopDistanceMeters);
      if (!Number.isFinite(distance)) continue;
      if (distance < 100) rows[0].count += 1;
      else if (distance < 200) rows[1].count += 1;
      else if (distance < 300) rows[2].count += 1;
      else rows[3].count += 1;
    }
    return rows;
  }, [facilities]);

  const transportModeCoverageRows = useMemo(() => {
    const counts = { bus: 0, tram: 0, busway: 0, multi: 0 };
    for (const stop of transportStops) {
      const { hasBus, hasTram, hasBusway } = parseModes(stop);
      const activeModes = [hasBus, hasTram, hasBusway].filter(Boolean).length;
      if (activeModes > 1) counts.multi += 1;
      else if (hasBusway) counts.busway += 1;
      else if (hasTram) counts.tram += 1;
      else if (hasBus) counts.bus += 1;
    }
    const ramp = ["#0f766e", "#0d9488", "#14b8a6", "#5eead4"];
    return [
      { mode: copy.modeLabels.bus, count: counts.bus, color: ramp[0] },
      { mode: copy.modeLabels.tram, count: counts.tram, color: ramp[1] },
      { mode: copy.modeLabels.busway, count: counts.busway, color: ramp[2] },
      { mode: copy.modeLabels.multi, count: counts.multi, color: ramp[3] }
    ];
  }, [transportStops, copy]);

  const importanceRows = useMemo(() => {
    const rows = explainabilityRows
      .map((row) => {
        const key = String(row.feature || "").trim();
        const value = Number(row.importance || 0);
        return {
          key,
          name: key,
          label: copy.featureDisplayNames[key] ?? humanizeFeatureName(key),
          description: copy.featureDescriptions[key] ?? copy.defaultFeatureDescription,
          value
        };
      })
      .filter((row) => row.key);
    const max = Math.max(...rows.map((row) => row.value), 1);
    return rows.map((row) => ({
      ...row,
      pct: Math.round(row.value * 100),
      widthPct: Math.max(8, (row.value / max) * 100)
    }));
  }, [explainabilityRows, copy]);

  const topFeatures = importanceRows.slice(0, 2);
  const topInsight = generateInsight(topFeatures, copy);
  const populationAvailable = equity?.population_available !== false;

  return (
    <section className={`space-y-3 rtl-safe-text ${isRtl ? "text-right" : "text-left"}`}>
      <article className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="font-heading text-[18px] font-bold text-gray-900">Dashboard</h2>
        <p className="mt-1 text-[14px] text-gray-700">
          Quantitative analysis of access distribution, transport coverage, model drivers and equity signals.
        </p>
      </article>

      {populationAvailable ? null : (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
          Note: {t("analytics.populationWarning")}
        </div>
      )}

      {isLoading ? (
        <article className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm text-[13px] text-gray-600">
          {t("analytics.loading")}
        </article>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <article className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <h3 className="font-heading text-[12px] font-semibold uppercase tracking-wide text-gray-500">
                  {t("analytics.scoreSpread")}
                </h3>
              <div className="rtl-chart mt-2 h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={distanceDistributionRows} margin={swapChartMargin(isRtl, { top: 8, right: 16, left: 8, bottom: 8 })}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="bucket" tick={{ fontSize: 12 }} tickMargin={8} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12 }} tickFormatter={(value) => toLocaleNumber(value, language)} />
                    <Tooltip
                      contentStyle={{ direction: isRtl ? "rtl" : "ltr", textAlign: isRtl ? "right" : "left" }}
                      formatter={(value) => toLocaleNumber(value, language)}
                    />
                    <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                      {distanceDistributionRows.map((row) => (
                        <Cell key={row.bucket} fill={row.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </article>

            <article className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <h3 className="font-heading text-[12px] font-semibold uppercase tracking-wide text-gray-500">
                  {t("analytics.leftBehind")}
                </h3>
              <div className="rtl-chart mt-2 h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={transportModeCoverageRows}
                    layout="vertical"
                    margin={swapChartMargin(isRtl, { top: 8, right: 20, left: 20, bottom: 8 })}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis type="number" tick={{ fontSize: 12 }} tickFormatter={(value) => toLocaleNumber(value, language)} allowDecimals={false} />
                    <YAxis type="category" dataKey="mode" width={labelAxisWidth} tick={{ fontSize: 12 }} />
                    <Tooltip
                      contentStyle={{ direction: isRtl ? "rtl" : "ltr", textAlign: isRtl ? "right" : "left" }}
                      formatter={(value) => toLocaleNumber(value, language)}
                    />
                    <Bar dataKey="count" radius={[0, 6, 6, 0]}>
                      {transportModeCoverageRows.map((row) => (
                        <Cell key={row.mode} fill={row.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </article>
          </div>

          <article className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <h3 className="font-heading text-[18px] font-bold text-gray-900">{t("analytics.driversTitle")}</h3>
            <p className="mt-1 text-[13px] text-gray-600">{t("analytics.driversSubtitle")}</p>
            <div className="mt-3 space-y-2">
              {importanceRows.map((row) => (
                <div key={row.key} className="rounded-lg border border-gray-100 p-2">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-medium leading-5 text-gray-800">{row.label}</span>
                    <div className="flex items-center gap-2">
                      <span className="num-ltr text-sm font-semibold text-gray-700">{toLocalePercent(row.pct, language, 0)}%</span>
                      <button
                        type="button"
                        className="relative inline-flex h-4 w-4 items-center justify-center rounded-full border border-gray-300 text-[10px] text-gray-600"
                        onClick={() => setOpenInfoKey((prev) => (prev === row.key ? "" : row.key))}
                      >
                        i
                        {openInfoKey === row.key ? (
                          <span
                            className={`absolute top-5 z-10 w-64 max-w-[80vw] rounded-lg border border-gray-200 bg-white p-2 text-[11px] font-normal text-gray-700 shadow-sm rtl-safe-text ${
                              sideClass(isRtl, "right-0 text-left", "left-0 text-right")
                            }`}
                          >
                            {row.description}
                          </span>
                        ) : null}
                      </button>
                    </div>
                  </div>
                  <div className="mt-1 h-2 rounded-full bg-gray-200">
                    <div className="h-2 rounded-full bg-[#378ADD]" style={{ width: `${row.widthPct}%` }} />
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50 p-4">
              <p className="text-[13px] text-blue-900">Planning insight: {topInsight}</p>
              <p className="mt-2 text-[13px] text-blue-800">
                {t("analytics.topInsight", {
                  label: topFeatures[0]?.label || t("analytics.na"),
                  pct: topFeatures[0] ? `${toLocalePercent(topFeatures[0].pct, language, 0)}%` : "0%"
                })}
              </p>
              <p className="text-[13px] text-blue-800">
                {t("analytics.secondInsight", {
                  label: topFeatures[1]?.label || t("analytics.na"),
                  pct: topFeatures[1] ? `${toLocalePercent(topFeatures[1].pct, language, 0)}%` : "0%"
                })}
              </p>
            </div>
          </article>

          <article className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <h3 className="font-heading text-[12px] font-semibold uppercase tracking-wide text-gray-500">{t("analytics.inequality")}</h3>
            <p className="mt-1 text-[14px] text-gray-800">
              {typeof equity?.gini_coefficient === "number"
                ? `${toLocalePercent(Math.round(equity.gini_coefficient * 100), language, 0)}%`
                : t("common.notAvailable")}
            </p>
          </article>
        </>
      )}
    </section>
  );
}
