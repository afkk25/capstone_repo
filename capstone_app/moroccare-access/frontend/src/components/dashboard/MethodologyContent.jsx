export default function MethodologyContent({ className = "" }) {
  return (
    <div className={`space-y-4 text-sm leading-relaxed text-slate-700 ${className}`}>
      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 className="text-base font-semibold text-slate-800">Baseline accessibility</h3>
        <p className="mt-2">
          Baseline results estimate how effectively residents can reach healthcare facilities via public transport-related accessibility signals at district level.
        </p>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 className="text-base font-semibold text-slate-800">Simulation mode</h3>
        <p className="mt-2">
          Simulation applies intervention levers (stop density, walkability, and added facilities) and compares predicted outcomes against baseline.
        </p>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 className="text-base font-semibold text-slate-800">Underserved classification</h3>
        <p className="mt-2">Districts with low accessibility score are marked underserved. This helps identify where public investment can reduce inequity.</p>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 className="text-base font-semibold text-slate-800">Recommendations</h3>
        <p className="mt-2">Recommendations rank candidate interventions by balancing accessibility gain, inequality reduction, and potential population benefit.</p>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 className="text-base font-semibold text-slate-800">Explainability</h3>
        <p className="mt-2">Feature importance highlights which factors most influenced the model outputs, improving trust and interpretability for planners.</p>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 className="text-base font-semibold text-slate-800">Sensitivity analysis</h3>
        <p className="mt-2">Sensitivity tests robustness by perturbing assumptions (walking speed, waiting time, transport speed) and tracking output variation.</p>
      </section>
    </div>
  );
}

