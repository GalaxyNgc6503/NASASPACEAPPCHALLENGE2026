// Trend statistics: Sen's slope, Mann-Kendall test and the 95% interval of the slope.
// A line-by-line port of earthwatch/stats.py. Pure functions, no DOM, no network.

const Z_975 = 1.959963984540054; // inverse normal CDF at 0.975 (alpha = 0.05, two-sided)

/** Complementary error function, accurate to about 1e-13. */
export function erfc(x) {
  if (x < 0) return 2 - erfc(-x);
  if (x < 2.5) {
    // Taylor series of erf
    let term = x, sum = x;
    for (let n = 1; n < 80; n++) {
      term *= -x * x / n;
      const add = term / (2 * n + 1);
      sum += add;
      if (Math.abs(add) < 1e-17) break;
    }
    return 1 - (2 / Math.sqrt(Math.PI)) * sum;
  }
  // continued fraction, evaluated from the tail: x + (1/2)/(x + (2/2)/(x + (3/2)/(x + ...)))
  let k = x;
  for (let n = 80; n >= 1; n--) k = x + (n / 2) / k;
  return Math.exp(-x * x) / (Math.sqrt(Math.PI) * k);
}

export const twoSidedP = (z) => erfc(Math.abs(z) / Math.SQRT2);

export function median(values) {
  const xs = [...values].sort((a, b) => a - b);
  const n = xs.length;
  if (!n) throw new Error("median of nothing");
  return n % 2 ? xs[(n - 1) / 2] : (xs[n / 2 - 1] + xs[n / 2]) / 2;
}

/** q-th percentile (0 to 100) by linear interpolation between closest ranks. */
export function percentile(values, q) {
  if (!values.length) throw new Error("percentile of an empty list");
  const xs = [...values].sort((a, b) => a - b);
  const pos = (xs.length - 1) * q / 100;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  if (lo === hi) return xs[lo];
  return xs[lo] + (xs[hi] - xs[lo]) * (pos - lo);
}

export function summarize(xs, ys) {
  if (!ys.length) return null;
  let iMin = 0, iMax = 0;
  ys.forEach((y, i) => { if (y < ys[iMin]) iMin = i; if (y > ys[iMax]) iMax = i; });
  const n = ys.length;
  const mean = ys.reduce((a, b) => a + b, 0) / n;
  const sd = n > 1 ? Math.sqrt(ys.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : null;
  return { n, mean, median: median(ys), minimum: ys[iMin], minimumX: xs[iMin],
    maximum: ys[iMax], maximumX: xs[iMax], sd };
}

export function pairwiseSlopes(xs, ys) {
  const out = [];
  for (let i = 0; i < xs.length - 1; i++) {
    for (let j = i + 1; j < xs.length; j++) {
      const dx = xs[j] - xs[i];
      if (dx !== 0) out.push((ys[j] - ys[i]) / dx);
    }
  }
  return out;
}

export function mannKendall(ys) {
  const n = ys.length;
  let s = 0;
  for (let i = 0; i < n - 1; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = ys[j] - ys[i];
      s += (d > 0) - (d < 0);
    }
  }
  const counts = new Map();
  ys.forEach((y) => counts.set(y, (counts.get(y) || 0) + 1));
  let tie = 0;
  counts.forEach((t) => { if (t > 1) tie += t * (t - 1) * (2 * t + 5); });
  const varS = (n * (n - 1) * (2 * n + 5) - tie) / 18;
  let z;
  if (varS <= 0 || s === 0) z = 0;
  else if (s > 0) z = (s - 1) / Math.sqrt(varS);
  else z = (s + 1) / Math.sqrt(varS);
  return { s, varS, z, p: twoSidedP(z) };
}

function atRank(sorted, rank) {
  const n = sorted.length;
  rank = Math.min(Math.max(rank, 1), n);
  const i = Math.floor(rank);
  const frac = rank - i;
  const lo = sorted[i - 1];
  const hi = sorted[Math.min(i, n - 1)];
  return lo + (hi - lo) * frac;
}

/** Two-sided 95% interval of the true slope from the ordered pairwise slopes (Sen 1968, Gilbert 1987). */
export function slopeCi(slopes, varS) {
  const ordered = [...slopes].sort((a, b) => a - b);
  const c = Z_975 * Math.sqrt(Math.max(varS, 0));
  const m1 = (ordered.length - c) / 2;
  const m2 = (ordered.length + c) / 2;
  return [atRank(ordered, m1), atRank(ordered, m2 + 1)];
}

/**
 * Sen's slope with its interval and the Mann-Kendall test. Returns null when there are fewer
 * than ``minYears`` values, because no honest significance statement is possible.
 */
export function trend(xs, ys, minYears = 10, alpha = 0.05) {
  const n = ys.length;
  if (n < Math.max(minYears, 3) || n !== xs.length) return null;
  const slopes = pairwiseSlopes(xs, ys);
  const slope = median(slopes);
  const intercept = median(ys.map((y, i) => y - slope * xs[i]));
  const mk = mannKendall(ys);
  const [lo, hi] = slopeCi(slopes, mk.varS);
  const tr = {
    n, xFirst: Math.min(...xs), xLast: Math.max(...xs), slope, intercept, lo, hi,
    s: mk.s, z: mk.z, p: mk.p, significant: mk.p < alpha,
  };
  tr.direction = !tr.significant ? "none" : tr.s > 0 ? "rising" : "falling";
  tr.perDecade = slope * 10;
  tr.loDecade = lo * 10;
  tr.hiDecade = hi * 10;
  tr.xMid = (tr.xFirst + tr.xLast) / 2;
  tr.line = (x) => intercept + slope * x;
  tr.band = (x) => {
    const yMid = tr.line(tr.xMid);
    const a = yMid + lo * (x - tr.xMid);
    const b = yMid + hi * (x - tr.xMid);
    return a <= b ? [a, b] : [b, a];
  };
  return tr;
}

/** Equal first and second halves; the middle value of an odd count is left out. */
export function splitHalves(xs, ys) {
  const n = ys.length, h = Math.floor(n / 2);
  return [xs.slice(0, h), ys.slice(0, h), xs.slice(n - h), ys.slice(n - h)];
}

/** Shared equal-width bins for two groups: edges, counts of a, counts of b. */
export function histogram(a, b, bins) {
  const all = [...a, ...b];
  if (!all.length) return [[], [], []];
  const k = bins || Math.max(4, Math.min(8, Math.round(Math.sqrt(all.length))));
  const lo = Math.min(...all);
  let hi = Math.max(...all);
  if (hi === lo) hi = lo + 1;
  const width = (hi - lo) / k;
  const edges = Array.from({ length: k + 1 }, (_, i) => lo + i * width);
  const count = (vals) => {
    const out = new Array(k).fill(0);
    vals.forEach((v) => { out[Math.min(Math.floor((v - lo) / width), k - 1)]++; });
    return out;
  };
  return [edges, count(a), count(b)];
}
