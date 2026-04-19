import { useState } from "react";
import { useI18n } from "../i18n/I18nProvider";

export default function CornerLanguageSwitcher() {
  const { language, setLanguage, isRtl } = useI18n();
  const [open, setOpen] = useState(false);

  const options = [
    { code: "en", label: "EN" },
    { code: "fr", label: "FR" },
    { code: "ar", label: "AR" }
  ];

  return (
    <div className={`fixed top-4 z-[1500] ${isRtl ? "left-4" : "right-4"}`}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-md hover:bg-slate-50"
        aria-label="Change language"
      >
        <span aria-hidden="true">🌐</span>
        <span>{language.toUpperCase()}</span>
      </button>
      {open ? (
        <div className="mt-2 rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
          {options.map((option) => (
            <button
              key={option.code}
              type="button"
              onClick={() => {
                setLanguage(option.code);
                setOpen(false);
              }}
              className={`block w-full rounded-lg px-3 py-1.5 text-xs font-semibold transition ${isRtl ? "text-right" : "text-left"} ${
                language === option.code ? "bg-blue-50 text-blue-700" : "text-slate-700 hover:bg-slate-50"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

