// Theme switch: auto, light or dark. The choice is the one thing stored in this browser
// (localStorage). boot.js applies it before the page is drawn, so nothing flashes.
const order = ["auto", "light", "dark"];
const $ = (id) => document.getElementById(id);

function current() {
  const t = document.documentElement.getAttribute("data-theme");
  return t === "light" || t === "dark" ? t : "auto";
}

function paint() {
  const btn = $("theme");
  if (!btn) return;
  const label = btn.getAttribute(`data-${current()}`);
  btn.textContent = label;
  btn.setAttribute("aria-label", `${btn.getAttribute("data-label")}: ${label}`);
}

function start() {
  // the button is redrawn with the page, so the click is handled from the document
  document.addEventListener("click", (e) => {
    if (!e.target || !e.target.closest || !e.target.closest("#theme")) return;
    const next = order[(order.indexOf(current()) + 1) % order.length];
    if (next === "auto") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", next);
    try {
      if (next === "auto") localStorage.removeItem("ew-theme"); else localStorage.setItem("ew-theme", next);
    } catch (err) { /* storage blocked: the choice lasts until the page closes */ }
    paint();
  });
  paint();
}

export const initTheme = { start, paint };
