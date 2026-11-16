// The five charts, drawn as SVG strings (port of earthwatch/render/charts.py).
// Each function returns {svg, summary, key} or null when there is not enough data. Geometry is
// fixed in drawing units; the stylesheet sets the text size for the width the chart is shown at.
import * as fmt from "./fmt.js";
import { linear, niceTicks, tickDecimals, yearTicks } from "./scale.js";
import { histogram, splitHalves } from "./stats.js";
import { ARROW_DOWN, ARROW_UP, esc, fillFor, n, patterns, svgRoot, tag } from "./svg.js";
import * as text from "./text.js";

const W = 440;

function yAxis(ticks, ymap, left, right, dec) {
  return ticks.map((v) => {
    const y = ymap(v);
    return tag("line", "", { x1: left, x2: right, y1: y, y2: y, class: "gl" })
      + tag("text", fmt.num(v, dec), { x: left - 6, y: y + 5, class: "ax", "text-anchor": "end" });
  }).join("");
}

const unitNote = (u) => (u ? tag("text", esc(u), { x: 2, y: 14, class: "ax" }) : "");
const mean = (v) => v.reduce((a, b) => a + b, 0) / v.length;

// --- line graph --------------------------------------------------------------------------

export function lineChart(uid, years, values, tr, unit, summary, subject, place, y0, y1, minYears = 10) {
  const H = 300, L = 66, R = 14, T = 26, B = 40;
  let lo = Math.min(...values), hi = Math.max(...values);
  if (tr) for (const x of [years[0], years[years.length - 1]]) { const [a, b] = tr.band(x); lo = Math.min(lo, a); hi = Math.max(hi, b); }
  const [ticks, step] = niceTicks(lo, hi, 5);
  const dec = tickDecimals(step);
  const ymap = linear(ticks[0], ticks[ticks.length - 1], H - B, T);
  const last = years[years.length - 1];
  const xmap = years.length > 1 ? linear(years[0], last, L + 10, W - R - 10) : () => (L + W - R) / 2;
  const body = [yAxis(ticks, ymap, L, W - R, dec), unitNote(fmt.prettyUnit(unit))];
  yearTicks(years[0], last).forEach((yr) => body.push(tag("text", String(yr), { x: xmap(yr), y: H - 12, class: "ax", "text-anchor": "middle" })));
  body.push(tag("line", "", { x1: L, x2: W - R, y1: H - B, y2: H - B, class: "axis" }));
  if (tr) {
    const [la, ha] = tr.band(years[0]), [lb, hb] = tr.band(last);
    const pts = `${n(xmap(years[0]))},${n(ymap(ha))} ${n(xmap(last))},${n(ymap(hb))} ${n(xmap(last))},${n(ymap(lb))} ${n(xmap(years[0]))},${n(ymap(la))}`;
    body.push(tag("polygon", "", { points: pts, class: "band" }));
  }
  if (years.length > 1) {
    body.push(tag("polyline", "", { points: years.map((x, i) => `${n(xmap(x))},${n(ymap(values[i]))}`).join(" "), class: "series" }));
  }
  if (tr) {
    body.push(tag("line", "", { x1: xmap(years[0]), y1: ymap(tr.line(years[0])), x2: xmap(last), y2: ymap(tr.line(last)), class: "trendline" }));
  }
  const vdec = fmt.decimalsForRange(Math.min(...values), Math.max(...values));
  const u = fmt.prettyUnit(unit);
  years.forEach((x, i) => body.push(tag("circle", tag("title", esc(`${x}: ${fmt.num(values[i], vdec)} ${u}`.trim())),
    { cx: xmap(x), cy: ymap(values[i]), r: 3.8, class: "pt" })));

  const parts = [`Line graph of ${subject} around ${place}, ${years[0]} to ${last}: ${values.length} yearly values.`];
  if (summary) {
    parts.push(`The lowest is ${fmt.num(summary.minimum, vdec)} ${u} in ${Math.trunc(summary.minimumX)} and the highest is `
      + `${fmt.num(summary.maximum, vdec)} ${u} in ${Math.trunc(summary.maximumX)}.`.replace("  ", " "));
  }
  if (tr) {
    const nums = text.trendNumbers(tr, unit);
    const verdict = { rising: "a significant rise", falling: "a significant fall" }[tr.direction] || "no significant trend";
    parts.push(`The trend line changes by ${nums.size} per decade (95% interval ${nums.interval}): ${verdict}.`);
  } else parts.push(`There are too few years (fewer than ${minYears}) to draw a trend line.`);
  const desc = parts.join(" ");
  const key = [["k-data", "\u25cf", text.t("legend_data")]];
  if (tr) key.push(["k-trend", "\u2504", text.t("legend_trend_line")], ["k-band", "\u2592", text.t("legend_band")]);
  return { svg: svgRoot(W, H, uid, text.t("line_h", { subject, place }), desc, body.join("")), summary: desc, key };
}

// --- monthly (average year) ---------------------------------------------------------------

export function monthlyChart(uid, months, unit, subject, place, y0, y1) {
  const have = months.filter(Boolean);
  if (!have.length) return null;
  const H = 300, L = 66, R = 14, T = 26, B = 40;
  const lo = Math.min(...have.map((m) => m[1])), hi = Math.max(...have.map((m) => m[2]));
  const [ticks, step] = niceTicks(lo, hi, 5);
  const dec = tickDecimals(step);
  const ymap = linear(ticks[0], ticks[ticks.length - 1], H - B, T);
  const slot = (W - L - R) / 12;
  const xs = Array.from({ length: 12 }, (_, i) => L + slot * (i + 0.5));
  const u = fmt.prettyUnit(unit);
  const body = [yAxis(ticks, ymap, L, W - R, dec), unitNote(u)];
  text.MONTHS_SHORT.forEach((name, i) => body.push(tag("text", name, { x: xs[i], y: H - 12, class: "ax", "text-anchor": "middle" })));
  body.push(tag("line", "", { x1: L, x2: W - R, y1: H - B, y2: H - B, class: "axis" }));
  const runs = [];
  months.forEach((m, i) => {
    if (!m) return;
    if (runs.length && runs[runs.length - 1].slice(-1)[0] === i - 1) runs[runs.length - 1].push(i); else runs.push([i]);
  });
  runs.forEach((run) => {
    if (run.length < 2) return;
    const top = run.map((i) => `${n(xs[i])},${n(ymap(months[i][2]))}`).join(" ");
    const bottom = [...run].reverse().map((i) => `${n(xs[i])},${n(ymap(months[i][1]))}`).join(" ");
    body.push(tag("polygon", "", { points: `${top} ${bottom}`, class: "band" }));
    body.push(tag("polyline", "", { points: run.map((i) => `${n(xs[i])},${n(ymap(months[i][0]))}`).join(" "), class: "mline" }));
  });
  const vdec = fmt.decimalsForRange(lo, hi);
  months.forEach((m, i) => {
    if (!m) return;
    body.push(tag("circle", tag("title", esc(`${text.MONTHS_SHORT[i]}: average ${fmt.num(m[0], vdec)} ${u}, lowest ${fmt.num(m[1], vdec)}, highest ${fmt.num(m[2], vdec)}`.trim())),
      { cx: xs[i], cy: ymap(m[0]), r: 3.8, class: "pt" }));
  });
  const idx = months.map((m, i) => (m ? i : -1)).filter((i) => i >= 0);
  const topI = idx.reduce((a, b) => (months[b][0] > months[a][0] ? b : a));
  const lowI = idx.reduce((a, b) => (months[b][0] < months[a][0] ? b : a));
  let desc = `Line graph of average monthly ${subject} around ${place}, ${y0} to ${y1}. `
    + `The month with the highest average is ${text.MONTHS_LONG[topI]} (${fmt.num(months[topI][0], vdec)} ${u}) and the lowest is `
    + `${text.MONTHS_LONG[lowI]} (${fmt.num(months[lowI][0], vdec)} ${u}). The shaded band runs from the lowest to the highest value `
    + "that month had in any year. This shows the yearly cycle, not a trend.";
  if (idx.length < 12) desc += ` ${12 - idx.length} months have no data.`;
  const key = [["k-trend", "\u25cf", text.t("legend_month_avg")], ["k-band", "\u2592", text.t("legend_month_range")]];
  return { svg: svgRoot(W, H, uid, text.t("month_h", { subject, place }), desc, body.join("")), summary: desc, key };
}

// --- histogram -----------------------------------------------------------------------------

export function histogramChart(uid, years, values, unit, subject) {
  const [ax, ay, bx, by] = splitHalves(years, values);
  if (ay.length < 3) return null;
  const [edges, ca, cb] = histogram(ay, by);
  const k = ca.length;
  const H = 290, L = 52, R = 14, T = 26, B = 58;
  const ymax = Math.max(...ca, ...cb, 1);
  let [ticks, step] = niceTicks(0, ymax, 4);
  if (step < 1) { ticks = Array.from({ length: ymax + 1 }, (_, i) => i); step = 1; }
  const ymap = linear(ticks[0], ticks[ticks.length - 1], H - B, T);
  const group = (W - L - R) / k, bar = group * 0.4;
  const body = [patterns(uid), yAxis(ticks, ymap, L, W - R, 0), tag("text", "Number of years", { x: 2, y: 14, class: "ax" })];
  for (let i = 0; i < k; i++) {
    const gx = L + i * group;
    [[ca[i], "early"], [cb[i], "late"]].forEach(([cnt, kind], j) => {
      if (cnt === 0) return;
      const x = gx + group * 0.1 + j * (bar + group * 0.05), y = ymap(cnt);
      const title = tag("title", esc(`${cnt} ${cnt === 1 ? "year" : "years"}, ${kind === "early" ? text.t("first_half") : text.t("second_half")}`));
      body.push(tag("rect", title, { x, y, width: bar, height: ymap(0) - y, class: `hb ${kind}`, fill: kind === "early" ? `url(#${uid}-early)` : null }));
    });
  }
  body.push(tag("line", "", { x1: L, x2: W - R, y1: H - B, y2: H - B, class: "axis" }));
  const dec = fmt.decimalsFor(edges[1] - edges[0], 2, 3);
  const every = edges.length <= 6 ? 1 : 2;
  edges.forEach((e, i) => {
    if (i % every === 0 || (i === edges.length - 1 && (edges.length - 1) % every === 0)) {
      body.push(tag("text", fmt.num(e, dec, { group: false }), { x: L + i * group, y: H - B + 22, class: "ax", "text-anchor": "middle" }));
    }
  });
  body.push(tag("text", esc(fmt.prettyUnit(unit)), { x: (L + W - R) / 2, y: H - 8, class: "ax", "text-anchor": "middle" }));
  const u = fmt.prettyUnit(unit);
  const d2 = fmt.decimalsForRange(Math.min(...values), Math.max(...values));
  const left = `${ax[0]}\u2013${ax[ax.length - 1]}`, right = `${bx[0]}\u2013${bx[bx.length - 1]}`;
  const skipped = years.length % 2 === 1
    ? ` The middle year (${years[Math.floor(years.length / 2)]}) is left out so both halves have ${ay.length} years.` : "";
  const desc = (`Histogram of yearly ${subject}. The first half (${left}) averaged ${fmt.num(mean(ay), d2)} ${u} and the second half (${right}) `
    + `averaged ${fmt.num(mean(by), d2)} ${u}.${skipped} This compares the two halves by eye. It is not a significance test.`).replace("  ", " ");
  const key = [["k-early", "\u25a8", `${text.t("first_half")} (${left})`], ["k-late", "\u25a0", `${text.t("second_half")} (${right})`]];
  return { svg: svgRoot(W, H, uid, text.t("hist_h"), desc, body.join("")), summary: desc, key };
}

// --- pie ----------------------------------------------------------------------------------

function slice(cx, cy, r, a0, a1) {
  const x0 = cx + r * Math.sin(a0), y0 = cy - r * Math.cos(a0), x1 = cx + r * Math.sin(a1), y1 = cy - r * Math.cos(a1);
  return `M${n(cx)} ${n(cy)} L${n(x0)} ${n(y0)} A${n(r)} ${n(r)} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${n(x1)} ${n(y1)} Z`;
}

export function pieChart(uid, rising, falling, none, short = 0, nodata = 0, subject = "") {
  const total = rising + falling + none;
  if (total === 0) return null;
  const cx = W / 2, cy = 112, r = 92;
  const cats = [["rising", rising, ARROW_UP, text.t("pie_rising")], ["falling", falling, ARROW_DOWN, text.t("pie_falling")],
    ["none", none, "\u25cf", text.t("pie_none")]];
  const body = [patterns(uid)];
  let a = 0;
  const shown = cats.filter((c) => c[1] > 0);
  shown.forEach(([kind, cnt, , label]) => {
    const frac = cnt / total;
    const title = tag("title", esc(`${label}: ${cnt} of ${total} squares`));
    if (shown.length === 1) body.push(tag("circle", title, { cx, cy, r, fill: fillFor(kind, uid), class: "slice" }));
    else body.push(tag("path", title, { d: slice(cx, cy, r, a, a + frac * 2 * Math.PI), fill: fillFor(kind, uid), class: "slice" }));
    a += frac * 2 * Math.PI;
  });
  let y = cy + r + 26;
  cats.forEach(([kind, cnt, glyph, label]) => {
    const pct = Math.round(100 * cnt / total);
    body.push(tag("rect", "", { x: 24, y: y - 13, width: 16, height: 16, fill: fillFor(kind, uid), class: "slice sw" }));
    const gcls = { rising: "rise", falling: "fall" }[kind] || "none";
    body.push(tag("text", `<tspan class="g ${gcls}">${glyph}</tspan> ${esc(label)}: ${cnt} ${text.t("squares_word")} (${pct}%)`, { x: 48, y, class: "lbl" }));
    y += 24;
  });
  const height = y - 8;
  const parts = [`Of ${total} map squares with enough data for ${subject}, ${rising} are significantly rising, ${falling} are significantly falling and ${none} show no significant trend.`];
  const extra = [];
  if (short) extra.push(`${short} had too few years to test`);
  if (nodata) extra.push(`${nodata} have no data (sea or outside the area)`);
  if (extra.length) parts.push(`Left out: ${extra.join(" and ")}.`);
  const desc = parts.join(" ");
  return { svg: svgRoot(W, height, uid, text.t("pie_h"), desc, body.join(""), "chart pie"), summary: desc, key: [] };
}

// --- bar (trend per town, with 95% intervals) ------------------------------------------------

export function barChart(uid, rows, unit, subject, y0, y1) {
  const have = rows.filter((r) => r.trend);
  if (!have.length) return null;
  const width = Math.max(W, 66 + 14 + 96 * rows.length);
  const H = 320, L = 66, R = 14, T = 26, B = 88;
  const lo = Math.min(0, ...have.map((r) => r.trend.loDecade)), hi = Math.max(0, ...have.map((r) => r.trend.hiDecade));
  const [ticks, step] = niceTicks(lo, hi, 5);
  const dec = tickDecimals(step);
  const ymap = linear(ticks[0], ticks[ticks.length - 1], H - B, T);
  const slot = (width - L - R) / rows.length;
  const note = (text.decadeUnitText(unit).trim() + " per decade").trim();
  const body = [patterns(uid), yAxis(ticks, ymap, L, width - R, dec), unitNote(note)];
  const zero = ymap(0);
  body.push(tag("line", "", { x1: L, x2: width - R, y1: zero, y2: zero, class: "zero" }));
  const udec = Math.max(fmt.decimalsFor(Math.max(...have.map((r) => Math.abs(r.trend.perDecade))), 2, 3), 0);
  rows.forEach((r, i) => {
    const cx = L + slot * (i + 0.5), bw = Math.min(slot * 0.5, 54);
    body.push(tag("text", esc(r.name), { x: cx, y: H - B + 24, class: "ax name", "text-anchor": "middle" }));
    if (!r.trend) { body.push(tag("text", r.status === "loading" ? "loading" : "no data", { x: cx, y: H - B + 46, class: "ax", "text-anchor": "middle" })); return; }
    const tr = r.trend;
    const [top, bottom] = [ymap(tr.perDecade), zero].sort((p, q) => p - q);
    body.push(tag("rect", tag("title", esc(`${r.name}: ${fmt.num(tr.perDecade, udec, { signed: true })} per decade`)),
      { x: cx - bw / 2, y: top, width: bw, height: Math.max(bottom - top, 1), fill: fillFor(tr.direction, uid), class: "slice" }));
    const ylo = ymap(tr.loDecade), yhi = ymap(tr.hiDecade);
    body.push(tag("line", "", { x1: cx, x2: cx, y1: ylo, y2: yhi, class: "whisker" }));
    [ylo, yhi].forEach((yy) => body.push(tag("line", "", { x1: cx - 8, x2: cx + 8, y1: yy, y2: yy, class: "whisker" })));
    const glyph = tr.direction === "rising" ? ARROW_UP : tr.direction === "falling" ? ARROW_DOWN : "\u25cf";
    const gcls = { rising: "rise", falling: "fall" }[tr.direction] || "none";
    body.push(tag("text", `<tspan class="g ${gcls}">${glyph}</tspan> ${esc(fmt.num(tr.perDecade, udec, { signed: true }))}`,
      { x: cx, y: H - B + 46, class: "ax val", "text-anchor": "middle" }));
  });
  const verdicts = rows.map((r) => {
    if (!r.trend) return `${r.name}: no result`;
    const nums = text.trendNumbers(r.trend, unit, udec);
    const word = { rising: "significant rise", falling: "significant fall" }[r.trend.direction] || "no significant trend";
    return `${r.name}: ${nums.size} per decade (95% interval ${nums.interval}), ${word}`;
  });
  const desc = `Bar chart of the change in ${subject} per decade from ${y0} to ${y1}, with 95% intervals. ${verdicts.join("; ")}.`;
  const key = [["k-rise", ARROW_UP, text.t("badge_rising")], ["k-fall", ARROW_DOWN, text.t("badge_falling")],
    ["k-none", "\u25cf", text.t("badge_none")], ["k-whisker", "\u2503", text.t("interval")]];
  return { svg: svgRoot(width, H, uid, text.t("bar_h"), desc, body.join("")), summary: desc, key };
}
