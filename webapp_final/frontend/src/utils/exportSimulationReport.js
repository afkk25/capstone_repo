function safeValue(value, fallback = "—") {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return fallback;
  }

  return value;
}

function formatNumber(value, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "—";
  }

  return Number(value).toLocaleString(undefined, {
    maximumFractionDigits: digits,
  });
}

function downloadTextFile(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();

  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function csvEscape(value) {
  const text = String(safeValue(value, ""));
  return `"${text.replaceAll('"', '""')}"`;
}

export function exportSimulationJson({
  result,
  marker,
  scenarioType,
  recommendations = [],
  cityId,
}) {
  const payload = {
    exported_at: new Date().toISOString(),
    city_id: cityId,
    scenario_type: scenarioType,
    selected_location: marker,
    summary: result?.summary || {},
    zone_impacts: result?.zone_impacts || result?.commune_impacts || [],
    recommendations,
    warnings: result?.warnings || [],
    raw_result: result,
  };

  downloadTextFile(
    `simulation-report-${cityId || "city"}.json`,
    JSON.stringify(payload, null, 2),
    "application/json;charset=utf-8"
  );
}

export function exportImpactedCommunesCsv({ result, cityId }) {
  const rows = result?.zone_impacts || result?.commune_impacts || [];

  const headers = [
    "Rank",
    "Commune / Area",
    "Parent District",
    "Population Benefiting",
    "Average Time Reduction (min)",
    "Accessibility Change",
  ];

  const csvRows = [
    headers.map(csvEscape).join(","),
    ...rows.map((row, index) =>
      [
        index + 1,
        row.zone_name || row.commune_name || "Unknown",
        row.district_name || "",
        row.population_improved ?? "",
        row.average_travel_time_reduction_min ?? "",
        row.average_accessibility_score_gain ?? "",
      ]
        .map(csvEscape)
        .join(",")
    ),
  ];

  downloadTextFile(
    `impacted-communes-${cityId || "city"}.csv`,
    csvRows.join("\n"),
    "text/csv;charset=utf-8"
  );
}

export function exportSimulationHtmlReport({
  result,
  marker,
  scenarioType,
  recommendations = [],
  cityId,
}) {
  const summary = result?.summary || {};
  const impacts = result?.zone_impacts || result?.commune_impacts || [];
  const warnings = result?.warnings || [];

  const scenarioLabel =
    scenarioType === "add_facility"
      ? "Add healthcare facility"
      : "Add transport stop";

  const locationText = marker
    ? `${marker.lat.toFixed(5)}, ${marker.lng.toFixed(5)}`
    : "No selected location";

  const impactRows = impacts
    .slice(0, 15)
    .map(
      (row, index) => `
        <tr>
          <td>${index + 1}</td>
          <td>${row.zone_name || row.commune_name || "Unknown"}</td>
          <td>${row.district_name || "—"}</td>
          <td>${formatNumber(row.population_improved, 0)}</td>
          <td>${formatNumber(row.average_travel_time_reduction_min, 2)}</td>
          <td>${formatNumber(row.average_accessibility_score_gain, 2)} / 100</td>
        </tr>
      `
    )
    .join("");

  const recommendationRows = recommendations
    .map(
      (item) => `
        <tr>
          <td>${item.rank || "—"}</td>
          <td>${formatNumber(item.latitude, 5)}, ${formatNumber(
        item.longitude,
        5
      )}</td>
          <td>${formatNumber(item.population_improved, 0)}</td>
          <td>${formatNumber(item.average_accessibility_score_gain, 2)} / 100</td>
          <td>${item.top_impacted_area || "—"}</td>
        </tr>
      `
    )
    .join("");

  const warningBlock = warnings.length
    ? warnings.map((warning) => `<li>${warning}</li>`).join("")
    : "<li>No warnings reported.</li>";

  const html = `
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Simulation Report - ${cityId || "City"}</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      color: #0f172a;
      margin: 40px;
      line-height: 1.5;
    }

    h1 {
      margin-bottom: 4px;
      font-size: 28px;
    }

    h2 {
      margin-top: 30px;
      font-size: 20px;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 8px;
    }

    .subtitle {
      color: #64748b;
      margin-top: 0;
    }

    .meta {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
      margin: 24px 0;
    }

    .card {
      border: 1px solid #e2e8f0;
      border-radius: 14px;
      padding: 16px;
      background: #f8fafc;
    }

    .label {
      color: #64748b;
      font-size: 12px;
      font-weight: bold;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .value {
      font-size: 24px;
      font-weight: bold;
      margin-top: 6px;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 12px;
      font-size: 13px;
    }

    th {
      background: #f8fafc;
      text-align: left;
      color: #334155;
    }

    th, td {
      border: 1px solid #e2e8f0;
      padding: 10px;
    }

    .note {
      background: #fffbeb;
      border: 1px solid #fde68a;
      color: #92400e;
      padding: 14px;
      border-radius: 12px;
    }

    .footer {
      margin-top: 40px;
      color: #64748b;
      font-size: 12px;
    }

    @media print {
      body {
        margin: 20px;
      }

      .no-print {
        display: none;
      }
    }
  </style>
</head>

<body>
  <button class="no-print" onclick="window.print()">Print / Save as PDF</button>

  <h1>MorocCare Access — Simulation Report</h1>
  <p class="subtitle">Generated on ${new Date().toLocaleString()}</p>

  <h2>Scenario setup</h2>
  <div class="meta">
    <div class="card">
      <div class="label">City</div>
      <div class="value">${cityId || "—"}</div>
    </div>

    <div class="card">
      <div class="label">Scenario type</div>
      <div class="value">${scenarioLabel}</div>
    </div>

    <div class="card">
      <div class="label">Selected location</div>
      <div class="value" style="font-size: 18px;">${locationText}</div>
    </div>
  </div>

  <h2>Scenario impact summary</h2>
  <div class="meta">
    <div class="card">
      <div class="label">Population benefiting</div>
      <div class="value">${formatNumber(summary.population_improved, 0)}</div>
    </div>

    <div class="card">
      <div class="label">Newly within 60 min</div>
      <div class="value">${formatNumber(
        summary.newly_covered_population_60min,
        0
      )}</div>
    </div>

    <div class="card">
      <div class="label">Avg. time reduction</div>
      <div class="value">${formatNumber(
        summary.average_travel_time_reduction_min,
        2
      )} min</div>
    </div>

    <div class="card">
      <div class="label">Accessibility improvement</div>
      <div class="value">${formatNumber(
        summary.average_accessibility_score_gain,
        2
      )} / 100</div>
    </div>

    <div class="card">
      <div class="label">Avg. score before</div>
      <div class="value">${formatNumber(summary.avg_score_before, 2)} / 100</div>
    </div>

    <div class="card">
      <div class="label">Avg. score after</div>
      <div class="value">${formatNumber(summary.avg_score_after, 2)} / 100</div>
    </div>
  </div>

  <h2>Warnings and interpretation notes</h2>
  <div class="note">
    <ul>${warningBlock}</ul>
    <p>
      These outputs are planning estimates from a simplified scenario model.
      They should be interpreted as candidate planning evidence, not final infrastructure decisions.
    </p>
  </div>

  <h2>Most impacted communes</h2>
  <table>
    <thead>
      <tr>
        <th>Rank</th>
        <th>Commune / Area</th>
        <th>Parent district</th>
        <th>Population benefiting</th>
        <th>Avg. time reduction</th>
        <th>Accessibility change</th>
      </tr>
    </thead>
    <tbody>
      ${
        impactRows ||
        `<tr><td colspan="6">No impacted communes were reported.</td></tr>`
      }
    </tbody>
  </table>

  <h2>Recommended candidate sites</h2>
  <table>
    <thead>
      <tr>
        <th>Rank</th>
        <th>Coordinates</th>
        <th>Population benefiting</th>
        <th>Accessibility gain</th>
        <th>Top impacted area</th>
      </tr>
    </thead>
    <tbody>
      ${
        recommendationRows ||
        `<tr><td colspan="5">No recommendation candidates were included.</td></tr>`
      }
    </tbody>
  </table>

  <p class="footer">
    Generated by MorocCare Access. This report summarizes the current simulation state.
  </p>
</body>
</html>
`;

  downloadTextFile(
    `simulation-report-${cityId || "city"}.html`,
    html,
    "text/html;charset=utf-8"
  );
}