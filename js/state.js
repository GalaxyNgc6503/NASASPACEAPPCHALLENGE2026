// The page state, kept entirely in the URL (port of earthwatch/state.py).
// Nothing is stored about visitors. The variable, place, years and added parameters all travel in
// the link, so any view can be shared. Anything invalid falls back to a default; nothing throws.
import { CFG, townById } from "./config.js";
import { fmtLat, fmtLon } from "./fmt.js";
import { t } from "./text.js";

export const MODES = ["trend", "value"];
const CODE_RE = /^[A-Z][A-Z0-9_]{1,39}$/;
export { CODE_RE };

export function defaults() {
  return { var: CFG.defaultVariable, mode: CFG.defaultMode, year: CFG.defaultEnd, place: CFG.defaultPlace,
    y0: CFG.defaultStart, y1: CFG.defaultEnd, community: CFG.defaultCommunity, extras: [], shade: false, view: "" };
}

const toInt = (raw, fallback) => { const v = parseInt(String(raw ?? "").trim(), 10); return Number.isFinite(v) ? v : fallback; };
const toFloat = (raw) => {
  const s = String(raw ?? "").trim();
  if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(s)) return null;
  const v = Number(s);
  return Number.isFinite(v) ? v : null;
};

export function townPlace(tw) { return { id: tw.id, name: tw.name, lat: tw.lat, lon: tw.lon, kind: "town" }; }

export function placeFromCoords(lat, lon) {
  lat = Math.round(lat * 1000) / 1000; lon = Math.round(lon * 1000) / 1000;
  return { id: `${lat},${lon}`, name: `${fmtLat(lat)}, ${fmtLon(lon)}`, lat, lon, kind: "point" };
}

/** A town id or a "lat,lon" anywhere on Earth becomes a place; anything else is null. */
export function parsePlace(raw) {
  raw = String(raw || "").trim();
  const tw = townById(raw.toLowerCase());
  if (tw) return townPlace(tw);
  const parts = raw.split(",");
  if (parts.length !== 2) return null;
  const lat = toFloat(parts[0]), lon = toFloat(parts[1]);
  if (lat === null || lon === null || !(lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180)) return null;
  return placeFromCoords(lat, lon);
}

export function parseState(params) {
  const get = (k) => params.get(k);
  const base = defaults(), notices = [];
  const mode = MODES.includes(get("mode")) ? get("mode") : base.mode;
  let community = (get("community") || base.community).toUpperCase();
  if (!CFG.communities.includes(community)) community = base.community;
  const extras = [];
  (get("extras") || "").split(",").forEach((code) => {
    code = code.trim().toUpperCase();
    if (CODE_RE.test(code) && !extras.includes(code) && extras.length < CFG.maxExtras) extras.push(code);
  });
  let y0 = Math.min(Math.max(toInt(get("y0"), base.y0), CFG.yearMin), CFG.yearMax);
  let y1 = Math.min(Math.max(toInt(get("y1"), base.y1), CFG.yearMin), CFG.yearMax);
  if (y1 < y0) [y0, y1] = [y1, y0];
  if (y1 - y0 + 1 < CFG.minYears) {
    y0 = Math.max(CFG.yearMin, y1 - CFG.minYears + 1);
    if (y1 - y0 + 1 < CFG.minYears) y1 = y0 + CFG.minYears - 1;
    notices.push(t("notice_years", { n: CFG.minYears, y0 }));
  }
  const year = Math.min(Math.max(toInt(get("year"), y1), y0), y1);
  // a typed latitude and longitude win over the remembered place
  let placeRaw = get("place") || base.place;
  const lat = toFloat(get("lat")), lon = toFloat(get("lon"));
  const typed = lat !== null && lon !== null;
  if (typed) placeRaw = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  let place = parsePlace(placeRaw);
  if (!place) {
    place = parsePlace(base.place);
    notices.push(t("notice_place", { place: place.name }));
  }
  const shade = ["1", "on", "true"].includes((get("shade") || "").trim());
  let view = "";
  const vp = (get("view") || "").split(",");
  if (vp.length === 2 && !typed) {                     // a typed place resets the map
    const vlat = toFloat(vp[0]), vlon = toFloat(vp[1]);
    if (vlat !== null && vlon !== null && vlat >= -90 && vlat <= 90 && vlon >= -180 && vlon <= 180) view = `${vlat.toFixed(3)},${vlon.toFixed(3)}`;
  }
  return { state: { var: (get("var") || base.var).trim(), mode, year, place: place.id, y0, y1, community, extras, shade, view },
    place, notices };
}

/** Query string for a link: the state with ``changes`` applied, defaults left out. */
export function query(state, changes = {}) {
  const s = { ...state, ...changes }, d = defaults(), q = new URLSearchParams();
  if (s.var !== d.var) q.set("var", s.var);
  if (s.mode !== d.mode) q.set("mode", s.mode);
  if (s.place !== d.place) q.set("place", s.place);
  if (s.y0 !== d.y0) q.set("y0", String(s.y0));
  if (s.y1 !== d.y1) q.set("y1", String(s.y1));
  if (s.mode === "value" && s.year !== s.y1) q.set("year", String(s.year));
  if (s.community !== d.community) q.set("community", s.community);
  if (s.extras.length) q.set("extras", s.extras.join(","));
  if (s.shade) q.set("shade", "1");
  if (s.view) q.set("view", s.view);
  return q.toString().replace(/%2C/g, ",");
}

/** A link that keeps the state, changes a few fields and can point at a page and an anchor. */
export function href(state, changes = {}, { page = "", anchor = "" } = {}) {
  const q = query(state, changes);
  return (q ? `${page || "./"}?${q}` : page || "./") + (anchor ? `#${anchor}` : "");
}
