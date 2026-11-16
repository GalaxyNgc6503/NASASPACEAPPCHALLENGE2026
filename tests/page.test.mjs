// The whole page, built in Node against a fake NASA POWER: data in, finished HTML out.
import assert from "node:assert/strict";
import test from "node:test";

import { CFG } from "../js/config.js";
import { makeContext } from "../js/context.js";
import { parsePlace, parseState } from "../js/state.js";
import { renderApp } from "../js/view.js";

const YEARS = [1981, 2025];
const seasonal = (m, code) => (code === "PRECTOTCORR" ? 6 + 3 * Math.sin(m / 12 * 6.28) : 27 + Math.sin(m / 12 * 6.28));
function monthly(code, lat, lon, drift = 1) {
  const o = {};
  for (let y = YEARS[0]; y <= YEARS[1]; y++) {
    let sum = 0;
    for (let m = 1; m <= 12; m++) {
      const v = seasonal(m, code) + (y - 1981) * 0.02 * drift + ((y * 7 + m * 3 + Math.round(lat * 10)) % 5) * 0.05;
      o[`${y}${String(m).padStart(2, "0")}`] = Math.round(v * 100) / 100; sum += v;
    }
    o[`${y}13`] = sum / 12;
  }
  return o;
}
function payload(url) {
  const u = new URL(url), q = u.searchParams, codes = (q.get("parameters") || "").split(",");
  const parameters = Object.fromEntries(codes.map((c) => [c, { units: c === "PRECTOTCORR" ? "mm/day" : c === "T2M" || c === "T2M_MAX" ? "C" : "1", longname: c }]));
  const header = { fill_value: -999 };
  if (u.pathname.endsWith("/monthly/point")) {
    return { header, parameters, properties: { parameter: Object.fromEntries(codes.map((c) => [c, monthly(c, +q.get("latitude"), +q.get("longitude"))])) } };
  }
  if (u.pathname.endsWith("/daily/point")) {
    const o = {};
    for (let y = YEARS[0]; y <= YEARS[1]; y++) for (let d = 0; d < 365; d++) {
      const dt = new Date(Date.UTC(y, 0, 1 + d));
      o[`${dt.getUTCFullYear()}${String(dt.getUTCMonth() + 1).padStart(2, "0")}${String(dt.getUTCDate()).padStart(2, "0")}`] = ((d * 37 + y) % 11) * 1.7;
    }
    return { header, parameters, properties: { parameter: { PRECTOTCORR: o } } };
  }
  const features = [];
  const lat0 = +q.get("latitude-min"), lat1 = +q.get("latitude-max"), lon0 = +q.get("longitude-min"), lon1 = +q.get("longitude-max");
  for (let la = Math.ceil(lat0 / 0.5) * 0.5; la <= lat1; la += 0.5) for (let lo = Math.ceil(lon0 / 0.625) * 0.625; lo <= lon1; lo += 0.625) {
    features.push({ geometry: { coordinates: [lo, la, 10] }, properties: { parameter: { [codes[0]]: monthly(codes[0], la, lo, (la * 10) % 3 - 1) } } });
  }
  return { header, parameters, features };
}
const urls = [];
globalThis.fetch = async (url) => {
  urls.push(String(url));
  return new Response(JSON.stringify(payload(String(url))), { status: 200 });
};

async function page(search) {
  const { state, place, notices } = parseState(new URLSearchParams(search));
  let ctx;
  for (let i = 0; i < 200; i++) {
    ctx = makeContext(state, place, notices, []);
    if (!ctx.loading) break;
    await new Promise((r) => setTimeout(r, 15));
  }
  return { ctx, html: renderApp(ctx) };
}

test("the default page has the map, the ranking, the sentence and all five charts", async () => {
  const { ctx, html } = await page("");
  assert.equal(ctx.loading, false);
  assert.equal((html.match(/class="cellink"/g) || []).length, 99);
  for (const needle of ['id="sentence"', "What is changing here?", "ew-line", "ew-hist", "ew-month", "ew-pie", "ew-bar", "About this data",
    "https://tile.openstreetmap.org/8/", 'data-zoom="', "Around Sibu"]) assert.ok(html.includes(needle), needle);
  assert.equal((html.match(/<li[^>]*>\s*<a class="inplace"/g) || []).length, 11);
  assert.ok(!html.includes("undefined") && !html.includes("NaN"), "no undefined or NaN in the page");
});

test("each NASA request is asked for once and the whole record is requested", async () => {
  urls.length = 0;
  await page("var=rh2m&place=kapit");
  const monthlyPoints = urls.filter((u) => u.includes("monthly/point"));
  assert.ok(monthlyPoints.every((u) => u.includes("start=1981") && u.includes("end=2025")));
  assert.equal(new Set(urls).size, urls.length, "no URL requested twice");
});

test("value mode names the year; a daily variable has no map; a place far away gets its own map", async () => {
  let r = await page("mode=value&year=2010");
  assert.ok(r.html.includes("in 2010, square by square") && r.html.includes('id="year"'));
  r = await page("var=rain_heavy");
  assert.equal(r.ctx.mapStatus, "nomap");
  assert.ok(r.html.includes("No map for this variable") && r.html.includes("A pie chart needs a map variable"));
  r = await page("place=51.5,-0.12");
  assert.ok(r.html.includes("Around 51.5\u00b0N, 0.12\u00b0W") && r.html.includes("only on the Sarawak map"));
  assert.notDeepEqual(r.ctx.bundle.area.bounds, CFG.bounds);
});

test("shading fills the squares and shows the colour ramp", async () => {
  const plain = (await page("")).html, shaded = (await page("shade=1")).html;
  assert.ok(!plain.includes("cell shade") && shaded.includes("cell shade") && shaded.includes('class="ramp"') && !plain.includes('class="ramp"'));
});

test("a failed request becomes a readable message and the rest of the page still works", async () => {
  const real = globalThis.fetch;
  globalThis.fetch = async (url) => (String(url).includes("monthly/regional")
    ? new Response(JSON.stringify({ messages: ["One of your parameters is incorrect"] }), { status: 422 }) : real(url));
  const { html } = await page("var=ws2m");
  globalThis.fetch = real;
  assert.ok(html.includes("NASA POWER did not accept the request: One of your parameters is incorrect") && html.includes('role="alert"'));
  assert.ok(html.includes('id="sentence"'));
});

test("junk in the link never breaks the page", () => {
  for (const q of ["year=abc", "var=<b>", "place=%00", "y0=zzz&y1=1", "mode=%27", "view=999,999", "extras=,,<>"]) {
    const { state, place } = parseState(new URLSearchParams(q));
    assert.ok(state.y0 <= state.y1 && place && ["trend", "value"].includes(state.mode), q);
  }
  assert.equal(parsePlace("95,0"), null);
  assert.equal(parsePlace("sibu").name, "Sibu");
});

test("the downloaded parameter list is complete and searchable", async () => {
  const { readFileSync } = await import("node:fs");
  const { searchCatalogue, countKinds } = await import("../js/catalogue.js");
  const doc = JSON.parse(readFileSync(new URL("../data/parameters-AG.json", import.meta.url), "utf8"));
  const rows = doc.rows.map((r) => ({ code: r[0], name: r[1], units: r[2], kind: r[3], definition: r[4], calculated: !!r[5], inputs: r[6], steps: r[7] }));
  assert.ok(rows.length > 1000);
  assert.deepEqual(doc.columns, ["code", "name", "units", "kind", "definition", "calculated", "inputs", "steps"]);
  assert.ok(rows.every((r) => r.steps.startsWith("M")), "every parameter has monthly data");
  const t2m = searchCatalogue(rows, "T2M");
  assert.equal(t2m[0].code, "T2M", "an exact code comes first");
  assert.ok(searchCatalogue(rows, "wind speed").every((r) => /wind/i.test(r.name + r.definition)));
  assert.deepEqual(searchCatalogue(rows, "zzzzqqq"), []);
  const counts = countKinds(rows);
  assert.ok(counts.METEOROLOGY > 100 && counts.RADIATION > 100);
  assert.equal(searchCatalogue(rows, "", "SOLAR-GEOMETRY").length, counts["SOLAR-GEOMETRY"]);
});
