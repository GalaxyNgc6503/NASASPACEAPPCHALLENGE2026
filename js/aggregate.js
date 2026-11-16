// Monthly or daily values to one value per year (port of earthwatch/aggregate.py).
// Rainfall (a rate in mm/day) is summed over the year, other parameters are averaged,
// and a year with more than 10% of its days missing is dropped.
import { percentile } from "./stats.js";

const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
export const RAINY_DAY_MM = 1.0;
export const HEAVY_PERCENTILE = 95.0;

export const isLeap = (y) => y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
export const daysInMonth = (y, m) => (m === 2 && isLeap(y) ? 29 : MONTH_DAYS[m - 1]);
export const daysInYear = (y) => (isLeap(y) ? 366 : 365);
// yearly values are rounded so that equal values count as ties in the Mann-Kendall test
const clean = (x) => Math.round(x * 1e9) / 1e9;

/** {year: value} for y0..y1 from 12 monthly values per year starting at startYear. */
export function monthlyToYearly(values, startYear, y0, y1, agg, maxMissing = 0.10) {
  const out = {};
  for (let year = y0; year <= y1; year++) {
    const k = (year - startYear) * 12;
    if (k < 0 || k + 12 > values.length) continue;
    const totalDays = daysInYear(year);
    let have = 0, acc = 0;
    for (let m = 0; m < 12; m++) {
      const v = values[k + m];
      if (v === null || v === undefined) continue;
      const d = daysInMonth(year, m + 1);
      have += d;
      acc += v * d;
    }
    if (have === 0 || (totalDays - have) / totalDays > maxMissing + 1e-12) continue;
    const mean = acc / have;
    out[year] = clean(agg === "sum" ? mean * totalDays : mean);
  }
  return out;
}

/** For each calendar month: [mean, lowest, highest, years] over y0..y1, or null. */
export function monthlyProfile(values, startYear, y0, y1, agg) {
  const out = [];
  for (let m = 0; m < 12; m++) {
    const vals = [];
    for (let year = y0; year <= y1; year++) {
      const k = (year - startYear) * 12 + m;
      if (k < 0 || k >= values.length || values[k] === null || values[k] === undefined) continue;
      vals.push(agg === "sum" ? values[k] * daysInMonth(year, m + 1) : values[k]);
    }
    out.push(vals.length
      ? [vals.reduce((a, b) => a + b, 0) / vals.length, Math.min(...vals), Math.max(...vals), vals.length]
      : null);
  }
  return out;
}

/** Daily values for the whole years y0..y1 out of a list that starts on 1 January of startYear. */
export function dailySlice(values, startYear, y0, y1) {
  let offset = 0, length = 0;
  for (let y = startYear; y < y0; y++) offset += daysInYear(y);
  for (let y = y0; y <= y1; y++) length += daysInYear(y);
  return values.slice(offset, offset + length);
}

/** Fixed heavy-rain threshold: the 95th percentile of rainy days (1 mm or more). */
export function heavyThreshold(daily) {
  const rainy = daily.filter((v) => v !== null && v !== undefined && v >= RAINY_DAY_MM);
  return rainy.length ? percentile(rainy, HEAVY_PERCENTILE) : null;
}

/** {year: value} from daily values that start on 1 January of y0. */
export function dailyToYearly(daily, y0, y1, agg, threshold = null, maxMissing = 0.10) {
  const out = {};
  let i = 0;
  for (let year = y0; year <= y1; year++) {
    const n = daysInYear(year);
    const chunk = daily.slice(i, i + n);
    i += n;
    if (chunk.length < n) continue;
    const valid = chunk.filter((v) => v !== null && v !== undefined);
    if (!valid.length || (n - valid.length) / n > maxMissing + 1e-12) continue;
    let val;
    if (agg === "mean") val = valid.reduce((a, b) => a + b, 0) / valid.length;
    else if (agg === "sum") val = valid.reduce((a, b) => a + b, 0) / valid.length * n;
    else if (agg === "wettest_day") val = Math.max(...valid);
    else if (agg === "days_at_least" || agg === "heavy_days") {
      val = threshold === null ? 0 : valid.filter((v) => v >= threshold).length;
    } else throw new Error(`unknown aggregation: ${agg}`);
    out[year] = clean(val);
  }
  return out;
}
