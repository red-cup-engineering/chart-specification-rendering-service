// sRGB colour arithmetic for the infographic engine: WCAG 2.x relative luminance and contrast, mixing, and
// diverging/sequential ramps. Pure and table-free; matches web-theming-service's contrast definition.

export function parseHex(hex) {
  const match = /^#([0-9a-f]{6})$/iu.exec(String(hex));
  if (!match) throw new TypeError(`colour must be #RRGGBB, got ${JSON.stringify(hex)}`);
  const n = Number.parseInt(match[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export const toHex = (rgb) => `#${rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("")}`;

export function luminance(hex) {
  const [r, g, b] = parseHex(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.x contrast ratio, 1..21. */
export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

export function mix(a, b, t) {
  const [p, q] = [parseHex(a), parseHex(b)];
  return toHex(p.map((v, i) => v + (q[i] - v) * t));
}

/** Piecewise-linear ramp through `stops` (hex array) at t in 0..1. */
export function ramp(stops, t) {
  const clamped = Math.max(0, Math.min(1, t));
  const scaled = clamped * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(scaled));
  return mix(stops[i], stops[i + 1], scaled - i);
}

/** The better of two inks on a background by contrast ratio. */
export function readableOn(background, light, dark) {
  return contrast(background, light) >= contrast(background, dark) ? light : dark;
}
