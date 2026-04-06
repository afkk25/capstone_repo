import { District } from "../types";

type Props = {
  districts: District[];
};

function scoreClass(score: number): string {
  if (score < 50) return "text-red-600";
  if (score < 65) return "text-amber-600";
  return "text-emerald-600";
}

export default function DistrictsTable({ districts }: Props) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-lg font-semibold text-slate-800">Districts View</h2>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-3 py-2">District</th>
              <th className="px-3 py-2">Accessibility</th>
              <th className="px-3 py-2">Population</th>
              <th className="px-3 py-2">Stop Density</th>
            </tr>
          </thead>
          <tbody>
            {districts.map((district) => (
              <tr key={district.district_name} className="border-t border-slate-100">
                <td className="px-3 py-2">{district.district_name}</td>
                <td className={`px-3 py-2 font-medium ${scoreClass(district.accessibility_score)}`}>
                  {district.accessibility_score.toFixed(1)}
                </td>
                <td className="px-3 py-2">{district.population.toLocaleString()}</td>
                <td className="px-3 py-2">{district.stop_density.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

