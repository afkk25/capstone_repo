import { useI18n } from "../../i18n/I18nProvider";

export default function AnalysisMethodologyPage() {
  const { t } = useI18n();

  const methodologySteps = [
    { title: t("methodologyPage.step1Title"), text: t("methodologyPage.step1Body") },
    { title: t("methodologyPage.step2Title"), text: t("methodologyPage.step2Body") },
    { title: t("methodologyPage.step3Title"), text: t("methodologyPage.step3Body") },
    { title: t("methodologyPage.step4Title"), text: t("methodologyPage.step4Body") },
    { title: t("methodologyPage.step5Title"), text: t("methodologyPage.step5Body") }
  ];

  const qualityChecks = [t("methodologyPage.quality1"), t("methodologyPage.quality2"), t("methodologyPage.quality3"), t("methodologyPage.quality4")];
  const responsibleUse = [
    t("methodologyPage.responsible1"),
    t("methodologyPage.responsible2"),
    t("methodologyPage.responsible3"),
    t("methodologyPage.responsible4"),
    t("methodologyPage.responsible5")
  ];
  const dataRequirements = [
    t("methodologyPage.requirement1"),
    t("methodologyPage.requirement2"),
    t("methodologyPage.requirement3"),
    t("methodologyPage.requirement4")
  ];

  return (
    <section className="mc-info-page">
      <div className="mc-info-hero">
        <span>{t("methodologyPage.heroEyebrow")}</span>
        <h1>{t("methodologyPage.heroTitle")}</h1>
        <p>{t("methodologyPage.heroBody")}</p>
      </div>

      <div className="mc-two-col">
        <section className="mc-info-card">
          <h2>{t("methodologyPage.dataNeededTitle")}</h2>
          <ul className="mc-check-list">
            {dataRequirements.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
        <section className="mc-info-card">
          <h2>{t("methodologyPage.limitationsTitle")}</h2>
          <p>{t("methodologyPage.limitationsBody")}</p>
        </section>
      </div>

      <div className="mc-method-grid">
        {methodologySteps.map((step) => (
          <article className="mc-info-card" key={step.title}>
            <h2>{step.title}</h2>
            <p>{step.text}</p>
          </article>
        ))}
      </div>

      <div className="mc-two-col">
        <section className="mc-info-card">
          <h2>{t("methodologyPage.scoreMeaningTitle")}</h2>
          <p>{t("methodologyPage.scoreMeaningBody")}</p>
        </section>
        <section className="mc-info-card">
          <h2>{t("methodologyPage.safeguardsTitle")}</h2>
          <ul className="mc-check-list">
            {qualityChecks.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      </div>

      <div className="mc-two-col">
        <section className="mc-info-card">
          <h2>{t("methodologyPage.defendTitle")}</h2>
          <p>{t("methodologyPage.defendBody")}</p>
        </section>
        <section className="mc-info-card">
          <h2>{t("methodologyPage.responsibleTitle")}</h2>
          <ul className="mc-check-list">
            {responsibleUse.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      </div>
    </section>
  );
}
