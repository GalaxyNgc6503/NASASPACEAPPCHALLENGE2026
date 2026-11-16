// NASA POWER's parameter details, downloaded ahead of time into site/data/ (see
// earthwatch/build_static.py) so no visitor has to wait for NASA to send the list.
import { CFG } from "./config.js";

const cache = new Map();

/** {built, rows: [{code, name, units, kind, definition, calculated, inputs, steps}]} for a community. */
export function loadCatalogue(community) {
  const c = CFG.communities.includes(community) ? community : CFG.defaultCommunity;
  if (!cache.has(c)) {
    const p = fetch(new URL(`../data/parameters-${c}.json`, import.meta.url))
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((doc) => ({
        built: doc.built, source: doc.source,
        rows: doc.rows.map((r) => ({ code: r[0], name: r[1], units: r[2], kind: r[3], definition: r[4],
          calculated: !!r[5], inputs: r[6], steps: r[7] })),
      }));
    p.catch(() => cache.delete(c));          // try again next time
    cache.set(c, p);
  }
  return cache.get(c);
}

/** Rows that match every word typed (in the code, name or definition) and the chosen group; best matches first. */
export function searchCatalogue(rows, find = "", kind = "") {
  const words = find.toLowerCase().split(/\s+/).filter(Boolean), q = find.toLowerCase().trim();
  const hits = rows.filter((r) => (!kind || r.kind === kind)
    && words.every((w) => `${r.code} ${r.name} ${r.definition}`.toLowerCase().includes(w)));
  if (!words.length) return hits;
  const score = (r) => (r.code.toLowerCase() === q ? 0 : r.code.toLowerCase().startsWith(q) ? 1 : r.name.toLowerCase().includes(q) ? 2 : 3);
  return hits.map((r, i) => [r, i]).sort((a, b) => score(a[0]) - score(b[0]) || a[1] - b[1]).map((x) => x[0]);
}

/** How many parameters are in each of NASA's groups. */
export function countKinds(rows) {
  const counts = {};
  rows.forEach((r) => { counts[r.kind] = (counts[r.kind] || 0) + 1; });
  return counts;
}
