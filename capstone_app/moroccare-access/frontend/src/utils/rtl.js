const localeMap = {
  en: "en-US",
  fr: "fr-FR",
  ar: "ar-MA"
};

export function toLocaleNumber(value, language = "en", options = {}) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "—";
  return new Intl.NumberFormat(localeMap[language] || localeMap.en, options).format(num);
}

export function toLocalePercent(value, language = "en", fractionDigits = 1) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "—";
  return new Intl.NumberFormat(localeMap[language] || localeMap.en, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits
  }).format(num);
}

export function swapChartMargin(isRtl, margin) {
  if (!isRtl) return margin;
  return { ...margin, left: margin.right ?? 0, right: margin.left ?? 0 };
}

export function sideClass(isRtl, ltrClass, rtlClass) {
  return isRtl ? rtlClass : ltrClass;
}

