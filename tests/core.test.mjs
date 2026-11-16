// The browser code must give the same answers as the Python code (fixtures.json is written by
// tools/make_fixtures.py). Run with:  node --test site/tests
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import * as ag from "../js/aggregate.js";
import * as fmt from "../js/fmt.js";
import * as stats from "../js/stats.js";
import * as text from "../js/text.js";

const fx = JSON.parse(readFileSync(new URL("./fixtures.json", import.meta.url), "utf8"));
const close = (a, b, msg, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${msg}: ${a} vs ${b}`);

test("Sen's slope, Mann-Kendall and the 95% interval match Python", () => {
  fx.trends.forEach((c, k) => {
    const tr = stats.trend(c.xs, c.ys);
    if (c.trend === null) { assert.equal(tr, null, `case ${k}`); return; }
    for (const key of ["slope", "intercept", "lo", "hi", "z", "p", "perDecade"]) close(tr[key], c.trend[key], `case ${k} ${key}`);
    assert.equal(tr.s, c.trend.s); assert.equal(tr.significant, c.trend.significant); assert.equal(tr.direction, c.trend.direction);
    [c.xs[0], c.xs[c.xs.length - 1]].forEach((x, i) => { const b = tr.band(x); close(b[0], c.trend.band[i][0], "band lo"); close(b[1], c.trend.band[i][1], "band hi"); });
  });
});

test("summary, halves, histogram and percentile match Python", () => {
  const s = stats.summarize(fx.summary.xs, fx.summary.ys), e = fx.summary.summary;
  assert.equal(s.n, e.n);
  ["mean", "median", "minimum", "minimum_x", "maximum", "maximum_x", "sd"].forEach((k) => close(s[k.replace(/_x$/, "X")], e[k], k));
  const h = fx.histogram, [ax, ay, bx, by] = stats.splitHalves(h.xs, h.ys);
  assert.deepEqual([ax, ay, bx, by], h.halves);
  const [edges, ca, cb] = stats.histogram(ay, by);
  edges.forEach((v, i) => close(v, h.edges[i], "edge"));
  assert.deepEqual([ca, cb], [h.ca, h.cb]);
  close(stats.percentile(fx.percentile.values, 95), fx.percentile.q95, "q95");
  close(stats.percentile(fx.percentile.values, 50), fx.percentile.q50, "q50");
});

test("too few years gives no trend", () => {
  assert.equal(stats.trend([1, 2, 3], [1, 2, 3]), null);
});

test("the complementary error function is accurate across its range", () => {
  const known = [[0.5, 0.6170750774519739], [1.96, 0.04999579029644087], [3, 0.0026997960632601913], [6, 1.973175290075403e-9]];
  known.forEach(([z, p]) => close(stats.twoSidedP(z), p, `z=${z}`, 1e-10));
});

test("yearly aggregation from monthly values matches Python", () => {
  const m = fx.monthly;
  for (const agg of ["mean", "sum"]) {
    const got = ag.monthlyToYearly(m.values, m.start, 2010, 2019, agg), want = m[agg];
    assert.deepEqual(Object.keys(got).sort(), Object.keys(want).sort(), agg);
    Object.keys(want).forEach((y) => close(got[y], want[y], `${agg} ${y}`));
  }
  const prof = (p, q) => p.forEach((row, i) => { if (q[i] === null) assert.equal(row, null); else row.forEach((v, j) => close(v, q[i][j], `profile ${i}`)); });
  prof(ag.monthlyProfile(m.values, m.start, 2010, 2019, "sum"), m.profile_sum);
  prof(ag.monthlyProfile(m.values, m.start, 2012, 2018, "mean"), m.profile_mean);
});

test("yearly aggregation from daily values matches Python", () => {
  const d = fx.daily;
  const win = ag.dailySlice(d.values, d.start, 2018, 2021);
  assert.equal(win.length, d.values.length);
  close(ag.heavyThreshold(win), d.threshold, "threshold");
  const cmp = (got, want, name) => { assert.deepEqual(Object.keys(got).sort(), Object.keys(want).sort(), name); Object.keys(want).forEach((y) => close(got[y], want[y], `${name} ${y}`)); };
  cmp(ag.dailyToYearly(win, 2018, 2021, "heavy_days", d.threshold), d.heavy, "heavy");
  cmp(ag.dailyToYearly(win, 2018, 2021, "wettest_day"), d.wettest, "wettest");
  cmp(ag.dailyToYearly(win, 2018, 2021, "sum"), d.sum, "sum");
  cmp(ag.dailyToYearly(win, 2018, 2021, "days_at_least", 5), d.ge50, "days at least");
});

test("number formatting matches Python", () => {
  fx.num.forEach(([x, d, signed, group, want]) => assert.equal(fmt.num(x, d, { signed, group }), want, `${x}`));
  fx.decimals_for.forEach(([x, want]) => assert.equal(fmt.decimalsFor(x), want, `decimalsFor ${x}`));
  fx.decimals_for_range.forEach(([lo, hi, want]) => assert.equal(fmt.decimalsForRange(lo, hi), want));
  fx.pretty_unit.forEach(([u, want]) => assert.equal(fmt.prettyUnit(u), want, u));
  fx.coords.forEach(([la, lo, a, b]) => { assert.equal(fmt.fmtLat(la), a); assert.equal(fmt.fmtLon(lo), b); });
});

test("the plain-language sentences are word for word the Python ones", () => {
  fx.sentences.forEach((c) => {
    const tr = c.xs.length ? stats.trend(c.xs, c.ys) : null;
    assert.equal(text.resultSentence("Around Sibu", c.subject, tr, c.unit, 2001, 2025, c.ys.length), c.sentence);
    assert.equal(text.trendPhrase(tr, c.unit, 2001, 2025), c.phrase);
    if (c.numbers) {
      const nn = text.trendNumbers(tr, c.unit);
      assert.equal(nn.size, c.numbers.size); assert.equal(nn.interval, c.numbers.interval);
      assert.equal(nn.sizeAbs, c.numbers.size_abs);
    }
  });
});
