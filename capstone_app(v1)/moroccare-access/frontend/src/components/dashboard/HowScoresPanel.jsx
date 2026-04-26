import SectionCard from "../layout/SectionCard";

export default function HowScoresPanel() {
  return (
    <SectionCard title="How scores are computed" subtitle="Method summary for demo transparency">
      <details className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">
        <summary className="cursor-pointer font-semibold text-slate-800">Open methodology notes</summary>
        <div className="mt-3 space-y-2 text-sm leading-relaxed text-slate-700">
          <p>
            Baseline accessibility is estimated from transport proximity, stop density, and local healthcare supply indicators. Scores are normalized between 0 and 1, where higher values indicate better access.
          </p>
          <p>
            Simulation perturbs intervention levers (transport stop density, walkability, added facilities) and recomputes district-level accessibility outcomes.
          </p>
          <p>
            Underserved districts are those with low accessibility scores; recommendations and ranking prioritize districts with high underserved share and lower average score.
          </p>
        </div>
      </details>
    </SectionCard>
  );
}
