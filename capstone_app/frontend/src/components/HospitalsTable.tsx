import { Hospital } from "../types";

type Props = {
  hospitals: Hospital[];
  title?: string;
};

export default function HospitalsTable({ hospitals, title = "Hospitals View" }: Props) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-lg font-semibold text-slate-800">{title}</h2>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-3 py-2">Hospital</th>
              <th className="px-3 py-2">Predicted Accessibility</th>
              <th className="px-3 py-2">Delta Transport</th>
              <th className="px-3 py-2">Delta Network</th>
              <th className="px-3 py-2">Population Served</th>
            </tr>
          </thead>
          <tbody>
            {hospitals.map((hospital) => (
              <tr key={hospital.facility_name} className="border-t border-slate-100">
                <td className="px-3 py-2">{hospital.facility_name}</td>
                <td className="px-3 py-2">{hospital.predicted_accessibility.toFixed(1)}</td>
                <td className="px-3 py-2 text-blue-700">+{hospital.delta_transport.toFixed(1)}</td>
                <td className="px-3 py-2 text-indigo-700">+{hospital.delta_network.toFixed(1)}</td>
                <td className="px-3 py-2">{hospital.population_served.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

