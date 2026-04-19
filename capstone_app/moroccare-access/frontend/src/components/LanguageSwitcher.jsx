import { useI18n } from "../i18n/I18nProvider";

export default function LanguageSwitcher({ compact = false }) {
  const { language, setLanguage, t } = useI18n();

  return (
    <label className="inline-flex items-center gap-2 text-xs text-gray-700">
      {!compact ? <span className="font-semibold text-gray-600">{t("common.language")}</span> : null}
      <select
        value={language}
        onChange={(event) => setLanguage(event.target.value)}
        className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700"
      >
        <option value="en">{t("common.english")}</option>
        <option value="fr">{t("common.french")}</option>
        <option value="ar">{t("common.arabic")}</option>
      </select>
    </label>
  );
}

