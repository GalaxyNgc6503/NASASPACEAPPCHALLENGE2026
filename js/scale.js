// Axis ticks, linear scales and colour strengths (port of earthwatch/render/scale.py).
export function niceStep(span, target = 5) {
  const raw = span / Math.max(target, 1);
  if (raw <= 0 || !Number.isFinite(raw)) return 1;
  const mag = 10 ** Math.floor(Math.log10(raw));
  for (const m of [1, 2, 5, 10]) if (raw <= m * mag * 1.0000001) return m * mag;
  return 10 * mag;
}

const round10 = (x) => Math.round(x * 1e10) / 1e10;

export function niceTicks(lo, hi, target = 5) {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [[0, 1], 1];
  if (hi < lo) [lo, hi] = [hi, lo];
  if (hi === lo) { const pad = Math.abs(lo) * 0.05 || 1; lo -= pad; hi += pad; }
  const step = niceStep(hi - lo, target);
  const start = Math.floor(lo / step + 1e-9) * step;
  const ticks = [];
  for (let v = start; v <= hi + step * 1e-6; v += step) ticks.push(round10(v));
  if (ticks[ticks.length - 1] < hi - 1e-9) ticks.push(round10(ticks[ticks.length - 1] + step));
  return [ticks, step];
}

export const tickDecimals = (step) => (step <= 0 ? 0 : Math.max(0, Math.min(6, -Math.floor(Math.log10(step) + 1e-9))));

export function yearTicks(y0, y1) {
  const span = y1 - y0;
  const step = span <= 12 ? 2 : span <= 30 ? 5 : 10;
  const ticks = [];
  for (let y = Math.ceil(y0 / step) * step; y <= y1; y += step) ticks.push(y);
  return ticks.length ? ticks : [y0, y1];
}

export function linear(d0, d1, r0, r1) {
  if (d1 === d0) { const mid = (r0 + r1) / 2; return () => mid; }
  const k = (r1 - r0) / (d1 - d0);
  return (v) => r0 + (v - d0) * k;
}

export const strength = (value, lo, hi) => (hi === lo ? 0.5 : Math.min(1, Math.max(0, (value - lo) / (hi - lo))));
