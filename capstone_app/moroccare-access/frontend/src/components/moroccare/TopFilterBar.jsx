export default function TopFilterBar({
  districts = [],
  selectedDistrict,
  onDistrictChange,
  cities = [],
  selectedCityId,
  onCityChange
}) {
  return (
    <header className="mc-topbar">
      <div className="mc-filter-row">
        <label className="mc-select-wrap">
          <span>District</span>
          <select value={selectedDistrict} onChange={(event) => onDistrictChange?.(event.target.value)}>
            <option value="">All Districts</option>
            {districts.map((district) => (
              <option key={district} value={district}>{district}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="mc-top-actions" />
    </header>
  );
}
