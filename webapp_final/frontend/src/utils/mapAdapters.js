export function toFeatureArray(response) {
  if (!response) return [];
  if (Array.isArray(response)) return response;
  if (Array.isArray(response.features)) return response.features;
  if (Array.isArray(response.data)) return response.data;
  return [];
}

export function getLatLng(featureOrRow) {
  if (!featureOrRow) return null;

  if (
    featureOrRow.geometry?.type === "Point" &&
    Array.isArray(featureOrRow.geometry.coordinates)
  ) {
    const [lng, lat] = featureOrRow.geometry.coordinates;
    const latNum = Number(lat);
    const lngNum = Number(lng);

    if (Number.isFinite(latNum) && Number.isFinite(lngNum)) {
      return [latNum, lngNum];
    }
  }

  const source = {
    ...featureOrRow,
    ...(featureOrRow.properties || {}),
  };

  const lat = source.latitude ?? source.lat;
  const lng = source.longitude ?? source.lng ?? source.lon;

  const latNum = Number(lat);
  const lngNum = Number(lng);

  if (Number.isFinite(latNum) && Number.isFinite(lngNum)) {
    return [latNum, lngNum];
  }

  return null;
}

export function getProps(featureOrRow) {
  return featureOrRow?.properties || featureOrRow || {};
}