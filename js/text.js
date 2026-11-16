// Sentence builders (port of the functions in earthwatch/text.py). Strings live in strings.js.
import * as fmt from "./fmt.js";
import { EN, PARAM_SOURCES, PARAM_SOURCE_UNKNOWN } from "./strings.js";

export { ABOUT, MONTHS_SHORT, MONTHS_LONG, INTERVAL_NAMES } from "./strings.js";

/** A string with its {fields} filled in. */
export function t(key, fields) {
  const s = EN[key];
  if (s === undefined) throw new Error(`missing string: ${key}`);
  return fields ? s.replace(/\{(\w+)\}/g, (m, k) => (k in fields ? fields[k] : m)) : s;
}

export const cap = (s) => s.slice(0, 1).toUpperCase() + s.slice(1);
export const paramSource = (kind) => PARAM_SOURCES[kind] || PARAM_SOURCE_UNKNOWN;
export const kindLabel = (kind) => cap(kind.replace(/_/g, " ").toLowerCase());

/** Text placed after a per-decade size: " °C", " mm", " days" or "" (no unit). */
export function decadeUnitText(yearlyUnit) {
  const u = fmt.prettyUnit(fmt.decadeUnit(yearlyUnit));
  return u ? fmt.NBSP + u : "";
}

/** Slope and interval of a trend, formatted the same way everywhere. */
export function trendNumbers(tr, yearlyUnit, decimals = null) {
  const d = decimals !== null ? decimals : fmt.decimalsFor(tr.perDecade);
  const u = decadeUnitText(yearlyUnit);
  const n = (x, signed) => fmt.num(x, d, { signed });
  return {
    size: n(tr.perDecade, true) + u, sizeAbs: n(Math.abs(tr.perDecade), false) + u,
    lo: n(tr.loDecade, true), hi: n(tr.hiDecade, true),
    loAbs: n(Math.abs(tr.loDecade), false), hiAbs: n(Math.abs(tr.hiDecade), false),
    interval: `${n(tr.loDecade, true)} to ${n(tr.hiDecade, true)}${u}`, unit: u, decimals: d,
  };
}

export function badgeKey(tr, hasData = true) {
  if (!hasData) return "badge_nodata";
  if (!tr) return "badge_short";
  return { rising: "badge_rising", falling: "badge_falling" }[tr.direction] || "badge_none";
}

/** The one-sentence answer, always paired with its uncertainty. */
export function resultSentence(around, subject, tr, yearlyUnit, y0, y1, nYears, minYears = 10, decimals = null) {
  if (nYears === 0) {
    return `${around}, NASA POWER has no usable yearly values of ${subject} for ${y0}\u2013${y1}, so no trend is reported.`;
  }
  if (!tr) {
    return `${around}, there are only ${nYears} yearly values of ${subject} for ${y0}\u2013${y1}. `
      + `At least ${minYears} are needed to test for a trend, so no trend is reported.`;
  }
  const nums = trendNumbers(tr, yearlyUnit, decimals);
  const span = `${y0} to ${y1}`;
  const sameSign = (tr.lo >= 0 && tr.hi >= 0) || (tr.lo <= 0 && tr.hi <= 0);
  if (tr.significant) {
    const verb = tr.s > 0 ? "increased" : "decreased";
    let rng;
    if (sameSign) {
      rng = tr.s > 0 ? `${nums.loAbs} and ${nums.hiAbs}${nums.unit}` : `${nums.hiAbs} and ${nums.loAbs}${nums.unit}`;
    } else rng = `${nums.lo} and ${nums.hi}${nums.unit}`;
    return `${around}, ${subject} has ${verb} by about ${nums.sizeAbs} per decade from ${span} `
      + `(likely between ${rng}). This change is statistically significant.`;
  }
  const est = tr.slope > 0 ? `a rise of about ${nums.sizeAbs}` : tr.slope < 0 ? `a fall of about ${nums.sizeAbs}` : "no change";
  return `${around}, ${subject} shows no significant trend from ${span}. The best estimate is ${est} per decade `
    + `(likely between ${nums.lo} and ${nums.hi}${nums.unit}), which is within what chance variation could produce.`;
}

/** Screen-reader label for one map square. */
export function cellLabel(place, subject, mode, year, valueText, trendText) {
  if (valueText === null && trendText === null) return `${place}. No data for ${subject}.`;
  const parts = [place + "."];
  if (mode === "value") {
    parts.push(`${cap(subject)} in ${year}: ${valueText || "no value"}.`);
    parts.push(trendText || "No trend result.");
  } else {
    parts.push(trendText || "No trend result.");
    if (valueText) parts.push(`Value in ${year}: ${valueText}.`);
  }
  return parts.join(" ");
}

export function trendPhrase(tr, yearlyUnit, y0, y1, decimals = null) {
  if (!tr) return "Too few years to test for a trend.";
  const nums = trendNumbers(tr, yearlyUnit, decimals);
  const word = { rising: "significantly rising", falling: "significantly falling" }[tr.direction] || "no significant trend";
  return `Trend ${y0}\u2013${y1}: ${nums.size} per decade, ${word}.`;
}

export function errorMessage(kind, detail = "") {
  const key = `err_${kind}`;
  if (!(key in EN)) return t("err_generic");
  return EN[key].includes("{detail}") ? t(key, { detail }) : t(key);
}
