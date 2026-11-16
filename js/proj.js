// Web Mercator, the projection of the OpenStreetMap tiles under the map. ``zoom`` may be
// fractional: the world is then 256 * 2**zoom units wide (port of earthwatch/render/proj.py).
export const MAX_LAT = 85.0511;
export const world = (zoom) => 256 * 2 ** zoom;
export const xOf = (lon, zoom) => (lon + 180) / 360 * world(zoom);
export function yOf(lat, zoom) {
  lat = Math.max(-MAX_LAT, Math.min(MAX_LAT, lat));
  const r = lat * Math.PI / 180;
  return (0.5 - Math.log(Math.tan(Math.PI / 4 + r / 2)) / (2 * Math.PI)) * world(zoom);
}
export const lonOf = (x, zoom) => x / world(zoom) * 360 - 180;
export const latOf = (y, zoom) => Math.atan(Math.sinh(Math.PI * (1 - 2 * y / world(zoom)))) * 180 / Math.PI;
