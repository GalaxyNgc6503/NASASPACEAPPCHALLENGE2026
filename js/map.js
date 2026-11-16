// The map: OpenStreetMap tiles with the NASA grid drawn over them, the value or the trend printed
// inside each square (port of earthwatch/render/map.py).
//
// * Squares are outlines with a number inside. With "shade" on they are also filled (60%) from the
//   colour scale, so the tiles still show through.
// * Trend mode: two-colour scale (--fall to --rise) around a neutral zero. A trend that is not
//   significant is a muted number. Significant squares carry an up or down arrow, so colour is
//   never the only cue.
// * Value mode: a single-hue ramp (--accent) on a scale fixed across all years.
// * Every square is a link with a full text label.
// The map uses Web Mercator, like the tiles, so the squares sit exactly on the real places.
import * as colours from "./colours.js";
import * as fmt from "./fmt.js";
import * as proj from "./proj.js";
import { strength } from "./scale.js";
import { ARROW_DOWN, ARROW_UP, attrs, esc, n, tag } from "./svg.js";
import * as text from "./text.js";

const SIDE = 62.5;       // drawing units for the smaller side of a square
const TARGET_PX = 44;    // smallest square on screen, from the theme
const TILE_URL = (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
const MAX_TILES = 90;

/** lon_min, lon_max, lat_min, lat_max of the drawing: the request box and every square. */
export function frameFor(b, grid) {
  return [Math.min(b.lonMin, grid.lons[0] - grid.dlon / 2), Math.max(b.lonMax, grid.lons[grid.lons.length - 1] + grid.dlon / 2),
    Math.min(b.latMin, grid.lats[0] - grid.dlat / 2), Math.max(b.latMax, grid.lats[grid.lats.length - 1] + grid.dlat / 2)];
}

const valueDecimals = (an) => (an.var.decimals !== null && an.var.decimals !== undefined ? an.var.decimals : fmt.decimalsForRange(an.valueMin, an.valueMax));
const trendDecimals = (an) => (an.trendMax ? fmt.decimalsFor(an.trendMax, 2, 3) : 1);
const unitOrScale = (u) => u || "0\u20131 scale";

/** Map zoom (fractional) at which the smaller side of a square is about SIDE units. */
function zoomFor(grid, latMin, latMax) {
  const mid = (latMin + latMax) / 2 * Math.PI / 180;
  const smallerDeg = Math.min(grid.dlon, grid.dlat / Math.max(Math.cos(mid), 0.05));
  return Math.log2(SIDE / smallerDeg * 360 / 256);
}

function tiles(lonMin, lonMax, latMin, latMax, zoom, ox, oy) {
  let zt = Math.min(Math.max(Math.ceil(zoom), 0), 19), nWorld, tx0, tx1, ty0, ty1;
  for (;;) {
    nWorld = 2 ** zt;
    tx0 = Math.floor(proj.xOf(lonMin, zt) / 256); tx1 = Math.floor(proj.xOf(lonMax, zt) / 256);
    ty0 = Math.max(Math.floor(proj.yOf(latMax, zt) / 256), 0);
    ty1 = Math.min(Math.floor(proj.yOf(latMin, zt) / 256), nWorld - 1);
    if ((tx1 - tx0 + 1) * (ty1 - ty0 + 1) <= MAX_TILES || zt <= 0) break;
    zt--;
  }
  const size = 256 * 2 ** (zoom - zt), out = [];
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      out.push(tag("image", "", { href: TILE_URL(zt, ((tx % nWorld) + nWorld) % nWorld, ty), x: tx * size - ox, y: ty * size - oy,
        width: size + 0.6, height: size + 0.6, class: "tile", "aria-hidden": "true" }));
    }
  }
  return out.join("");
}

function legendItems(mode, vmin, vmax, vdec, tmax, tdec) {
  const items = [];
  if (mode === "value") {
    for (let i = 0; i < 5; i++) {
      const t = i / 4;
      items.push({ css: colours.sequential(t), label: fmt.num(vmin + (vmax - vmin) * t, vdec) });
    }
    return items;
  }
  for (let i = -3; i <= 3; i++) {
    items.push({ css: colours.diverging(i, Math.abs(i) / 3, true),
      label: Math.abs(i) === 3 ? fmt.num(tmax * i / 3, tdec, { signed: true }) : i === 0 ? "0" : "" });
  }
  return items;
}

/** Draw the grid. ``link(placeId)`` gives the URL that selects a place. */
export function renderMap(an, mode, year, place, towns, link, bounds, shade = false) {
  const v = an.var, unit = fmt.prettyUnit(v.unit), decadeU = text.decadeUnitText(v.unit).trim();
  const vdec = valueDecimals(an), tdec = trendDecimals(an);
  const [lonMin, lonMax, latMin, latMax] = frameFor(bounds, an.grid);
  const zoom = zoomFor(an.grid, latMin, latMax);
  const ox = proj.xOf(lonMin, zoom), oy = proj.yOf(latMax, zoom);
  const width = proj.xOf(lonMax, zoom) - ox, height = proj.yOf(latMin, zoom) - oy;
  const tmax = an.trendMax || 1, vmin = an.valueMin, vmax = an.valueMax;
  const halfLat = an.grid.dlat / 2, halfLon = an.grid.dlon / 2;
  const xy = (lat, lon) => [proj.xOf(lon, zoom) - ox, proj.yOf(lat, zoom) - oy];
  const box = (lat, lon) => {
    const [x0, y0] = xy(lat + halfLat, lon - halfLon), [x1, y1] = xy(lat - halfLat, lon + halfLon);
    return [x0, y0, x1 - x0, y1 - y0];
  };
  const r4 = (x) => Math.round(x * 1e4) / 1e4;
  const selected = an.grid.cellAt(place.lat, place.lon);

  const cellsSvg = [], table = [];
  let smallest = SIDE;
  [...an.cells.entries()].sort((a, b) => {
    const [alat, alon] = a[0].split("|").map(Number), [blat, blon] = b[0].split("|").map(Number);
    return blat - alat || alon - blon;
  }).forEach(([key, c]) => {
    const [lat, lon] = key.split("|").map(Number);
    const [bx, by, cw, ch] = box(lat, lon);
    smallest = Math.min(smallest, cw, ch);
    const cx = bx + cw / 2, cy = by + ch / 2;
    const val = c.values[year] ?? null, tr = c.trend;
    const direction = tr ? tr.direction : "none";
    let fill, shown, cls;
    if (!c.hasValues || (mode === "value" && val === null) || (mode === "trend" && !tr)) {
      fill = "var(--nodata)"; shown = null; cls = "cell nodata";
    } else if (mode === "value") {
      fill = colours.sequential(strength(val, vmin, vmax)); shown = fmt.num(val, vdec); cls = "cell";
    } else {
      fill = colours.diverging(tr.perDecade, Math.abs(tr.perDecade) / tmax, tr.significant);
      shown = fmt.num(tr.perDecade, tdec, { signed: true }); cls = "cell";
    }
    if (shade) cls += " shade";
    const arrow = direction === "rising" ? ARROW_UP : direction === "falling" ? ARROW_DOWN : "";
    const name = `Square centred ${fmt.fmtLat(lat)}, ${fmt.fmtLon(lon)}`;
    const valueText = val !== null ? `${fmt.num(val, vdec)} ${unit}`.trim() : null;
    const trendText = c.hasValues ? text.trendPhrase(tr, v.unit, an.y0, an.y1, tdec) : null;
    const label = text.cellLabel(name, v.subject, mode, year, valueText, trendText);
    const href = link(`${+lat.toFixed(4)},${+lon.toFixed(4)}`);
    let inner = tag("rect", "", { x: bx, y: by, width: cw, height: ch, class: cls, style: shade ? `fill:${fill}` : null });
    const sig = !!(tr && tr.significant && mode === "trend");
    const vcls = "cv" + (mode === "value" || sig ? "" : " ns");
    if (shown === null) inner += tag("text", "\u2013", { x: cx, y: cy + 6, class: "cv ns", "text-anchor": "middle", "aria-hidden": "true" });
    else {
      if (arrow && sig) inner += tag("text", arrow, { x: cx, y: cy - 6, class: "ca " + (direction === "rising" ? "rise" : "fall"), "text-anchor": "middle", "aria-hidden": "true" });
      inner += tag("text", esc(shown), { x: cx, y: cy + (arrow && sig ? 17 : 6), class: vcls, "text-anchor": "middle", "aria-hidden": "true" });
    }
    cellsSvg.push(tag("a", inner, { href, "aria-label": label, class: "cellink" }));
    table.push({ label: `${fmt.fmtLat(lat)}, ${fmt.fmtLon(lon)}`, value: val !== null ? fmt.num(val, vdec) : "\u2013",
      trend: tr ? fmt.num(tr.perDecade, tdec, { signed: true }) : "\u2013",
      result: text.t(text.badgeKey(tr, c.hasValues)), href });
  });

  let overlay = "";
  if (selected) {
    const [bx, by, cw, ch] = box(r4(selected.lat), r4(selected.lon));
    overlay = tag("rect", "", { x: bx + 1, y: by + 1, width: cw - 2, height: ch - 2, class: "selected", fill: "none" });
  }
  const townSvg = towns.map((tw) => {
    const [tx, ty] = xy(tw.lat, tw.lon);
    const pillW = tw.name.length * 10.2 + 16;
    const flip = tx + 14 + pillW > width;
    const px = flip ? tx - 14 - pillW : tx + 14;
    const name = tag("rect", "", { x: px, y: ty - 14, width: pillW, height: 28, rx: 6, class: "tbg" })
      + tag("text", esc(tw.name), { x: px + 8, y: ty + 6, class: "tn" });
    const marker = tag("circle", "", { cx: tx, cy: ty, r: 30, class: "hit" })
      + tag("circle", "", { cx: tx, cy: ty, r: 7, class: "town" + (place.id === tw.id ? " on" : "") })
      + `<g class="tl" aria-hidden="true">${name}</g>`;
    return tag("a", marker, { href: link(tw.id), "aria-label": `Town: ${tw.name}`, class: "townlink" });
  });

  const heading = mode === "trend" ? text.t("map_trend_h", { subject: v.subject }) : text.t("map_value_h", { subject: v.subject, year });
  const svg = `<svg ${attrs({ class: "mapgrid", viewBox: `0 0 ${n(width)} ${n(height)}`, role: "group", "aria-label": heading,
    "data-zoom": zoom.toFixed(5), "data-ox": ox.toFixed(2), "data-oy": oy.toFixed(2) })} xmlns="http://www.w3.org/2000/svg">`
    + tag("rect", "", { x: 0, y: 0, width, height, class: "frame", rx: 4 })
    + `<g class="pan"><g class="tiles">${tiles(lonMin, lonMax, latMin, latMax, zoom, ox, oy)}</g>`
    + cellsSvg.join("") + overlay + townSvg.join("") + "</g></svg>";
  return {
    svg, legend: legendItems(mode, vmin, vmax, vdec, tmax, tdec),
    legendTitle: mode === "trend" ? text.t("legend_trend", { unit: unitOrScale(decadeU) }) : text.t("legend_value", { year, unit: unitOrScale(unit) }),
    table, heading, minWidth: Math.round(width * TARGET_PX / smallest), faded: colours.diverging(1, 1, false),
  };
}
