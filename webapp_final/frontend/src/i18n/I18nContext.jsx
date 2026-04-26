import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { interpolate, translations } from "./translations.js";

const I18nContext = createContext(null);

export function I18nProvider({ children }) {
  const [language, setLanguage] = useState(
    localStorage.getItem("moroccare_language") || "en"
  );

  useEffect(() => {
    localStorage.setItem("moroccare_language", language);
    document.documentElement.lang = language;
    document.documentElement.dir = language === "ar" ? "rtl" : "ltr";
  }, [language]);

  const value = useMemo(() => {
    function t(key, values) {
      const dictionary = translations[language] || translations.en;
      const fallback = translations.en;
      return interpolate(dictionary[key] || fallback[key] || key, values);
    }

    return {
      language,
      setLanguage,
      t,
      isRtl: language === "ar",
    };
  }, [language]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used inside I18nProvider");
  }
  return context;
}