// export default function CitySelector({ cities, selectedCityId, onChange }) {
//   return (
//     <select
//       value={selectedCityId || ""}
//       onChange={(event) => onChange(event.target.value)}
//       className="city-select"
//     >
//       {cities.map((city) => {
//         const status = city.baseline_ready
//           ? city.simulation_ready
//             ? "Ready + Simulation"
//             : "Baseline Ready"
//           : "Incomplete";

//         return (
//           <option key={city.city_id} value={city.city_id}>
//             {city.city_name || city.city_id} — {status}
//           </option>
//         );
//       })}
//     </select>
//   );
// }
export default function CitySelector({ cities, selectedCityId, onChange }) {
  return (
    <select
      value={selectedCityId || ""}
      onChange={(event) => onChange(event.target.value)}
      className="header-city-select"
    >
      {cities.map((city) => (
        <option key={city.city_id} value={city.city_id}>
          {city.city_name || city.city_id}
        </option>
      ))}
    </select>
  );
}