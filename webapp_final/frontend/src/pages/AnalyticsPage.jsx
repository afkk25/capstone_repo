// import { useEffect, useState } from "react";
// import {
//   formatCompactNumber,
//   formatMinutes,
//   formatPercent,
//   formatScore,
// } from "../utils/formatters.js";
// import { api } from "../api/client.js";

// export default function AnalyticsPage({ cityId }) {
//   const [ranking, setRanking] = useState(null);
//   const [sortMode, setSortMode] = useState("weakest");
//   const [loading, setLoading] = useState(Boolean(cityId));
//   const [error, setError] = useState(null);

//   useEffect(() => {
//     if (!cityId) return;

//     let cancelled = false;

//     async function load() {
//       setLoading(true);
//       setError(null);

//       try {
//         const data = await api.getRanking(cityId);
//         if (!cancelled) {
//           console.log("Ranking response", data);
//           setRanking(data);
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
//       <Message
//         title="No city selected"
//         message="Select or upload a city first."
//       />
//     );
//   }

//   if (loading) {
//     return (
//       <Message
//         title="Loading analytics..."
//         message="Computing commune ranking."
//       />
//     );
//   }

//   if (error) {
//     return <Message title="Could not load analytics" message={error} />;
//   }

//   const rows = ranking?.ranking || [];

//   const sortedRows = [...rows].sort((a, b) => {
//     const scoreA = Number(a.pop_weighted_accessibility_score ?? 999);
//     const scoreB = Number(b.pop_weighted_accessibility_score ?? 999);

//     if (sortMode === "strongest") return scoreB - scoreA;

//     if (sortMode === "travel_time") {
//       return (
//         Number(b.avg_total_travel_time_min_pw ?? 0) -
//         Number(a.avg_total_travel_time_min_pw ?? 0)
//       );
//     }

//     if (sortMode === "gap") {
//       return (
//         Number(b.pct_pop_score_below_50 ?? 0) -
//         Number(a.pct_pop_score_below_50 ?? 0)
//       );
//     }

//     return scoreA - scoreB;
//   });

//   const topRows = sortedRows.slice(0, 12);

//   return (
//     <div className="section-space">
//       <section className="toolbar">
//         <div>
//           <h2 className="page-title">Commune accessibility ranking</h2>
//           <p className="page-subtitle">
//             Areas are ranked using population-weighted accessibility indicators
//             computed from uploaded origin-level metrics.
//           </p>
//         </div>

//         <div className="card card-pad" style={{ minWidth: "280px" }}>
//           <label>
//             <span className="input-label">Sort by</span>
//             <select
//               value={sortMode}
//               onChange={(e) => setSortMode(e.target.value)}
//               className="select-input"
//             >
//               <option value="weakest">Weakest accessibility first</option>
//               <option value="strongest">Strongest accessibility first</option>
//               <option value="travel_time">Highest travel time first</option>
//               <option value="gap">Largest coverage gap first</option>
//             </select>
//           </label>
//         </div>
//       </section>

//       {ranking?.warnings?.length > 0 && (
//         <div className="warning-box">
//           {ranking.warnings.map((warning, index) => (
//             <p key={index} style={{ margin: index === 0 ? 0 : "8px 0 0" }}>
//               {warning}
//             </p>
//           ))}
//         </div>
//       )}

//       <div className="table-wrap">
//         <table className="data-table">
//           <thead>
//             <tr>
//               <th>Rank</th>
//               <th>Commune / area</th>
//               <th>Parent district</th>
//               <th>Population</th>
//               <th>Avg. time</th>
//               <th>Score</th>
//               <th>Within 60 min</th>
//               <th>Coverage gap</th>
//             </tr>
//           </thead>

//           <tbody>
//             {topRows.map((row, index) => (
//               <tr key={`${row.zone_name}-${index}`}>
//                 <td>{index + 1}</td>
//                 <td>
//                   <strong>{row.commune_name || row.zone_name}</strong>
//                 </td>
//                 <td>{row.district_name || "—"}</td>
//                 <td>{formatCompactNumber(row.population)}</td>
//                 <td>{formatMinutes(row.avg_total_travel_time_min_pw)}</td>
//                 <td>{formatScore(row.pop_weighted_accessibility_score)}</td>
//                 <td>{formatPercent(row.pct_pop_access_60min)}</td>
//                 <td>{formatPercent(row.pct_pop_score_below_50)}</td>
//               </tr>
//             ))}
//           </tbody>
//         </table>

//         {topRows.length === 0 && (
//           <div className="empty-state" style={{ color: "#64748b" }}>
//             No ranking data available.
//           </div>
//         )}
//       </div>

//       <div className="card card-pad" style={{ color: "#64748b", fontSize: "14px" }}>
//         Showing <strong>{topRows.length}</strong> of <strong>{rows.length}</strong>{" "}
//         areas. The ranking can be sorted by accessibility score, travel time, or
//         coverage gap.
//       </div>
//     </div>
//   );
// }

// function Message({ title, message }) {
//   return (
//     <div className="card card-pad empty-state">
//       <h2 style={{ marginTop: 0 }}>{title}</h2>
//       <p style={{ color: "#64748b", marginBottom: 0 }}>{message}</p>
//     </div>
//   );
// }

import { useEffect, useState } from "react";
import {
  formatCompactNumber,
  formatMinutes,
  formatPercent,
  formatScore,
} from "../utils/formatters.js";
import { api } from "../api/client.js";
import { useI18n } from "../i18n/I18nContext.jsx";

export default function AnalyticsPage({ cityId }) {
  const { t } = useI18n();

  const [ranking, setRanking] = useState(null);
  const [sortMode, setSortMode] = useState("weakest");
  const [loading, setLoading] = useState(Boolean(cityId));
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!cityId) return;

    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const data = await api.getRanking(cityId);
        if (!cancelled) {
          console.log("Ranking response", data);
          setRanking(data);
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
      <Message
        title={t("noCitySelected") || "No city selected"}
        message={t("selectCityFirst") || "Select or upload a city first."}
      />
    );
  }

  if (loading) {
    return (
      <Message
        title={t("loadingAnalytics") || "Loading analytics..."}
        message={t("loadingAnalyticsMessage") || "Computing commune ranking."}
      />
    );
  }

  if (error) {
    return (
      <Message
        title={t("analyticsLoadError") || "Could not load analytics"}
        message={error}
      />
    );
  }

  const rows = ranking?.ranking || [];

  const sortedRows = [...rows].sort((a, b) => {
    const scoreA = Number(a.pop_weighted_accessibility_score ?? 999);
    const scoreB = Number(b.pop_weighted_accessibility_score ?? 999);

    if (sortMode === "strongest") return scoreB - scoreA;

    if (sortMode === "travel_time") {
      return (
        Number(b.avg_total_travel_time_min_pw ?? 0) -
        Number(a.avg_total_travel_time_min_pw ?? 0)
      );
    }

    if (sortMode === "gap") {
      return (
        Number(b.pct_pop_score_below_50 ?? 0) -
        Number(a.pct_pop_score_below_50 ?? 0)
      );
    }

    return scoreA - scoreB;
  });

  const topRows = sortedRows.slice(0, 12);

  return (
    <div className="section-space">
      <section className="toolbar">
        <div>
          <h2 className="page-title">{t("analyticsTitle")}</h2>
          <p className="page-subtitle">{t("analyticsSubtitle")}</p>
        </div>

        <div className="card card-pad" style={{ minWidth: "280px" }}>
          <label>
            <span className="input-label">{t("sortBy")}</span>
            <select
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value)}
              className="select-input"
            >
              <option value="weakest">{t("weakestFirst")}</option>
              <option value="strongest">{t("strongestFirst")}</option>
              <option value="travel_time">{t("highestTravelTime")}</option>
              <option value="gap">{t("largestGap")}</option>
            </select>
          </label>
        </div>
      </section>

      {ranking?.warnings?.length > 0 && (
        <div className="warning-box">
          {ranking.warnings.map((warning, index) => (
            <p key={index} style={{ margin: index === 0 ? 0 : "8px 0 0" }}>
              {warning}
            </p>
          ))}
        </div>
      )}

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>{t("rank")}</th>
              <th>{t("communeArea")}</th>
              <th>{t("parentDistrict")}</th>
              <th>{t("population")}</th>
              <th>{t("avgTime")}</th>
              <th>{t("score")}</th>
              <th>{t("within60")}</th>
              <th>{t("coverageGap")}</th>
            </tr>
          </thead>

          <tbody>
            {topRows.map((row, index) => (
              <tr key={`${row.zone_name}-${index}`}>
                <td>{index + 1}</td>
                <td>
                  <strong>{row.commune_name || row.zone_name}</strong>
                </td>
                <td>{row.district_name || "—"}</td>
                <td>{formatCompactNumber(row.population)}</td>
                <td>{formatMinutes(row.avg_total_travel_time_min_pw)}</td>
                <td>{formatScore(row.pop_weighted_accessibility_score)}</td>
                <td>{formatPercent(row.pct_pop_access_60min)}</td>
                <td>{formatPercent(row.pct_pop_score_below_50)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {topRows.length === 0 && (
          <div className="empty-state" style={{ color: "#64748b" }}>
            {t("noRankingData") || "No ranking data available."}
          </div>
        )}
      </div>

      <div className="card card-pad" style={{ color: "#64748b", fontSize: "14px" }}>
        {t("showing")} <strong>{topRows.length}</strong> {t("of")}{" "}
        <strong>{rows.length}</strong> {t("areas")}. {t("rankingNote")}
      </div>
    </div>
  );
}

function Message({ title, message }) {
  return (
    <div className="card card-pad empty-state">
      <h2 style={{ marginTop: 0 }}>{title}</h2>
      <p style={{ color: "#64748b", marginBottom: 0 }}>{message}</p>
    </div>
  );
}