// Tiny helpers for writing SVG and HTML strings safely (port of earthwatch/render/svg.py).
export const ARROW_UP = "\u25b2";
export const ARROW_DOWN = "\u25bc";

export const esc = (v) => String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** Compact number for coordinates. */
export function n(x) {
  const s = x.toFixed(1);
  return s.endsWith(".0") ? s.slice(0, -2) : s;
}

export function attrs(a) {
  return Object.entries(a).filter(([, v]) => v !== null && v !== undefined && v !== false)
    .map(([k, v]) => `${k}="${esc(typeof v === "number" && !Number.isInteger(v) ? n(v) : v)}"`).join(" ");
}

/** An element as a string. ``body`` is already safe markup. */
export function tag(name, body = "", a = {}) {
  const s = attrs(a);
  const open = s ? `<${name} ${s}` : `<${name}`;
  return body ? `${open}>${body}</${name}>` : `${open}/>`;
}

/** An SVG with a title and a description that screen readers announce. */
export function svgRoot(width, height, uid, title, desc, body, cls = "chart") {
  return `<svg class="${cls}" viewBox="0 0 ${n(width)} ${n(height)}" role="img" aria-labelledby="${esc(uid)}-t ${esc(uid)}-d" `
    + `xmlns="http://www.w3.org/2000/svg"><title id="${esc(uid)}-t">${esc(title)}</title>`
    + `<desc id="${esc(uid)}-d">${esc(desc)}</desc>${body}</svg>`;
}

/** Hatch patterns so categories differ by texture as well as by colour. */
export function patterns(uid) {
  const pat = (name, base, mark) => `<pattern id="${uid}-${name}" width="8" height="8" patternUnits="userSpaceOnUse">`
    + `<rect width="8" height="8" fill="${base}"/>${mark}</pattern>`;
  const stripe = 'stroke="var(--surface)" stroke-width="1.6" opacity=".75"';
  return "<defs>"
    + pat("rise", "var(--rise)", `<path d="M-2 2 L2 -2 M0 8 L8 0 M6 10 L10 6" ${stripe}/>`)
    + pat("fall", "var(--fall)", `<path d="M-2 6 L2 10 M0 0 L8 8 M6 -2 L10 2" ${stripe}/>`)
    + pat("none", "var(--neutral)", '<circle cx="2" cy="2" r="1.1" fill="var(--surface)" opacity=".8"/>'
      + '<circle cx="6" cy="6" r="1.1" fill="var(--surface)" opacity=".8"/>')
    + pat("early", "var(--surface-2)", '<path d="M-2 2 L2 -2 M0 8 L8 0 M6 10 L10 6" stroke="var(--text-muted)" stroke-width="1.2"/>')
    + "</defs>";
}

export function fillFor(direction, uid) {
  const key = { rising: "rise", falling: "fall" }[direction] || "none";
  return `url(#${uid}-${key})`;
}
