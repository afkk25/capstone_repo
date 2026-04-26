export function isAvailable(value) {
  return value !== null && value !== undefined && !Number.isNaN(Number(value));
}

export function formatNumber(value, decimals = 0) {
  if (!isAvailable(value)) return "Not available";

  return Number(value).toLocaleString(undefined, {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  });
}

export function formatCompactNumber(value) {
  if (!isAvailable(value)) return "Not available";

  return Number(value).toLocaleString(undefined, {
    notation: "compact",
    maximumFractionDigits: 2,
  });
}

export function formatPercent(value, decimals = 1) {
  if (!isAvailable(value)) return "Not available";

  return `${Number(value).toFixed(decimals)}%`;
}

export function formatMinutes(value, decimals = 1) {
  if (!isAvailable(value)) return "Not available";

  return `${Number(value).toFixed(decimals)} min`;
}

export function formatScore(value, decimals = 1) {
  if (!isAvailable(value)) return "Not available";

  let score = Number(value);

  if (score <= 1) {
    score = score * 100;
  }

  return `${score.toFixed(decimals)} / 100`;
}