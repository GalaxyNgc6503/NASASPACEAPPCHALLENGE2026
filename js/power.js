// NASA POWER client for the browser (port of earthwatch/power.py).
//
// * monthly point: all parameters for one place, 1981-2025, in one small request.
// * monthly regional: one parameter on the whole map grid (99 squares for the default box).
// * daily point: only for rainfall, to count heavy-rain days and the wettest day.
//
// Every request asks for the full record once and years are sliced locally. At most 4 requests
// run at once and 48 may wait; more are refused politely. Timeouts, 429 and 5xx are retried
// with growing waits; a rejected request (422) is not retried. The parse functions are pure.
import { CFG } from "./config.js";

export const BASE = "https://power.larc.nasa.gov/api/temporal";
const FILL = -999.0;
const MAX_ACTIVE = 4, MAX_WAITING = 48, RETRIES = 2, TIMEOUT_MS = 90000;

export class PowerError extends Error {
  /** kind: "timeout", "network", "rate_limit", "server", "invalid", "bad_response", "busy" */
  constructor(kind, detail = "", status = null) {
    super(detail ? `${kind}: ${detail}` : kind);
    this.kind = kind; this.detail = detail; this.status = status;
  }
}

// --- pure parsing --------------------------------------------------------------------------

const isMissing = (v, fill = FILL) => typeof v !== "number" || !Number.isFinite(v) || Math.abs(v - fill) < 1e-6;
const fillValue = (payload) => {
  const f = Number(payload && payload.header && payload.header.fill_value);
  return Number.isFinite(f) ? f : FILL;
};

export function monthlyList(raw, y0, y1, fill) {
  const out = [];
  for (let year = y0; year <= y1; year++) {
    for (let month = 1; month <= 12; month++) {
      const v = raw[`${year}${String(month).padStart(2, "0")}`];
      out.push(isMissing(v, fill) ? null : Number(v));
    }
  }
  return out;
}

function meta(payload) {
  const out = {};
  Object.entries(payload.parameters || {}).forEach(([k, v]) => {
    if (v && typeof v === "object") out[k] = { units: String(v.units ?? ""), longname: String(v.longname ?? k) };
  });
  return out;
}

function parameterBlock(payload) {
  const block = payload && payload.properties && payload.properties.parameter;
  if (!block || typeof block !== "object") throw new PowerError("bad_response", "no parameter data in the response");
  return block;
}

export function parseMonthlyPoint(payload, codes, y0, y1) {
  const block = parameterBlock(payload), fill = fillValue(payload), m = meta(payload);
  const values = {}, metaOut = {};
  codes.forEach((c) => { if (block[c]) { values[c] = monthlyList(block[c], y0, y1, fill); if (m[c]) metaOut[c] = m[c]; } });
  return { startYear: y0, endYear: y1, values, meta: metaOut,
    units: (c) => (metaOut[c] ? metaOut[c].units : "") };
}

export function parseDailyPoint(payload, code, y0, y1) {
  const block = parameterBlock(payload);
  if (!block[code]) throw new PowerError("bad_response", `${code} missing from the response`);
  const fill = fillValue(payload);
  const first = Date.UTC(y0, 0, 1) / 86400000;
  const n = Date.UTC(y1, 11, 31) / 86400000 - first + 1;
  const out = new Array(n).fill(null);
  Object.entries(block[code]).forEach(([key, v]) => {
    if (key.length !== 8 || isMissing(v, fill)) return;
    const i = Date.UTC(+key.slice(0, 4), +key.slice(4, 6) - 1, +key.slice(6)) / 86400000 - first;
    if (i >= 0 && i < n) out[i] = Number(v);
  });
  return { startYear: y0, endYear: y1, values: out, units: (meta(payload)[code] || {}).units || "" };
}

function step(values, fallback) {
  const gaps = [];
  for (let i = 1; i < values.length; i++) { const g = values[i] - values[i - 1]; if (g > 1e-9) gaps.push(g); }
  return gaps.length ? Math.min(...gaps) : fallback;
}

export function parseGrid(payload, code, community, y0, y1) {
  if (!payload || !Array.isArray(payload.features) || !payload.features.length) {
    throw new PowerError("bad_response", "no grid squares in the response");
  }
  const fill = fillValue(payload), cells = [];
  payload.features.forEach((f) => {
    try {
      const [lon, lat, elev] = f.geometry.coordinates;
      cells.push({ lat: Number(lat), lon: Number(lon), elev: elev ?? null,
        values: monthlyList(f.properties.parameter[code], y0, y1, fill) });
    } catch (e) { /* a square without this parameter is skipped */ }
  });
  if (!cells.length) throw new PowerError("bad_response", `${code} missing from the grid response`);
  const m = meta(payload)[code] || {};
  const r4 = (x) => Math.round(x * 1e4) / 1e4;
  const lats = [...new Set(cells.map((c) => r4(c.lat)))].sort((a, b) => a - b);
  const lons = [...new Set(cells.map((c) => r4(c.lon)))].sort((a, b) => a - b);
  const grid = { code, community, units: m.units || "", longname: m.longname || code, startYear: y0, endYear: y1,
    cells, lats, lons, dlat: step(lats, 0.5), dlon: step(lons, 0.625) };
  /** The square that contains the point, or null when it is outside the grid. */
  grid.cellAt = (lat, lon) => {
    let best = null, bestD = 0;
    cells.forEach((c) => {
      const dy = Math.abs(lat - c.lat) / grid.dlat, dx = Math.abs(lon - c.lon) / grid.dlon;
      if (dy <= 0.5 + 1e-9 && dx <= 0.5 + 1e-9) { const d = dy + dx; if (best === null || d < bestD) { best = c; bestD = d; } }
    });
    return best;
  };
  return grid;
}

/** An error response turned into a PowerError that carries NASA's own words in ``detail``. */
export function parseError(status, body) {
  let detail = "";
  try {
    const doc = JSON.parse(body);
    if (doc && typeof doc === "object") {
      if (Array.isArray(doc.messages) && doc.messages.length) detail = doc.messages.join(" ");
      else if (Array.isArray(doc.detail)) detail = doc.detail.map((d) => d.msg || JSON.stringify(d)).join("; ");
      else if (doc.header) detail = String(doc.header);
    }
  } catch (e) { detail = String(body).slice(0, 200); }
  if (status === 429) return new PowerError("rate_limit", detail, status);
  if (status >= 500) return new PowerError("server", detail, status);
  return new PowerError("invalid", detail, status);
}

// --- requests ------------------------------------------------------------------------------

let active = 0;
const waiting = [];
function pump() {
  while (active < MAX_ACTIVE && waiting.length) {
    const job = waiting.shift();
    active++;
    job.run().then(job.resolve, job.reject).finally(() => { active--; pump(); });
  }
}
function schedule(run) {
  return new Promise((resolve, reject) => {
    if (waiting.length >= MAX_WAITING) { reject(new PowerError("busy")); return; }
    waiting.push({ run, resolve, reject });
    pump();
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchOnce(url) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctl.signal });
    const body = await res.text();
    if (res.ok) {
      try { const doc = JSON.parse(body); if (doc && typeof doc === "object") return doc; } catch (e) { /* below */ }
      throw new PowerError("bad_response", "the answer was not JSON");
    }
    throw parseError(res.status, body);
  } catch (e) {
    if (e instanceof PowerError) throw e;
    if (e && e.name === "AbortError") throw new PowerError("timeout", "no answer in time");
    throw new PowerError("network", String(e && e.message || e));
  } finally { clearTimeout(timer); }
}

export async function getJson(path, params) {
  const url = `${BASE}/${path}?${new URLSearchParams(params)}`;
  return schedule(async () => {
    let last;
    for (let attempt = 0; attempt <= RETRIES; attempt++) {
      try { return await fetchOnce(url); } catch (e) {
        if (!(e instanceof PowerError) || e.kind === "invalid" || e.kind === "bad_response") throw e;
        last = e;
        if (attempt < RETRIES) await sleep(1500 * (attempt + 1) ** 2);
      }
    }
    throw last;
  });
}

const Y0 = CFG.yearMin, Y1 = CFG.yearMax;

export async function monthlyPoint(lat, lon, codes, community) {
  const payload = await getJson("monthly/point", {
    parameters: codes.join(","), community, latitude: lat, longitude: lon, start: Y0, end: Y1, format: "JSON" });
  return parseMonthlyPoint(payload, codes, Y0, Y1);
}

export async function dailyPoint(lat, lon, code, community) {
  const payload = await getJson("daily/point", {
    parameters: code, community, latitude: lat, longitude: lon, start: `${Y0}0101`, end: `${Y1}1231`, format: "JSON" });
  return parseDailyPoint(payload, code, Y0, Y1);
}

export async function regionalGrid(bounds, code, community) {
  const payload = await getJson("monthly/regional", {
    parameters: code, community, "latitude-min": bounds.latMin, "latitude-max": bounds.latMax,
    "longitude-min": bounds.lonMin, "longitude-max": bounds.lonMax, start: Y0, end: Y1, format: "JSON" });
  return parseGrid(payload, code, community, Y0, Y1);
}
