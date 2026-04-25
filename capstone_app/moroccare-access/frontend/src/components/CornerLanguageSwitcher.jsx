import { useState } from "react";
import { useI18n } from "../i18n/I18nProvider";

export default function CornerLanguageSwitcher({ className = "", inline = false }) {
  const { language, setLanguage, isRtl, t } = useI18n();
  const [open, setOpen] = useState(false);

  const options = [
    { code: "en", label: "EN" },
    { code: "fr", label: "FR" },
    { code: "ar", label: "AR" }
  ];

  return (
    <div className={`${inline ? "relative" : `fixed top-4 z-[1500] ${isRtl ? "left-4" : "right-4"}`} ${className}`.trim()}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="mc-language-trigger"
        aria-label={t("common.changeLanguage")}
        aria-expanded={open}
      >
        <span className="mc-language-trigger__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" role="presentation" focusable="false">
            <path
              d="M12 3.25a8.75 8.75 0 1 0 0 17.5a8.75 8.75 0 0 0 0-17.5Zm5.93 5.25h-2.56a14.1 14.1 0 0 0-1.16-3.01a7.29 7.29 0 0 1 3.72 3.01ZM12 4.73c.54.62 1.38 1.98 1.93 3.77h-3.86C10.62 6.71 11.46 5.35 12 4.73ZM8.79 5.49A14.1 14.1 0 0 0 7.63 8.5H5.07a7.29 7.29 0 0 1 3.72-3.01ZM4.73 12c0-.69.1-1.36.28-2h2.31c-.1.65-.15 1.32-.15 2s.05 1.35.15 2H5a7.3 7.3 0 0 1-.27-2Zm.34 3.5h2.56c.27 1.08.67 2.1 1.16 3a7.29 7.29 0 0 1-3.72-3Zm6.93 3.77c-.54-.62-1.38-1.98-1.93-3.77h3.86c-.55 1.79-1.39 3.15-1.93 3.77Zm2.28-5.27H9.72a12.37 12.37 0 0 1-.18-2c0-.69.06-1.36.18-2h4.56c.12.64.18 1.31.18 2s-.06 1.36-.18 2Zm-.07 4.5c.5-.9.89-1.92 1.16-3h2.56a7.29 7.29 0 0 1-3.72 3Zm1.48-4.5c.1-.65.15-1.32.15-2s-.05-1.35-.15-2H19a7.3 7.3 0 0 1 0 4h-2.31Z"
              fill="currentColor"
            />
          </svg>
        </span>
        <span className="mc-language-trigger__code">{language.toUpperCase()}</span>
        <span className="mc-language-trigger__caret" aria-hidden="true">
          <svg viewBox="0 0 20 20" role="presentation" focusable="false">
            <path d="M5.75 7.75L10 12l4.25-4.25" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>
      {open ? (
        <div className={`mc-language-menu ${inline ? `absolute z-20 ${isRtl ? "left-0" : "right-0"}` : `${isRtl ? "absolute left-0" : "absolute right-0"}`}`}>
          {options.map((option) => (
            <button
              key={option.code}
              type="button"
              onClick={() => {
                setLanguage(option.code);
                setOpen(false);
              }}
              className={`mc-language-menu__item ${isRtl ? "text-right" : "text-left"} ${
                language === option.code ? "is-active" : ""
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
