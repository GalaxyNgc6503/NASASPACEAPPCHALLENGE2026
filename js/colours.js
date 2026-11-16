// Fill colours for map squares, built only from theme tokens (port of earthwatch/render/colours.py).
// A fill mixes a hue token into --surface-2 with CSS color-mix; the strongest fill is a 50% mix,
// so --text keeps 4.5:1 contrast on every square in both themes.
export const RAMP_MAX = 50.0;
export const FADE = 0.45;
const NEUTRAL = "var(--surface-2)";

const mix = (hue, t) => `color-mix(in srgb, var(${hue}) ${(RAMP_MAX * Math.min(1, Math.max(0, t))).toFixed(1)}%, ${NEUTRAL})`;

/** Single-hue ramp (accent) for values, never confused with the trend colours. */
export const sequential = (t) => mix("--accent", t);

/** --fall below zero, --rise above, a light neutral at zero; a trend that is not significant is faded. */
export function diverging(slope, t, significant) {
  if (slope === 0 || t <= 0) return NEUTRAL;
  return mix(slope > 0 ? "--rise" : "--fall", significant ? t : t * FADE);
}
