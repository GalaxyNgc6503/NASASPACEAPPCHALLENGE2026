// Fetching, analysis, ranking and loading states (port of earthwatch/service.py).
// A request that is not finished shows as "loading" and the page redraws when it arrives.
import * as ag from "./aggregate.js";
import { CFG, VARIABLES, areaFor, builtinById, codesUsedByBuiltins } from "./config.js";
import { dailyPoint, monthlyPoint, PowerError, regionalGrid } from "./power.js";
import { summarize, trend } from "./stats.js";
import { errorMessage, t } from "./text.js";

const FAIL_MEMORY = 20000;   // ms: a failed request is not repeated sooner than this
const MAX_JOBS = 160;
const jobs = new Map();
let onChange = () => {};
export const setOnChange = (fn) => { onChange = fn; };

/** Run ``fn`` once per key. Returns {status: loading | ready | error, value, error}. */
function job(key, fn) {
  const old = jobs.get(key);
  if (old && !(old.status === "error" && Date.now() - old.failedAt > FAIL_MEMORY)) return old;
  const j = { status: "loading", value: null, error: "", failedAt: 0 };
  jobs.set(key, j);
  if (jobs.size > MAX_JOBS) {
    for (const [k, v] of jobs) { if (v.status === "ready") { jobs.delete(k); if (jobs.size <= MAX_JOBS) break; } }
  }
  j.promise = fn().then((v) => { j.status = "ready"; j.value = v; }, (e) => {
    j.status = "error";
    j.error = e instanceof PowerError ? errorMessage(e.kind, e.detail) : t("err_generic");
    j.failedAt = Date.now();
    console.warn("request failed", key, e);
  }).then(() => onChange());
  return j;
}

/** Forget failures so the next draw asks NASA again ("Try again"). */
export function retryFailed() {
  for (const j of jobs.values()) if (j.status === "error") j.failedAt = 0;
}

const READY_EMPTY = { status: "ready", value: null, error: "" };

// --- results -------------------------------------------------------------------------------

export function resolveUnit(v, apiUnits) {
  if (v.agg === "heavy_days" || v.agg === "days_at_least") return "days/yr";
  if (v.agg === "sum") return !apiUnits || apiUnits === "mm/day" ? "mm/yr" : apiUnits;
  return apiUnits || v.unit;
}

export function makeSeries(v, yearly, unit, y0, y1, threshold = null) {
  const years = Object.keys(yearly).map(Number).sort((a, b) => a - b);
  const values = years.map((y) => yearly[y]);
  const s = { var: { ...v, unit }, years, values, trend: trend(years, values, CFG.minYears, CFG.alpha),
    summary: summarize(years, values), y0, y1, threshold, n: years.length };
  s.status = !years.length ? "nodata" : !s.trend ? "short" : s.trend.direction;
  return s;
}

export function seriesFrom(v, data, y0, y1) {
  if (v.daily) {
    const window = ag.dailySlice(data.values, data.startYear, y0, y1);
    let thr = null;
    if (v.agg === "heavy_days") thr = ag.heavyThreshold(window);
    else if (v.agg === "days_at_least") thr = v.threshold;
    const yearly = ag.dailyToYearly(window, y0, y1, v.agg, thr, CFG.maxMissing);
    return makeSeries(v, yearly, resolveUnit(v, data.units), y0, y1, thr);
  }
  const values = data.values[v.code];
  if (!values) throw new Error("code missing");
  const yearly = ag.monthlyToYearly(values, data.startYear, y0, y1, v.agg, CFG.maxMissing);
  return makeSeries(v, yearly, resolveUnit(v, data.units(v.code)), y0, y1);
}

/** Everything known about one place: monthly values, extra parameters and daily rain. */
export class PlaceData {
  constructor(place, builtin, extras, rain, scheduledRain) {
    Object.assign(this, { place, builtin, extras, rain, scheduledRain });
  }

  /** [status, series, error] for one variable; status is ready, loading or error. */
  series(v, y0, y1) {
    const sec = v.daily ? this.rain : v.builtin ? this.builtin
      : this.extras[v.code] || { status: "error", error: t("err_generic") };
    if (sec.status !== "ready") return [sec.status, null, sec.error];
    if (!sec.value) return ["error", null, t("err_generic")];
    try { return ["ready", seriesFrom(v, sec.value, y0, y1), ""]; } catch (e) { return ["error", null, t("err_generic")]; }
  }
}

export function analyseGrid(v, grid, y0, y1) {
  const unit = resolveUnit(v, grid.units);
  const cells = new Map();
  const counts = { rising: 0, falling: 0, none: 0, short: 0, nodata: 0 };
  let vmin = null, vmax = null, tmax = 0;
  const r4 = (x) => Math.round(x * 1e4) / 1e4;
  grid.cells.forEach((c) => {
    const yearly = ag.monthlyToYearly(c.values, grid.startYear, y0, y1, v.agg, CFG.maxMissing);
    const years = Object.keys(yearly).map(Number).sort((a, b) => a - b);
    const vals = years.map((y) => yearly[y]);
    const tr = trend(years, vals, CFG.minYears, CFG.alpha);
    const res = { lat: c.lat, lon: c.lon, elev: c.elev, values: yearly, trend: tr, hasValues: years.length > 0 };
    res.status = !res.hasValues ? "nodata" : !tr ? "short" : tr.direction;
    cells.set(`${r4(c.lat)}|${r4(c.lon)}`, res);
    counts[res.status]++;
    if (vals.length) {
      const lo = Math.min(...vals), hi = Math.max(...vals);
      vmin = vmin === null ? lo : Math.min(vmin, lo);
      vmax = vmax === null ? hi : Math.max(vmax, hi);
    }
    if (tr) tmax = Math.max(tmax, Math.abs(tr.perDecade));
  });
  return { var: { ...v, unit }, grid, y0, y1, cells, valueMin: vmin ?? 0, valueMax: vmax ?? 1, trendMax: tmax, counts };
}

const analyses = new Map();
function analysisFor(v, grid, y0, y1) {
  const key = [grid.code, grid.community, v.agg, v.id, y0, y1, grid.lats[0], grid.lons[0]].join("|");
  if (!analyses.has(key)) {
    analyses.set(key, analyseGrid(v, grid, y0, y1));
    if (analyses.size > 24) analyses.delete(analyses.keys().next().value);
  }
  return analyses.get(key);
}

/** Significant trends first, then by how strong the evidence is (smaller p first). */
export function rankKey(series) {
  if (!series || !series.years.length) return [3, 1];
  if (!series.trend) return [2, 1];
  return [series.trend.significant ? 0 : 1, series.trend.p];
}

// --- scheduling ----------------------------------------------------------------------------

const rkey = (n) => Math.round(n * 1000) / 1000;

function gridJob(code, community, bounds) {
  const b = bounds;
  return job(["grid", community, code, b.latMin, b.latMax, b.lonMin, b.lonMax].join("|"),
    () => regionalGrid(b, code, community));
}

function placeJobs(place, community, extras, wantRain) {
  const key = [rkey(place.lat), rkey(place.lon), community].join("|");
  const builtin = job(`monthly|${key}|builtin`,
    () => monthlyPoint(place.lat, place.lon, codesUsedByBuiltins(), community));
  const ex = {};
  extras.forEach((v) => {
    ex[v.code] = job(`monthly|${key}|${v.code}`, () => monthlyPoint(place.lat, place.lon, [v.code], community));
  });
  const rain = wantRain ? job(`daily|${key}|PRECTOTCORR`, () => dailyPoint(place.lat, place.lon, "PRECTOTCORR", community)) : null;
  return [builtin, ex, rain];
}

/** Everything one page view needs, with sections that may still be loading. */
export function build(state, place, extras) {
  const variables = [...VARIABLES, ...extras];
  const v = variables.find((x) => x.id === state.var) || builtinById(CFG.defaultVariable);
  const centre = state.view ? state.view.split(",").map(Number) : null;
  const area = centre ? areaFor(centre[0], centre[1], true) : areaFor(place.lat, place.lon);
  const gridJ = v.daily ? null : gridJob(v.code, state.community, area.bounds);
  const [b, e, r] = placeJobs(place, state.community, extras, true);
  const mk = (p, bb, ee, rr) => new PlaceData(p, bb, ee, rr || READY_EMPTY, !!rr);
  const here = mk(place, b, e, r);
  const towns = {};
  area.towns.forEach((tw) => {
    const tp = { id: tw.id, name: tw.name, lat: tw.lat, lon: tw.lon, kind: "town" };
    if (tp.id === place.id) towns[tw.id] = here;
    else { const [tb, te, tr] = placeJobs(tp, state.community, extras, v.daily); towns[tw.id] = mk(tp, tb, te, tr); }
  });
  let grid = null;
  if (gridJ) {
    grid = gridJ.status === "ready"
      ? { status: "ready", error: "", value: analysisFor(v, gridJ.value, state.y0, state.y1) }
      : { status: gridJ.status, error: gridJ.error, value: null };
  }
  const secs = [here.builtin, here.rain, ...Object.values(here.extras), grid];
  Object.values(towns).forEach((tw) => { secs.push(tw.builtin); if (tw.scheduledRain) secs.push(tw.rain); });
  const loading = secs.some((s) => s && s.status === "loading");
  return { variables, var: v, place, grid, here, towns, area, loading };
}

/** Only the map data for one variable (used by the year slider). */
export function gridAnalysis(v, y0, y1, community, bounds) {
  if (v.daily) return { status: "error", error: t("map_no_map"), value: null };
  const j = gridJob(v.code, community, bounds);
  return j.status === "ready" ? { status: "ready", error: "", value: analysisFor(v, j.value, y0, y1) }
    : { status: j.status, error: j.error, value: null };
}

/** Every variable at the selected place: [variable, status, series, error], ordered. */
export function rank(bundle, y0, y1) {
  const order = { ready: 0, loading: 1, error: 2 };
  const rows = bundle.variables.map((v) => { const [st, s, err] = bundle.here.series(v, y0, y1); return [v, st, s, err]; });
  rows.sort((a, b) => {
    const oa = order[a[1]] ?? 3, ob = order[b[1]] ?? 3;
    if (oa !== ob) return oa - ob;
    const ka = rankKey(a[2]), kb = rankKey(b[2]);
    return ka[0] - kb[0] || ka[1] - kb[1];
  });
  return rows;
}

/** [status, {subject, unit, months, y0, y1}, error]: the average year. Daily-data variables show monthly rain. */
export function monthlyFor(placeData, v, y0, y1) {
  const sec = v.builtin ? placeData.builtin : placeData.extras[v.code] || { status: "error", error: t("err_generic") };
  if (sec.status !== "ready") return [sec.status, null, sec.error];
  const data = sec.value;
  if (!data || !data.values[v.code]) return ["error", null, t("err_generic")];
  const total = v.daily || v.agg === "sum";
  const apiUnit = data.units(v.code);
  const unit = total ? (!apiUnit || apiUnit === "mm/day" ? "mm/month" : apiUnit) : (apiUnit || v.unit);
  const months = ag.monthlyProfile(data.values[v.code], data.startYear, y0, y1, total ? "sum" : "mean");
  return ["ready", { subject: v.daily ? "rainfall" : v.subject, unit, months, y0, y1 }, ""];
}
