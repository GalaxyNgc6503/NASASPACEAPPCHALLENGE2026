// What one page view is drawn from: the NASA data that is ready (or loading), the analysis and
// the pieces the view needs. Pure of the DOM, so tests can run it (port of web.py page_context).
import { CFG } from "./config.js";
import { renderMap } from "./map.js";
import { build } from "./service.js";
import { href } from "./state.js";
import { chartsContext, groupVariables, panLinks, rankingContext, resultContext } from "./view.js";

export function makeContext(state, place, notices, extras) {
  const bundle = build(state, place, extras);
  const v = bundle.var;
  if (state.var !== v.id) state = { ...state, var: v.id };
  const link = (changes = {}, anchor = "") => href(state, changes, { anchor });
  const [status, series, err] = bundle.here.series(v, state.y0, state.y1);

  let mapStatus = "none", mapError = "", map = null;
  if (v.daily) mapStatus = "nomap";
  else if (bundle.grid) {
    mapStatus = bundle.grid.status; mapError = bundle.grid.error;
    if (mapStatus === "ready") {
      map = renderMap(bundle.grid.value, state.mode, state.year, place, bundle.area.towns,
        (pid) => link({ place: pid }, "result"), bundle.area.bounds, state.shade);
    }
  }
  return {
    state, place, notices, var: v, bundle, notice: "", loading: bundle.loading, map, mapStatus, mapError,
    mapReady: !!map, groups: groupVariables(bundle.variables),
    townLinks: CFG.towns.map((tw) => [tw, link({ place: tw.id, view: "" }, "result")]),
    panLinks: panLinks(bundle, link),
    removeLinks: extras.map((x) => [x.code, link({ extras: state.extras.filter((c) => c !== x.code),
      var: state.var === x.id ? CFG.defaultVariable : state.var })]),
    result: resultContext(bundle, series, status, err, state.y0, state.y1),
    ranking: rankingContext(bundle, state.y0, state.y1, link),
    charts: chartsContext(bundle, series, status, state.y0, state.y1),
  };
}
