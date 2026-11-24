// Numeric helpers for charts: "nice" ticks, linear scales, least squares, and one-dimensional label de-collision.

/** Heckbert-style nice number. */
function nice(range, round) {
  const exp = Math.floor(Math.log10(range));
  const f = range / 10 ** exp;
  let nf;
  if (round) nf = f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10;
  else nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return nf * 10 ** exp;
}

/** Ticks covering [min, max] at about `count` steps. Returns { ticks, min, max, step }. */
export function niceTicks(min, max, count = 5, { extend = true } = {}) {
  if (min === max) { min -= 1; max += 1; }
  const step = nice(nice(max - min, false) / Math.max(1, count - 1), true);
  const lo = extend ? Math.floor(min / step) * step : Math.ceil(min / step) * step;
  const hi = extend ? Math.ceil(max / step) * step : Math.floor(max / step) * step;
  const ticks = [];
  for (let v = lo, i = 0; v <= hi + step / 2 && i < 100; v += step, i += 1) ticks.push(Math.round(v / step) * step);
  const decimals = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
  return { ticks, min: lo, max: hi, step, decimals: Math.min(decimals, 6) };
}

export const linear = (d0, d1, r0, r1) => (v) => r0 + ((v - d0) / (d1 - d0)) * (r1 - r0);

export function ols(points) {
  const n = points.length;
  if (n < 2) return { slope: 0, intercept: points[0]?.[1] ?? 0, n, sxx: 0, meanX: points[0]?.[0] ?? 0, rmse: 0 };
  const meanX = points.reduce((s, p) => s + p[0], 0) / n, meanY = points.reduce((s, p) => s + p[1], 0) / n;
  let sxx = 0, sxy = 0;
  for (const [x, y] of points) { sxx += (x - meanX) ** 2; sxy += (x - meanX) * (y - meanY); }
  const slope = sxy / sxx, intercept = meanY - slope * meanX;
  const sse = points.reduce((s, [x, y]) => s + (y - (intercept + slope * x)) ** 2, 0);
  return { slope, intercept, n, sxx, meanX, rmse: Math.sqrt(sse / Math.max(1, n - 2)) };
}

export function movingAverage(values, window) {
  const half = Math.floor(window / 2);
  return values.map((_, i) => {
    const a = Math.max(0, i - half), b = Math.min(values.length - 1, i + half);
    if (i - half < 0 || i + half > values.length - 1) return null;
    let s = 0;
    for (let k = a; k <= b; k += 1) s += values[k];
    return s / (b - a + 1);
  });
}

/**
 * Pushes labels (each { y, h }) apart along one axis so no two overlap, keeping order and staying inside [lo, hi].
 * Iterative relaxation over a fixed number of passes: deterministic. Returns the adjusted `y` of each, input order.
 */
export function spreadLabels(items, lo, hi, pad = 2) {
  const order = items.map((item, index) => ({ ...item, index })).sort((a, b) => a.y - b.y || a.index - b.index);
  for (let pass = 0; pass < 60; pass += 1) {
    let moved = false;
    for (let i = 1; i < order.length; i += 1) {
      const gap = order[i].y - order[i - 1].y - (order[i].h + order[i - 1].h) / 2 - pad;
      if (gap < -0.01) { order[i - 1].y += gap / 2; order[i].y -= gap / 2; moved = true; }
    }
    for (const item of order) {
      if (item.y - item.h / 2 < lo) item.y = lo + item.h / 2;
      if (item.y + item.h / 2 > hi) item.y = hi - item.h / 2;
    }
    if (!moved) break;
  }
  const out = new Array(items.length);
  for (const item of order) out[item.index] = item.y;
  return out;
}

/** Formats a number with fixed decimals and a true minus sign, thousands grouped by thin space-free commas. */
export function fmt(value, decimals = 0, { sign = false, group = true } = {}) {
  const fixed = Math.abs(value).toFixed(decimals);
  const [whole, frac] = fixed.split(".");
  const grouped = group ? whole.replace(/\B(?=(\d{3})+(?!\d))/gu, ",") : whole;
  const body = frac ? `${grouped}.${frac}` : grouped;
  if (value < 0 && Number(fixed) !== 0) return `−${body}`;
  return sign && Number(fixed) !== 0 ? `+${body}` : body;
}

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
