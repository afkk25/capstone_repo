export function stakeholderMessage(message, fallback = "The requested information is not available for the current dataset.") {
  const text = String(message || "").toLowerCase();
  if (!text) return fallback;
  if (text.includes("not found") || text.includes("404")) return "The selected city workspace could not be loaded. Choose another city or upload a complete city dataset.";
  if (text.includes("network") || text.includes("timeout") || text.includes("failed to fetch")) return "The planning service is temporarily unavailable. Check that the backend is running, then try again.";
  if (text.includes("population")) return "Population inputs are missing or incomplete. Upload population data to unlock population-weighted equity analysis.";
  if (text.includes("district") || text.includes("geojson")) return "District boundaries are missing or incomplete. Upload district inputs to unlock district-level analysis.";
  if (text.includes("origin") || text.includes("facility proxy")) return "Origin-area data is limited for this city. Some results are shown at representative service-location level.";
  if (text.includes("model") || text.includes("feature")) return "The accessibility model could not be evaluated for this dataset. Review the city inputs and try again.";
  return fallback;
}

export function stakeholderWarnings(warnings = []) {
  const normalized = [...new Set((Array.isArray(warnings) ? warnings : []).map((warning) => stakeholderMessage(warning)).filter(Boolean))];
  return normalized;
}
