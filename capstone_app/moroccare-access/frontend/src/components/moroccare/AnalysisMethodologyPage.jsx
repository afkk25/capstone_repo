const methodologySteps = [
  {
    title: "1. Build the origin layer",
    text: "Population origins are cleaned, geocoded or loaded from the city dataset, then linked to district boundaries when available. This lets the model measure access from where people live, not only from facility locations."
  },
  {
    title: "2. Measure transport proximity",
    text: "Each origin is evaluated against bus, tram and busway stops. The model calculates nearest-stop distance, stops within a walkable radius, and service density indicators."
  },
  {
    title: "3. Estimate healthcare accessibility",
    text: "Accessibility combines transport reach, travel-time assumptions, healthcare supply, and spatial concentration. Scores are normalized from 0 to 1 so districts can be compared fairly."
  },
  {
    title: "4. Aggregate equity signals",
    text: "Origin-level results are summarized by district, population, underserved share, coverage gap and inequality indicators. This highlights who benefits and who remains left behind."
  },
  {
    title: "5. Simulate planning interventions",
    text: "Scenarios update affected origin features, such as nearest-stop distance, stop density and healthcare supply, then re-run the accessibility model. This is a planning proxy, not a timetable-aware routing engine."
  }
];

const qualityChecks = [
  "Coordinates are filtered for valid latitude and longitude.",
  "District summaries are derived from origin-level scores when origin data exists.",
  "Scenario outputs keep before and after values side by side for auditability.",
  "Recommendations are generated from lowest access, population benefit and coverage gap."
];

const responsibleUse = [
  "Use results to prioritize field review, not as the only basis for capital investment.",
  "Compare scenarios against the same baseline so improvements remain auditable.",
  "Treat facility-proxy cities as service-location analyses until population origins are added.",
  "Interpret simulated travel-time changes as model-derived planning estimates, not observed route itineraries.",
  "Validate proposed stops and facilities against land availability, operations and local policy constraints."
];

const dataRequirements = [
  "Required: healthcare facility points with latitude and longitude.",
  "Required: public transport stops with latitude and longitude.",
  "Recommended: population origin points for resident-centered access analysis.",
  "Recommended: district boundaries for district ranking and equity summaries."
];

export default function AnalysisMethodologyPage() {
  return (
    <section className="mc-info-page">
      <div className="mc-info-hero">
        <span>Analysis Methodology</span>
        <h1>How MorocCare turns transport and health data into planning evidence</h1>
        <p>
          This page explains the analytical pipeline behind the planning tool so users can defend decisions, reproduce results,
          and understand what each score means before committing public resources.
        </p>
      </div>

      <div className="mc-two-col">
        <section className="mc-info-card">
          <h2>Data needed for reuse</h2>
          <ul className="mc-check-list">
            {dataRequirements.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
        <section className="mc-info-card">
          <h2>Current limitations</h2>
          <p>
            The app shows only outputs supported by the current city data. If population origins or district boundaries are missing,
            district and equity views are limited and results should be interpreted at service-location level.
          </p>
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
          <h2>What the score means</h2>
          <p>
            A high score means a population origin has stronger expected access to healthcare through nearby transport and reasonable
            travel time. A low score identifies places where residents may need targeted transit improvements, healthcare facility placement,
            or better multimodal connectivity.
          </p>
        </section>
        <section className="mc-info-card">
          <h2>Model safeguards</h2>
          <ul className="mc-check-list">
            {qualityChecks.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      </div>

      <div className="mc-two-col">
        <section className="mc-info-card">
          <h2>How to defend the methodology</h2>
          <p>
            The notebooks create the evidence base: data collection, cleaning, population/district enrichment, accessibility
            scoring and model training. The web app is the decision layer: it exposes those outputs, lets users test planning
            interventions, and keeps every scenario separate from the baseline.
          </p>
        </section>
        <section className="mc-info-card">
          <h2>Responsible interpretation</h2>
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
