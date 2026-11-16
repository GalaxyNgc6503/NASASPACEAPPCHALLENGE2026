// The parameter page: one card per NASA POWER parameter, from the list downloaded ahead of time
// (data/parameters-<community>.json). Search with ?find=... and ?kind=...; links keep the explorer's state.
import { countKinds, loadCatalogue, searchCatalogue } from "./catalogue.js";
import { CFG, VARIABLES } from "./config.js";
import { href, parseState } from "./state.js";
import { esc } from "./svg.js";
import * as text from "./text.js";
import { initTheme } from "./theme.js";

const t = text.t;
const CARDS = 40, CARDS_MAX = 400;
const SOURCES_URL = "https://power.larc.nasa.gov/docs/methodology/data/sources/";
const app = document.getElementById("app");

function hidden(state) {
  const h = (n, v) => `<input type="hidden" name="${n}" value="${esc(v)}">`;
  return h("var", state.var) + h("mode", state.mode) + h("place", state.place)
    + (state.extras.length ? h("extras", state.extras.join(",")) : "") + (state.view ? h("view", state.view) : "")
    + (state.shade ? h("shade", "1") : "") + h("y0", state.y0) + h("y1", state.y1) + h("community", state.community);
}

function cardHtml(c, state) {
  const info = text.paramSource(c.kind);
  const letters = c.steps || "M";
  const steps = ["H", "D", "M", "C"].filter((x) => letters.includes(x)).map((x) => text.INTERVAL_NAMES[x]);
  const inputs = c.calculated && c.inputs ? ` ${t("card_calc", { inputs: c.inputs })}` : "";
  const have = VARIABLES.some((v) => v.code === c.code) || state.extras.includes(c.code);
  const full = state.extras.length >= CFG.maxExtras;
  const add = have ? `<span class="badge none">${t("browse_added")}</span>`
    : full ? `<span class="hint">${esc(t("add_too_many", { n: CFG.maxExtras }))}</span>`
    : `<a class="btn" href="${esc(href(state, { extras: [...state.extras, c.code], var: c.code }))}" aria-label="${esc(t("browse_add_label", { name: c.name, code: c.code }))}">${t("browse_add")}</a>`;
  return `<li class="card pcard"><h2>${esc(c.name)}</h2><p class="muted small flush"><code>${esc(c.code)}</code></p><dl>
    <div class="wide2"><dt>${t("card_what")}</dt><dd>${esc(c.definition || c.name)}${esc(inputs)}</dd></div>
    <div class="wide2"><dt>${t("card_source")}</dt><dd>${esc(info.source)}</dd></div>
    <div><dt>${t("card_steps")}</dt><dd>${esc(steps.join(", "))}</dd></div>
    <div><dt>${t("card_resolution")}</dt><dd>${esc(info.resolution)}</dd></div>
    <div><dt>${t("card_starts")}</dt><dd>${esc(info.starts)}</dd></div>
    <div><dt>${t("card_ends")}</dt><dd>${esc(info.ends)}</dd></div>
    <div><dt>${t("card_units")}</dt><dd>${esc(c.units || t("card_nounits"))}</dd></div>
    <div><dt>${t("card_group")}</dt><dd>${esc(text.kindLabel(c.kind))}</dd></div></dl>${add}</li>`;
}

async function render() {
  const q = new URLSearchParams(window.location.search);
  const { state } = parseState(q);
  const find = (q.get("find") || "").split(/\s+/).filter(Boolean).join(" ").slice(0, 60);
  const kind = (q.get("kind") || "").toUpperCase().replace(/[^A-Z0-9_ -]/g, "").slice(0, 40);
  let n = parseInt(q.get("n") || String(CARDS), 10);
  n = Math.min(Math.max(Number.isFinite(n) ? n : CARDS, CARDS), CARDS_MAX);
  const back = href(state, {}, { page: "./" });
  const shell = (inner) => `<header class="top"><div><h1>${t("params_title")}</h1><p class="tag">${esc(t("browse_intro"))}</p></div>
    <div class="row"><a class="btn quiet" href="${esc(back)}">${t("params_back")}</a>
    <button type="button" id="theme" class="btn quiet" data-auto="${t("theme")}: ${t("theme_auto")}" data-light="${t("theme")}: ${t("theme_light")}"
      data-dark="${t("theme")}: ${t("theme_dark")}" data-label="${t("theme")}">${t("theme")}: ${t("theme_auto")}</button></div></header>
    <main id="result" tabindex="-1">${inner}</main><footer><p>${esc(t("footer"))}</p></footer>`;
  app.innerHTML = shell(`<p class="note loading" role="status">${esc(t("params_loading"))}</p>`);
  initTheme.paint();

  let cat;
  try { cat = await loadCatalogue(state.community); } catch (e) {
    app.innerHTML = shell(`<p class="err" role="alert">${esc(t("err_generic"))}</p><p><a class="btn quiet" href="">${t("retry")}</a></p>`);
    initTheme.paint();
    return;
  }
  const counts = countKinds(cat.rows);
  const hits = searchCatalogue(cat.rows, find, kind);
  const shown = hits.slice(0, n);
  const kinds = Object.keys(counts).sort().map((k) => `<option value="${esc(k)}"${k === kind ? " selected" : ""}>${esc(text.kindLabel(k))} (${counts[k]})</option>`).join("");
  let moreHref = "";
  if (hits.length > shown.length) {
    const m = new URLSearchParams(window.location.search);
    m.set("n", String(Math.min(n + CARDS, CARDS_MAX)));
    moreHref = `parameters.html?${m}`;
  }
  const list = shown.length ? `<ul class="pcards">${shown.map((c) => cardHtml(c, state)).join("")}</ul>
    ${moreHref ? `<p><a class="btn quiet" href="${esc(moreHref)}">${t("params_more", { n: Math.min(CARDS, hits.length - shown.length) })}</a></p>` : ""}
    <p class="hint">${esc(t("params_note"))}<a href="${SOURCES_URL}" rel="noopener">${t("params_note_link")}</a>${esc(t("params_note_end"))} List downloaded ${esc(cat.built)}.</p>`
    : `<p class="muted">${esc(t("params_empty"))}</p>`;
  app.innerHTML = shell(`<form class="card controls" method="get" action="parameters.html" aria-label="${esc(t("browse_h"))}">${hidden(state)}
      <div class="field grow"><label for="find">${t("browse_find")}</label><input id="find" name="find" type="text" value="${esc(find)}" placeholder="${esc(t("browse_find_ph"))}" autocomplete="off" maxlength="60"></div>
      <div class="field"><label for="kind">${t("browse_kind")}</label><select id="kind" name="kind"><option value="">${t("browse_kind_all")}</option>${kinds}</select></div>
      <button class="btn" type="submit">${t("browse_go")}</button></form>
    <p class="muted" role="status">${esc(t("browse_count", { shown: shown.length, hits: hits.length, total: cat.rows.length }))}</p>${list}`);
  document.title = `${t("params_title")} \u00b7 ${CFG.title}`;
  initTheme.paint();
}

initTheme.start();
render();
