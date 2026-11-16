// Everything specific to a region, a variable or a default lives here (port of earthwatch/config.py).
// To reuse the site for another region, change ``bounds`` and ``towns``. To add a variable, add
// one entry to VARIABLES; the map, the ranking and the charts pick it up.

export const CFG = {
  title: "EarthWatch",
  tagline: "What is really changing, where, and how sure are we?",
  region: "Sarawak, Malaysia",
  // Box that gives the 9 x 11 = 99 MERRA-2 squares covering Sarawak and nearby sea.
  bounds: { latMin: 0.75, latMax: 5.25, lonMin: 109.06, lonMax: 115.94 },
  towns: [
    { id: "sibu", name: "Sibu", lat: 2.29, lon: 111.83 },
    { id: "kapit", name: "Kapit", lat: 2.02, lon: 112.93 },
    { id: "bintulu", name: "Bintulu", lat: 3.17, lon: 113.03 },
    { id: "kuching", name: "Kuching", lat: 1.55, lon: 110.36 },
  ],
  groupOrder: ["Rain", "Temperature", "Moisture", "Wind and sunlight"],
  addedGroup: "Added by you",
  yearMin: 1981, yearMax: 2025, defaultStart: 2001, defaultEnd: 2025,
  communities: ["AG", "RE", "SB"], defaultCommunity: "AG",
  defaultVariable: "t2m", defaultPlace: "sibu", defaultMode: "trend",
  minYears: 10, maxMissing: 0.10, alpha: 0.05, maxExtras: 10,
  edgeMargin: 0.5, gridDlat: 0.5, gridDlon: 0.625,
};

const V = (id, label, group, code, unit, subject, extra = {}) =>
  ({ id, label, group, code, unit, subject, agg: "mean", daily: false, decimals: null,
    threshold: null, builtin: true, ...extra });

export const VARIABLES = [
  V("rain_total", "Annual rainfall", "Rain", "PRECTOTCORR", "mm/yr", "annual rainfall", { agg: "sum", decimals: 0 }),
  V("rain_heavy", "Heavy-rain days per year", "Rain", "PRECTOTCORR", "days/yr",
    "the number of heavy-rain days per year", { agg: "heavy_days", daily: true }),
  V("rain_wettest", "Wettest day of the year", "Rain", "PRECTOTCORR", "mm/day",
    "rainfall on the wettest day of the year", { agg: "wettest_day", daily: true }),
  V("rain_50", "Days with 50 mm or more", "Rain", "PRECTOTCORR", "days/yr",
    "the number of days with 50 mm or more of rain", { agg: "days_at_least", daily: true, threshold: 50 }),
  V("t2m", "Air temperature at 2 m", "Temperature", "T2M", "C", "air temperature at 2 m", { decimals: 1 }),
  V("t2m_max", "Daily maximum temperature at 2 m", "Temperature", "T2M_MAX", "C",
    "the daily maximum air temperature at 2 m", { decimals: 1 }),
  V("gwettop", "Surface soil wetness (0\u20131)", "Moisture", "GWETTOP", "1", "surface soil wetness", { decimals: 2 }),
  V("gwetroot", "Root-zone soil wetness (0\u20131)", "Moisture", "GWETROOT", "1", "root-zone soil wetness", { decimals: 2 }),
  V("rh2m", "Relative humidity at 2 m", "Moisture", "RH2M", "%", "relative humidity at 2 m", { decimals: 1 }),
  V("ws2m", "Wind speed at 2 m", "Wind and sunlight", "WS2M", "m/s", "wind speed at 2 m", { decimals: 2 }),
  V("allsky", "Sunlight reaching the ground", "Wind and sunlight", "ALLSKY_SFC_SW_DWN", "MJ/m^2/day",
    "sunlight reaching the ground", { decimals: 1 }),
];

export const codesUsedByBuiltins = () => [...new Set(VARIABLES.map((v) => v.code))].sort();
export const monthlyCodes = () => [...new Set(VARIABLES.filter((v) => !v.daily).map((v) => v.code))];
export const townById = (id) => CFG.towns.find((t) => t.id === id) || null;
export const builtinById = (id) => VARIABLES.find((v) => v.id === id) || null;

const round2 = (x) => Math.round(x * 100) / 100;

/**
 * The configured region when the point is in it (with a small margin), else a box of the same
 * size (9 x 11 MERRA-2 squares) centred on the squares around the point. ``centred`` always
 * builds the centred box (used when the visitor has moved the map).
 */
export function areaFor(lat, lon, centred = false) {
  const b = CFG.bounds, m = CFG.edgeMargin;
  if (!centred && b.latMin - m <= lat && lat <= b.latMax + m && b.lonMin - m <= lon && lon <= b.lonMax + m) {
    return { bounds: b, towns: CFG.towns, custom: false };
  }
  const halfLat = (b.latMax - b.latMin) / 2, halfLon = (b.lonMax - b.lonMin) / 2;
  let clat = Math.round(lat / CFG.gridDlat) * CFG.gridDlat;
  let clon = Math.round(lon / CFG.gridDlon) * CFG.gridDlon;
  clat = Math.min(Math.max(clat, -90 + halfLat), 90 - halfLat);
  clon = Math.min(Math.max(clon, -180 + halfLon), 180 - halfLon);
  const box = { latMin: round2(clat - halfLat), latMax: round2(clat + halfLat),
    lonMin: round2(clon - halfLon), lonMax: round2(clon + halfLon) };
  const inside = CFG.towns.filter((t) => box.latMin <= t.lat && t.lat <= box.latMax
    && box.lonMin <= t.lon && t.lon <= box.lonMax);
  return { bounds: box, towns: inside, custom: true };
}

/** A variable made from an entry of NASA's parameter list (a rate in mm/day is summed to a year). */
export function extraVariable(row) {
  const rate = row.units === "mm/day";
  return { id: row.code, label: `${row.name} (${row.code})`, group: CFG.addedGroup, code: row.code,
    unit: rate ? "mm/yr" : row.units, subject: row.name.toLowerCase(), agg: rate ? "sum" : "mean",
    daily: false, decimals: null, threshold: null, builtin: false };
}
