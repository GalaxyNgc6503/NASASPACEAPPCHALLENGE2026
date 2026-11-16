// Number, unit and coordinate formatting with typographic punctuation (port of earthwatch/fmt.py).

export const MINUS = "\u2212";
export const NBSP = "\u00a0";
export const EN_DASH = "\u2013";

function groupThousands(intPart) {
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** A number with a real minus sign. A value that rounds to zero has no sign. */
export function num(x, decimals, { signed = false, group = true } = {}) {
  if (x === null || x === undefined || !Number.isFinite(x)) return EN_DASH;
  let body = Math.abs(x).toFixed(decimals);
  if (group) {
    const [i, f] = body.split(".");
    body = groupThousands(i) + (f !== undefined ? "." + f : "");
  }
  if (Number(body.replace(/,/g, "")) === 0) return body;
  if (x < 0) return MINUS + body;
  return (signed ? "+" : "") + body;
}

/** Decimals that show ``sig`` significant figures of x. */
export function decimalsFor(x, sig = 2, maxDecimals = 4) {
  const ax = Math.abs(x);
  if (ax === 0 || !Number.isFinite(ax)) return 1;
  return Math.max(0, Math.min(maxDecimals, sig - 1 - Math.floor(Math.log10(ax))));
}

export function decimalsForRange(lo, hi) {
  return decimalsFor(Math.max(Math.abs(lo), Math.abs(hi)), 3, 3);
}

/** NASA POWER unit strings made readable ("C" becomes "°C"). */
export function prettyUnit(unit) {
  const u = (unit || "").trim();
  const fixed = { C: "\u00b0C", "1": "", "kW-hr/m^2/day": "kWh/m\u00b2/day" };
  if (Object.prototype.hasOwnProperty.call(fixed, u)) return fixed[u];
  return u.replace(/\^2/g, "\u00b2").replace(/\^3/g, "\u00b3").replace(/-hr/g, "h");
}

/** Unit to print before "per decade" for a yearly value in ``yearlyUnit``. */
export function decadeUnit(yearlyUnit) {
  if (yearlyUnit === "%") return "percentage points";
  if (yearlyUnit.endsWith("/yr")) return yearlyUnit.slice(0, -3);
  return yearlyUnit;
}

function coord(x) {
  return Math.abs(x).toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}
export const fmtLat = (lat) => `${coord(lat)}\u00b0${lat >= 0 ? "N" : "S"}`;
export const fmtLon = (lon) => `${coord(lon)}\u00b0${lon >= 0 ? "E" : "W"}`;
