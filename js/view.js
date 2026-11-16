// The explorer page as HTML strings (port of earthwatch/templates/index.html plus the context
// builders in earthwatch/web.py). No statistics and no colours are chosen here.
import * as charts from "./charts.js";
import { CFG, VARIABLES } from "./config.js";
import * as fmt from "./fmt.js";
import { monthlyFor, rank } from "./service.js";
import { href } from "./state.js";
import * as text from "./text.js";
import { esc } from "./svg.js";

const t = text.t;

// --- context builders ----------------------------------------------------------------------

export function resultContext(bundle, s, status, err, y0, y1) {
  const { place, var: v } = bundle;
  const out = { status, error: err };
  if (!s) return out;
  const tr = s.trend, unit = s.var.unit;
  out.sentence = text.resultSentence(`Around ${place.name}`, v.subject, tr, unit, y0, y1, s.n, CFG.minYears);
  const kind = !tr ? "none" : { rising: "rise", falling: "fall" }[tr.direction] || "none";
  out.badge = { kind, label: t(text.badgeKey(tr, s.years.length > 0)), glyph: { rise: "\u25b2", fall: "\u25bc" }[kind] || "\u25cf" };
  if (tr) {
    out.nums = text.trendNumbers(tr, unit);
    out.p = tr.p < 0.001 ? "< 0.001" : tr.p.toFixed(3);
  }
  out.n = s.n; out.span = y1 - y0 + 1; out.unit = fmt.prettyUnit(unit);
  if (s.summary) {
    const sm = s.summary, d = fmt.decimalsForRange(sm.minimum, sm.maximum);
    out.stats = [
      [t("stat_mean"), fmt.num(sm.mean, d)], [t("stat_median"), fmt.num(sm.median, d)],
      [t("stat_min"), `${fmt.num(sm.minimum, d)} (${Math.trunc(sm.minimumX)})`],
      [t("stat_max"), `${fmt.num(sm.maximum, d)} (${Math.trunc(sm.maximumX)})`],
      [t("stat_sd"), sm.sd !== null ? fmt.num(sm.sd, Math.max(d, fmt.decimalsFor(sm.sd, 2, 4))) : fmt.EN_DASH],
      [t("stat_years"), String(sm.n)],
    ];
    out.rows = s.years.map((yr, i) => [yr, fmt.num(s.values[i], d)]);
  }
  if (s.threshold !== null && v.agg === "heavy_days") out.threshold = t("heavy_threshold", { value: fmt.num(s.threshold, 1) });
  return out;
}

export function rankingContext(bundle, y0, y1, link) {
  return rank(bundle, y0, y1).map(([v, status, s, err]) => {
    const row = { var: v, status, error: err, href: link({ var: v.id }, "result"), current: v.id === bundle.var.id };
    if (s && s.years.length) {
      const tr = s.trend;
      row.badge = { kind: !tr ? "none" : { rising: "rise", falling: "fall" }[tr.direction] || "none", label: t(text.badgeKey(tr, true)),
        glyph: !tr || tr.direction === "none" ? "\u25cf" : tr.direction === "rising" ? "\u25b2" : "\u25bc" };
      if (tr) { const nn = text.trendNumbers(tr, s.var.unit); row.size = nn.size; row.interval = nn.interval; }
      else row.note = t("rank_too_short", { n: CFG.minYears });
    } else if (status === "ready") row.badge = { kind: "none", label: t("badge_nodata"), glyph: "\u25cf" };
    return row;
  });
}

export function chartsContext(bundle, s, status, y0, y1) {
  const { var: v, place } = bundle;
  const out = { line: null, hist: null, month: null, month_state: "", month_subject: "", pie: null, bar: null, pie_state: "", bar_state: "" };
  if (s && s.years.length) {
    const unit = s.var.unit;
    out.line = charts.lineChart("ew-line", s.years, s.values, s.trend, unit, s.summary, v.subject, place.name, y0, y1, CFG.minYears);
    out.hist = charts.histogramChart("ew-hist", s.years, s.values, unit, v.subject);
  }
  const [mstatus, mres] = monthlyFor(bundle.here, v, y0, y1);
  if (mres) {
    out.month_subject = mres.subject;
    out.month = charts.monthlyChart("ew-month", mres.months, mres.unit, mres.subject, place.name, y0, y1);
  }
  if (!out.month) { out.month_state = mstatus; out.month_subject = v.daily ? "rainfall" : v.subject; }
  if (v.daily) out.pie_state = "nomap";
  else if (bundle.grid && bundle.grid.status === "ready") {
    const c = bundle.grid.value.counts;
    out.pie = charts.pieChart("ew-pie", c.rising, c.falling, c.none, c.short, c.nodata, v.subject);
    out.pie_n = c.rising + c.falling + c.none;
  } else if (bundle.grid) out.pie_state = bundle.grid.status;
  const rows = [];
  let unitForBar = s ? s.var.unit : v.unit;
  bundle.area.towns.forEach((tw) => {
    const [st, ts] = bundle.towns[tw.id].series(v, y0, y1);
    if (ts && ts.var.unit) unitForBar = ts.var.unit;
    rows.push({ name: tw.name, trend: ts ? ts.trend : null, status: st });
  });
  out.bar = charts.barChart("ew-bar", rows, unitForBar, v.subject, y0, y1);
  if (!rows.length) out.bar_state = "notowns";
  else if (!out.bar) out.bar_state = rows.some((r) => r.status === "loading") ? "loading" : "error";
  return out;
}

/** Plain links that move the map by half its size (the page also lets you drag it). */
export function panLinks(bundle, link) {
  const b = bundle.area.bounds;
  const clat = (b.latMin + b.latMax) / 2, clon = (b.lonMin + b.lonMax) / 2;
  const dlat = (b.latMax - b.latMin) / 2, dlon = (b.lonMax - b.lonMin) / 2;
  const to = (lat, lon) => link({ view: `${Math.min(Math.max(lat, -90), 90).toFixed(3)},${Math.min(Math.max(lon, -180), 180).toFixed(3)}` }, "map-heading");
  return [[t("pan_north"), to(clat + dlat, clon)], [t("pan_south"), to(clat - dlat, clon)],
    [t("pan_west"), to(clat, clon - dlon)], [t("pan_east"), to(clat, clon + dlon)], [t("pan_here"), link({ view: "" }, "map-heading")]];
}

// --- pieces of the page --------------------------------------------------------------------

const badge = (b) => `<span class="badge ${b.kind}"><span class="g" aria-hidden="true">${b.glyph}</span>${esc(b.label)}</span>`;

const keyList = (key) => `<ul class="key">${key.map(([cls, glyph, label]) =>
  `<li><span class="k ${cls}" aria-hidden="true">${glyph}</span>${esc(label)}</li>`).join("")}</ul>`;

function chartPanel(id, wide, title, inner) {
  return `<section class="cpanel ${wide ? "wide" : "narrow"}" aria-labelledby="${id}-h"><h3 id="${id}-h">${esc(title)}</h3>${inner}</section>`;
}

function hiddenFields(state, skip = [], form = "") {
  const f = form ? ` form="${form}"` : "";
  const h = (name, value) => `<input type="hidden" name="${name}" value="${esc(value)}"${f}>`;
  return [
    skip.includes("var") ? "" : h("var", state.var), skip.includes("mode") ? "" : h("mode", state.mode),
    skip.includes("place") ? "" : h("place", state.place), state.extras.length ? h("extras", state.extras.join(",")) : "",
    state.view ? h("view", state.view) : "", state.shade && !skip.includes("shade") ? h("shade", "1") : "",
  ].join("");
}

function controlsHtml(c) {
  const { state, var: v, groups, mapReady } = c;
  const options = groups.map((g) => `<optgroup label="${esc(g.name)}">${g.vars.map((x) =>
    `<option value="${esc(x.id)}"${x.id === v.id ? " selected" : ""}>${esc(x.label)}${x.daily ? esc(t("no_map_suffix")) : ""}</option>`).join("")}</optgroup>`).join("");
  const yearbox = state.mode === "value" ? `<div class="field yearbox"><label for="year">${t("year")}: <output id="year-out" for="year">${state.year}</output></label>
    <div class="line"><input type="range" id="year" name="year" form="controls" min="${state.y0}" max="${state.y1}" step="1" value="${state.year}" aria-valuetext="${state.year}">
    <button type="button" id="play" class="btn quiet" data-play="${t("play")}" data-pause="${t("pause")}" aria-pressed="false">${t("play")}</button></div></div>` : "";
  return `<form id="controls" method="get" action="./" data-inplace></form>
  <section class="card controls" aria-label="${esc(t("controls_h"))}">
    ${hiddenFields(state, ["var", "mode", "shade"], "controls")}
    ${state.shade && !mapReady ? '<input type="hidden" name="shade" value="1" form="controls">' : ""}
    <div class="field grow"><label for="var">${t("variable")}</label><select id="var" name="var" form="controls" data-auto>${options}</select></div>
    <fieldset class="field"><legend class="lab">${t("mode")}</legend><div class="seg">
      <label><input type="radio" name="mode" value="trend" form="controls" data-auto${state.mode === "trend" ? " checked" : ""}> ${t("mode_trend")}</label>
      <label><input type="radio" name="mode" value="value" form="controls" data-auto${state.mode === "value" ? " checked" : ""}> ${t("mode_value")}</label>
    </div></fieldset>${yearbox}
  </section>
  <section class="card controls" aria-label="${esc(t("settings"))}">
    <div class="field"><label for="y0">${t("start_year")}</label><input id="y0" name="y0" form="controls" type="number" inputmode="numeric" min="${CFG.yearMin}" max="${CFG.yearMax}" value="${state.y0}"></div>
    <div class="field"><label for="y1">${t("end_year")}</label><input id="y1" name="y1" form="controls" type="number" inputmode="numeric" min="${CFG.yearMin}" max="${CFG.yearMax}" value="${state.y1}"></div>
    <div class="field"><label for="community">${t("community")}</label><select id="community" name="community" form="controls">${CFG.communities.map((x) =>
      `<option value="${x}"${x === state.community ? " selected" : ""}>${x}</option>`).join("")}</select></div>
    <div class="field"><label for="lat">${t("latitude")}</label><input id="lat" name="lat" form="controls" type="text" inputmode="decimal" placeholder="2.29" autocomplete="off" style="width: 110px"></div>
    <div class="field"><label for="lon">${t("longitude")}</label><input id="lon" name="lon" form="controls" type="text" inputmode="decimal" placeholder="111.83" autocomplete="off" style="width: 110px"></div>
    <button class="btn" type="submit" form="controls">${t("update")}</button>
    <p class="hint" style="flex-basis: 100%; margin: -8px 0 0">${esc(t("community_hint"))} ${esc(t("custom_place"))}.</p>
  </section>`;
}

function browseHtml(c) {
  const { state, notice } = c;
  const chips = c.removeLinks.length ? `<ul class="chips">${c.removeLinks.map(([code, h]) =>
    `<li><a class="inplace" href="${esc(h)}" aria-label="${esc(t("add_remove", { code }))}">${esc(code)} &times;</a></li>`).join("")}</ul>` : "";
  return `<section class="card browse" aria-labelledby="browse-h"><h2 id="browse-h">${t("browse_h")}</h2>
    <p class="muted small">${esc(t("browse_intro"))}</p>
    ${notice ? `<p class="err" role="alert">${esc(notice)}</p>` : ""}${chips}
    <form class="controls browseform" method="get" action="parameters.html">
      ${hiddenFields(state)}<input type="hidden" name="y0" value="${state.y0}"><input type="hidden" name="y1" value="${state.y1}">
      <input type="hidden" name="community" value="${state.community}">
      <div class="field grow"><label for="find">${t("browse_find")}</label><input id="find" name="find" type="text" placeholder="${esc(t("browse_find_ph"))}" autocomplete="off" maxlength="60"></div>
      <button class="btn" type="submit">${t("browse_go")}</button></form></section>`;
}

function mapCardHtml(c) {
  const { state, map, place, townLinks, panLinks: pans } = c;
  const chips = (current) => `<ul class="chips">${townLinks.map(([tw, h]) =>
    `<li><a href="${esc(h)}"${current && place.id === tw.id ? ' aria-current="true"' : ""}>${esc(tw.name)}</a></li>`).join("")}</ul>`;
  const places = (cur) => `<h3 id="places"${cur ? ' tabindex="-1" class="muted small" style="font-weight: 400"' : ""}>${t("places")}</h3>${chips(cur)}`;
  if (c.mapStatus === "ready" && map) {
    const legendRamp = state.shade ? `<div class="ramp" role="img" aria-label="${esc(map.legendTitle)}: from ${esc(map.legend[0].label || "")} to ${esc(map.legend[map.legend.length - 1].label || "")}">
      ${map.legend.map((it) => `<span class="step"><span class="sw" style="background: ${it.css}"></span><span class="lb">${esc(it.label)}</span></span>`).join("")}</div>
      <span><span class="nd"></span> ${t("legend_nodata")}</span>` : "";
    return `<h2 id="map-heading">${esc(map.heading)}</h2><div>${places(true)}</div>
      <a class="skip-inline" href="#map-notes">${t("skip_map")}</a>
      <div class="mapscroll" tabindex="0" role="region" aria-label="Map grid. Scrolls sideways on small screens.">
        <div id="map-holder" class="draggable" style="min-width: ${map.minWidth}px">${map.svg}</div></div>
      <p class="hint" id="scroll-hint" hidden>${t("scroll_hint")}</p>
      <div class="pan" role="group" aria-label="${t("pan_label")}"><span class="muted small">${t("pan_hint")}</span>
        ${pans.map(([label, h]) => `<a class="btn quiet inplace" href="${esc(h)}">${esc(label)}</a>`).join("")}</div>
      <label class="check"><input type="checkbox" name="shade" value="1" form="controls" data-auto${state.shade ? " checked" : ""}> ${t("shade_label")}</label>
      <div class="legend"><div class="tt" id="legend-title">${esc(map.legendTitle)}</div>${legendRamp}
        <span><span class="dot"></span> ${t("legend_town")}</span>
        ${state.mode === "trend" ? `<span><b class="lg rise" aria-hidden="true">\u25b2</b> ${t("pie_rising")}</span><span><b class="lg fall" aria-hidden="true">\u25bc</b> ${t("pie_falling")}</span><span>${t("legend_muted")}</span>` : ""}
        <span>${t("legend_sig", { y0: state.y0, y1: state.y1 })}</span>
        ${state.shade && state.mode === "trend" ? `<span><span class="faded" style="background: ${map.faded}"></span> ${t("legend_faded")}</span>` : ""}</div>
      <p class="hint" id="map-notes" tabindex="-1">${esc(t("map_note"))}</p>
      <p class="hint">${t("map_credit_pre")}<a href="https://www.openstreetmap.org/copyright" rel="noopener">OpenStreetMap</a>${t("map_credit_post")}</p>
      <details><summary>${t("map_table")}</summary><div class="tablewrap"><table><thead><tr><th scope="col">${t("table_square")}</th>${state.mode === "value" ? `<th scope="col">${t("table_value", { year: state.year })}</th>` : ""}<th scope="col">${t("table_trend")}</th><th scope="col">${t("table_result")}</th></tr></thead>
        <tbody>${map.table.map((r) => `<tr><th scope="row"><a href="${esc(r.href)}">${esc(r.label)}</a></th>${state.mode === "value" ? `<td>${esc(r.value)}</td>` : ""}<td>${esc(r.trend)}</td><td>${esc(r.result)}</td></tr>`).join("")}</tbody></table></div></details>`;
  }
  if (c.mapStatus === "nomap") {
    return `<h2 id="map-heading">${t("map_no_map_h")}</h2><p>${esc(t("map_no_map", { subject_cap: text.cap(c.var.subject) }))}</p>${places(false)}`;
  }
  if (c.mapStatus === "loading") {
    return `<h2 id="map-heading">${t("loading_h")}</h2><p class="muted">${esc(t("loading"))}</p>${places(false)}`;
  }
  return `<h2 id="map-heading">${t("map_no_map_h")}</h2><p class="err" role="alert">${esc(c.mapError || t("map_no_grid"))}</p>
    <p><a class="btn quiet" href="#" data-retry>${t("retry")}</a></p>${places(false)}`;
}

function rankingHtml(c) {
  return `<section class="card sidecard" aria-labelledby="rank-h"><h2 id="rank-h">${t("rank_h")}</h2>
    <p class="muted small flush">${esc(t("rank_intro", { place: c.place.name }))}</p><ol class="rank">${c.ranking.map((r) => `
    <li${r.current ? ' aria-current="true"' : ""}><a class="inplace" href="${esc(r.href)}">${esc(r.var.label)}</a>
      ${r.badge ? badge(r.badge) : r.status === "loading" ? `<span class="muted small">${t("loading_h")}\u2026</span>` : `<span class="badge none"><span class="g" aria-hidden="true">\u25cf</span>${t("badge_nodata")}</span>`}
      <div class="detail">${r.size ? `<span class="arrow ${r.badge.kind}" aria-hidden="true">${r.badge.glyph}</span>${esc(r.size)} ${t("per_decade")} \u00b7 ${t("interval")}: ${esc(r.interval)}`
        : r.note ? esc(r.note) : r.status === "error" ? esc(r.error) : ""}</div></li>`).join("")}</ol></section>`;
}

function placeHtml(c) {
  const { result, charts: ch, var: v, place, state } = c;
  let top;
  if (result.status === "ready" && result.sentence) {
    top = `<div><p id="sentence" class="sentence">${esc(result.sentence)}</p>${result.badge ? `<p class="flush gap-s">${badge(result.badge)}</p>` : ""}</div>
      ${result.nums ? `<dl class="facts"><div><dt>${t("size_per_decade")}</dt><dd>${esc(result.nums.size)}</dd></div><div><dt>${t("interval")}</dt><dd>${esc(result.nums.interval)}</dd></div>
        <div><dt>${t("years_used")}</dt><dd>${result.n} of ${result.span}</dd></div><div><dt>${t("p_value")}</dt><dd>${esc(result.p)}</dd></div></dl>` : ""}
      ${result.stats ? `<div><h3 class="gap-s">${t("stats_h")}</h3><dl class="statsgrid gap-s">${result.stats.map(([l, val]) => `<div><dt>${esc(l)}</dt><dd>${esc(val)}</dd></div>`).join("")}</dl></div>` : ""}
      ${result.threshold ? `<p class="hint flush">${esc(result.threshold)}</p>` : ""}<p class="hint flush">${esc(t("square_note"))}</p>`;
  } else if (result.status === "loading") top = `<p class="muted flush">${esc(t("loading"))}</p>`;
  else top = `<p class="err" role="alert">${esc(result.error || t("err_generic"))}</p><p class="flush"><a class="btn quiet" href="#" data-retry>${t("retry")}</a></p>`;

  const waiting = result.status === "loading" ? `<p class="muted">${esc(t("loading"))}</p>` : `<p class="muted">${esc(result.error || t("rank_unavailable"))}</p>`;
  const withKey = (chart, extra = "") => `<div class="chartbox">${chart.svg}</div>${keyList(chart.key)}<p class="summary">${esc(chart.summary)}</p>${extra}`;
  const lineInner = ch.line ? withKey(ch.line, result.rows ? `<details><summary>${t("series_table")}</summary><div class="tablewrap"><table>
      <thead><tr><th scope="col">${t("year")}</th><th scope="col">${esc(v.label)}${result.unit ? ` (${esc(result.unit)})` : ""}</th></tr></thead>
      <tbody>${result.rows.map(([yr, val]) => `<tr><td>${yr}</td><td>${esc(val)}</td></tr>`).join("")}</tbody></table></div></details>` : "") : waiting;
  const monthInner = ch.month ? withKey(ch.month, `<p class="hint">${esc(t("month_note"))}</p>`)
    : ch.month_state === "loading" ? `<p class="muted">${esc(t("loading"))}</p>` : `<p class="muted">${esc(t("rank_unavailable"))}</p>`;
  const pieInner = ch.pie ? `<div class="chartbox">${ch.pie.svg}</div><p class="summary">${esc(ch.pie.summary)}</p><p class="hint">${esc(t("pie_note", { n: ch.pie_n }))}</p>`
    : ch.pie_state === "nomap" ? `<p class="muted">${esc(t("pie_unavailable"))}</p>`
    : ch.pie_state === "loading" ? `<p class="muted">${esc(t("loading"))}</p>` : `<p class="muted">${esc(c.mapError || t("map_no_grid"))}</p>`;
  const barInner = ch.bar ? `<div class="chartbox scrollx">${ch.bar.svg}</div>${keyList(ch.bar.key)}<p class="summary">${esc(ch.bar.summary)}</p>`
    : ch.bar_state === "notowns" ? `<p class="muted">${esc(t("bar_notowns"))}</p>`
    : ch.bar_state === "loading" ? `<p class="muted">${esc(t("loading"))}</p>` : `<p class="muted">${esc(t("rank_unavailable"))}</p>`;
  return `<section id="result" class="card placecard" tabindex="-1" aria-labelledby="result-h">
    <div><h2 id="result-h">${esc(t("result_h", { place: place.name }))}</h2><p class="muted flush">${esc(v.label)} \u00b7 ${state.y0}\u2013${state.y1}</p></div>
    ${top}<div class="charts">
      ${chartPanel("line", true, t("line_h", { subject: v.subject, place: place.name }), lineInner)}
      ${chartPanel("hist", false, t("hist_h"), ch.hist ? withKey(ch.hist) : `<p class="muted">${esc(t("rank_unavailable"))}</p>`)}
      ${chartPanel("month", true, t("month_h", { subject: ch.month_subject || v.subject, place: place.name }), monthInner)}
      ${chartPanel("pie", false, t("pie_h"), pieInner)}
      ${chartPanel("bar", true, t("bar_h"), barInner)}
    </div></section>`;
}

function aboutHtml() {
  const list = (items, cls = "") => `<ul${cls ? ` class="${cls}"` : ""}>${items.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>`;
  return `<section class="card about" id="about"><details open><summary><h2>${t("about_h")}</h2></summary>
    <h3>${t("about_sources_h")}</h3>${list(text.ABOUT.sources)}<h3>${t("about_method_h")}</h3>${list(text.ABOUT.method)}
    <h3>${t("about_limits_h")}</h3>${list(text.ABOUT.limits, "limits")}<h3>${t("about_credit_h")}</h3><p>${esc(t("credit"))}</p></details></section>`;
}

/** The whole page inside #app. */
export function renderApp(c) {
  return `<header class="top"><div><h1>${esc(CFG.title)}</h1><p class="tag">${esc(CFG.tagline)}</p></div>
    <button type="button" id="theme" class="btn quiet" data-auto="${t("theme")}: ${t("theme_auto")}" data-light="${t("theme")}: ${t("theme_light")}"
      data-dark="${t("theme")}: ${t("theme_dark")}" data-label="${t("theme")}">${t("theme")}: ${t("theme_auto")}</button></header>
    ${c.notices.map((n) => `<p class="note warn" role="status">${esc(n)}</p>`).join("")}
    ${c.loading ? `<p class="note loading" role="status"><strong>${t("loading_h")}.</strong> ${esc(t("loading"))}</p>` : ""}
    <main>${controlsHtml(c)}${browseHtml(c)}
      <div class="row2"><section class="card mapcard" aria-labelledby="map-heading">${mapCardHtml(c)}</section>${rankingHtml(c)}</div>
      ${placeHtml(c)}${aboutHtml()}</main><footer><p>${esc(t("footer"))}</p></footer>`;
}

export function groupVariables(variables) {
  const groups = [];
  CFG.groupOrder.forEach((g) => { const vars = variables.filter((v) => v.group === g); if (vars.length) groups.push({ name: g, vars }); });
  const added = variables.filter((v) => v.group === CFG.addedGroup);
  if (added.length) groups.push({ name: CFG.addedGroup, vars: added });
  return groups;
}

export { VARIABLES, href };
