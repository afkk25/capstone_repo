export function getLatLngFromFeature(item) {
  if (
    item?.geometry?.type === "Point" &&
    Array.isArray(item.geometry.coordinates) &&
    item.geometry.coordinates.length >= 2
  ) {
    const [lng, lat] = item.geometry.coordinates;
    if (Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))) {
      return [Number(lat), Number(lng)];
    }
  }

  const lat =
    item?.latitude ??
    item?.lat ??
    item?.properties?.latitude ??
    item?.properties?.lat;

  const lng =
    item?.longitude ??
    item?.lon ??
    item?.lng ??
    item?.properties?.longitude ??
    item?.properties?.lon ??
    item?.properties?.lng;

  if (Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))) {
    return [Number(lat), Number(lng)];
  }

  return null;
}

export function normalizeFeatureList(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (payload?.type === "FeatureCollection" && Array.isArray(payload.features)) return payload.features;
  if (Array.isArray(payload?.rows)) return payload.rows;
  if (Array.isArray(payload?.features)) return payload.features;
  return [];
}

export function splitValidInvalidByLatLng(items) {
  const valid = [];
  const invalid = [];
  for (const item of items || []) {
    const latLng = getLatLngFromFeature(item);
    if (latLng) valid.push({ item, latLng });
    else invalid.push(item);
  }
  return { valid, invalid };
}
