// The explorer page: reads the URL, asks NASA through service.js, draws with view.js, and wires
// the controls. The page state lives in the link, so every view can be shared and the back button
// works. Nothing is stored except the theme choice (localStorage).
import { loadCatalogue } from "./catalogue.js";
import { CFG, extraVariable } from "./config.js";
import { makeContext } from "./context.js";
import { gridAnalysis, retryFailed, setOnChange } from "./service.js";
import { renderMap } from "./map.js";
import { href, parseState, query } from "./state.js";
import * as text from "./text.js";
import { renderApp } from "./view.js";
import * as proj from "./proj.js";
import { initTheme } from "./theme.js";

const app = document.getElementById("app");
const announce = document.getElementById("announce");
const narrow = window.matchMedia("(max-width: 719px)");
const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
const $ = (id) => document.getElementById(id);

let ctx = null;              // what the page was last drawn from
let token = 0;               // newest render wins
let playTimer = null, renderTimer = null, dragging = false;

// --- drawing ---------------------------------------------------------------------------------

async function render() {
  const mine = ++token;
  const { state: parsed, place, notices } = parseState(new URLSearchParams(window.location.search));
  let state = parsed;
  const extras = [], removed = [];
  if (state.extras.length) {
    try {
      const cat = await loadCatalogue(state.community);
      state.extras.forEach((code) => {
        const row = cat.rows.find((r) => r.code === code);
        if (row) extras.push(extraVariable(row)); else removed.push(code);
      });
    } catch (e) { removed.push(...state.extras); }
    if (mine !== token) return;
    removed.forEach((code) => notices.push(text.t("notice_extra", { code })));
    state = { ...state, extras: extras.map((v) => v.code) };
  }
  ctx = makeContext(state, place, notices, extras);
  paint();
}

/** Put the page on screen, keeping what the visitor was typing and where the focus was. */
function paint() {
  const active = document.activeElement;
  const was = active && app.contains(active) ? { id: active.id, href: active.getAttribute && active.getAttribute("href") } : {};
  const typed = {};
  ["lat", "lon", "find"].forEach((id) => { const el = $(id); if (el && el.value) typed[id] = el.value; });
  app.innerHTML = renderApp(ctx);
  Object.entries(typed).forEach(([id, val]) => { if ($(id)) $(id).value = val; });
  document.title = `${ctx.var.label} around ${ctx.place.name} \u00b7 ${CFG.title}`;
  updateScrollHint();
  initTheme.paint();
  let el = was.id ? $(was.id) : null;
  if (!el && was.href) el = [...app.querySelectorAll("a[href]")].find((a) => a.getAttribute("href") === was.href);
  if (el && el.focus) el.focus({ preventScroll: true });
}

function scheduleRender() {
  if (dragging) return;
  window.clearTimeout(renderTimer);
  renderTimer = window.setTimeout(render, 80);
}
setOnChange(scheduleRender);

function updateScrollHint() {
  const hint = $("scroll-hint"), holder = $("map-holder");
  if (!hint || !holder || !holder.parentElement) return;
  hint.hidden = !(holder.parentElement.scrollWidth > holder.parentElement.clientWidth + 2);
}
window.addEventListener("resize", updateScrollHint);

// --- navigation ---------------------------------------------------------------------------

function stopPlay() {
  if (playTimer) { window.clearInterval(playTimer); playTimer = null; }
  const btn = $("play");
  if (btn) { btn.textContent = btn.getAttribute("data-play"); btn.setAttribute("aria-pressed", "false"); }
}

function go(url, scrollToResult = false) {
  stopPlay();
  window.history.pushState(null, "", url);
  render().then(() => {
    const sentence = $("sentence");
    if (announce && sentence) announce.textContent = sentence.textContent;
    if (scrollToResult && narrow.matches && $("result")) $("result").scrollIntoView({ behavior: reduce.matches ? "auto" : "smooth", block: "start" });
  });
}

window.addEventListener("popstate", () => { stopPlay(); render(); });

document.addEventListener("click", (e) => {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const retry = e.target.closest && e.target.closest("[data-retry]");
  if (retry) { e.preventDefault(); retryFailed(); render(); return; }
  const a = e.target.closest && e.target.closest("a.cellink, a.townlink, .rank a, .chips a, a.inplace");
  if (!a || !app.contains(a)) return;
  const url = a.getAttribute("href") || a.getAttributeNS("http://www.w3.org/1999/xlink", "href");
  if (!url || !url.startsWith("./")) return;
  e.preventDefault();
  go(url, true);
});

/** The form's fields as a clean link: the state they describe, defaults left out. */
function formUrl(form) {
  const params = new URLSearchParams();
  new FormData(form).forEach((val, key) => { if (typeof val === "string" && val.trim() !== "") params.append(key, val.trim()); });
  const { state } = parseState(params);
  const q = query(state);
  return q ? `./?${q}` : "./";
}

document.addEventListener("submit", (e) => {
  const form = e.target;
  if (!form || form.getAttribute("data-inplace") === null) return;
  e.preventDefault();
  go(formUrl($("controls")));
});
document.addEventListener("change", (e) => {
  const el = e.target;
  if (el && el.hasAttribute && el.hasAttribute("data-auto") && $("controls")) go(formUrl($("controls")));
});

// --- year slider and play ---------------------------------------------------------------------

function redrawMap() {
  const slider = $("year"), holder = $("map-holder");
  if (!slider || !holder || !ctx) return;
  const year = parseInt(slider.value, 10);
  $("year-out").textContent = year;
  slider.setAttribute("aria-valuetext", year);
  ctx.state = { ...ctx.state, year };
  const u = new URL(window.location.href);
  u.searchParams.set("year", String(year));
  window.history.replaceState(null, "", u.toString());
  const sec = gridAnalysis(ctx.var, ctx.state.y0, ctx.state.y1, ctx.state.community, ctx.bundle.area.bounds);
  if (sec.status !== "ready") return;
  const link = (changes = {}, anchor = "") => href(ctx.state, changes, { anchor });
  const mv = renderMap(sec.value, ctx.state.mode, year, ctx.place, ctx.bundle.area.towns, (pid) => link({ place: pid }, "result"),
    ctx.bundle.area.bounds, ctx.state.shade);
  holder.innerHTML = mv.svg;
  if ($("map-heading")) $("map-heading").textContent = mv.heading;
  if ($("legend-title")) $("legend-title").textContent = mv.legendTitle;
  updateScrollHint();
}

document.addEventListener("input", (e) => { if (e.target && e.target.id === "year") redrawMap(); });
document.addEventListener("click", (e) => {
  const btn = e.target.closest && e.target.closest("#play"), slider = $("year");
  if (!btn || !slider) return;
  if (playTimer) { stopPlay(); return; }
  if (parseInt(slider.value, 10) >= parseInt(slider.max, 10)) { slider.value = slider.min; redrawMap(); }
  btn.textContent = btn.getAttribute("data-pause");
  btn.setAttribute("aria-pressed", "true");
  playTimer = window.setInterval(() => {
    const s = $("year");
    if (!s) { stopPlay(); return; }
    const next = parseInt(s.value, 10) + 1;
    if (next > parseInt(s.max, 10)) { stopPlay(); return; }
    s.value = String(next);
    redrawMap();
  }, 900);
});

// --- drag the map ---------------------------------------------------------------------------
// Mouse or pen only: on a touch screen a sideways swipe scrolls the map box, so touch users use
// the move buttons. Letting go works out the new centre from the shift and loads the grid around it.
let drag = null, justDragged = false;
document.addEventListener("pointerdown", (e) => {
  if (e.pointerType === "touch" || e.button !== 0 || !e.target.closest) return;
  const holder = e.target.closest("#map-holder");
  const svg = holder && holder.querySelector("svg.mapgrid");
  if (!svg || !svg.querySelector(".pan")) return;
  drag = { holder, svg, pan: svg.querySelector(".pan"), x: e.clientX, y: e.clientY, moved: false, dx: 0, dy: 0 };
});
document.addEventListener("pointermove", (e) => {
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if (!drag.moved && Math.hypot(dx, dy) < 6) return;
  drag.moved = true; dragging = true;
  drag.holder.classList.add("dragging");
  const k = drag.svg.viewBox.baseVal.width / drag.svg.getBoundingClientRect().width;
  drag.dx = dx * k; drag.dy = dy * k;
  drag.pan.setAttribute("transform", `translate(${drag.dx} ${drag.dy})`);
});
function endDrag(e) {
  if (!drag) return;
  const d = drag; drag = null; dragging = false;
  d.holder.classList.remove("dragging");
  if (!d.moved) return;
  justDragged = true;
  window.setTimeout(() => { justDragged = false; }, 50);
  if (e.type === "pointercancel") { d.pan.removeAttribute("transform"); return; }
  const vb = d.svg.viewBox.baseVal;
  const zoom = parseFloat(d.svg.getAttribute("data-zoom")), ox = parseFloat(d.svg.getAttribute("data-ox")), oy = parseFloat(d.svg.getAttribute("data-oy"));
  if (![zoom, ox, oy].every(Number.isFinite)) { d.pan.removeAttribute("transform"); return; }
  const lon = Math.max(-180, Math.min(180, proj.lonOf(ox + vb.width / 2 - d.dx, zoom)));
  const lat = Math.max(-85, Math.min(85, proj.latOf(oy + vb.height / 2 - d.dy, zoom)));
  const u = new URL(window.location.href);
  u.searchParams.set("view", `${lat.toFixed(3)},${lon.toFixed(3)}`);
  u.searchParams.delete("lat"); u.searchParams.delete("lon");
  go(`./${u.search}`);
}
document.addEventListener("pointerup", endDrag);
document.addEventListener("pointercancel", endDrag);
// a drag that ends over a square must not also select it
document.addEventListener("click", (e) => { if (justDragged) { e.preventDefault(); e.stopPropagation(); } }, true);

// --- start -----------------------------------------------------------------------------------

initTheme.start();
render();
