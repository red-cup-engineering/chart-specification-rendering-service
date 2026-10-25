// Themes are plain data: colour tokens, a modular type scale, spacing and chart palettes. Every text/background pair a
// theme promises is checked by `checkTheme` (WCAG 2.x), so a theme that ships cannot fail contrast by construction.
import { contrast } from "./color.mjs";

/** Diverging 11-class red/blue ramp (ColorBrewer RdBu, Apache-2.0), cold to warm. */
export const RDBU = Object.freeze(["#053061", "#2166ac", "#4393c3", "#92c5de", "#d1e5f0", "#f7f7f7", "#fddbc7", "#f4a582", "#d6604d", "#b2182b", "#67001f"]);

const base = {
  // type sizes are px at a 1080 px short side; the engine multiplies by canvas.short / 1080 and by the fit scale
  type: {
    hero: { face: "serifBold", size: 168, lineHeight: 1, tracking: -0.01 },
    display: { face: "serifBold", size: 64, lineHeight: 1.08, tracking: -0.005 },
    title: { face: "sansBold", size: 40, lineHeight: 1.14, tracking: 0 },
    heading: { face: "sansBold", size: 30, lineHeight: 1.2, tracking: 0 },
    body: { face: "sans", size: 25, lineHeight: 1.36, tracking: 0 },
    caption: { face: "sans", size: 21, lineHeight: 1.32, tracking: 0 },
    label: { face: "sansBold", size: 18, lineHeight: 1.2, tracking: 0.04 },
    axis: { face: "sans", size: 18, lineHeight: 1.2, tracking: 0 },
    kicker: { face: "sansBold", size: 18, lineHeight: 1.2, tracking: 0.12 },
  },
  space: { unit: 8, gutter: 24, margin: 56, card: 24, radius: 14 },
  stroke: { hairline: 1.5, line: 3.5, mark: 5 },
};

export const THEMES = Object.freeze({
  ledger: Object.freeze({
    name: "ledger",
    ...base,
    color: {
      bg: "#f5f1e8", surface: "#ffffff", surfaceAlt: "#ebe5d6", ink: "#17212b", inkMuted: "#475467", inkOnAccent: "#ffffff",
      rule: "#c9c0ab", accent: "#0b5c9e", accentSoft: "#dbe9f6", accent2: "#b24a00", accent2Soft: "#f7e1cf", positive: "#1d6b3a", negative: "#a3281f", warning: "#8a5a00",
      series: ["#0b5c9e", "#b24a00", "#1d6b3a", "#9b3d78", "#6b5a00", "#4b4b9c"],
      cold: "#2166ac", warm: "#b2182b",
    },
  }),
  night: Object.freeze({
    name: "night",
    ...base,
    color: {
      bg: "#0d1520", surface: "#162233", surfaceAlt: "#1d2d42", ink: "#f3f6fa", inkMuted: "#b4c0cf", inkOnAccent: "#0d1520",
      rule: "#3a4c63", accent: "#6cb6ff", accentSoft: "#1d3a5a", accent2: "#ffa465", accent2Soft: "#4a2f1d", positive: "#6fd08c", negative: "#ff8a80", warning: "#f2c14e",
      series: ["#6cb6ff", "#ffa465", "#6fd08c", "#e79ac8", "#e3cf63", "#a7a7f2"],
      cold: "#6cb6ff", warm: "#ff7b6b",
    },
  }),
});

export const CANVAS_PRESETS = Object.freeze({
  "landscape-16x9": { width: 1920, height: 1080 },
  "portrait-9x16": { width: 1080, height: 1920 },
  "landscape-4k": { width: 3840, height: 2160 },
  "portrait-4k": { width: 2160, height: 3840 },
  square: { width: 1080, height: 1080 },
  "poster-2x3": { width: 1200, height: 1800 },
});

/** Resolves a theme name or a { extends, color, type, space } override object. */
export function resolveTheme(theme = "ledger") {
  if (typeof theme === "string") {
    if (!THEMES[theme]) throw new RangeError(`unknown theme ${theme}; built in: ${Object.keys(THEMES).join(", ")}`);
    return THEMES[theme];
  }
  const parent = THEMES[theme.extends ?? "ledger"];
  if (!parent) throw new RangeError(`unknown theme ${theme.extends}`);
  return {
    ...parent,
    name: theme.name ?? `${parent.name}+`,
    color: { ...parent.color, ...(theme.color ?? {}) },
    type: Object.fromEntries(Object.entries(parent.type).map(([k, v]) => [k, { ...v, ...(theme.type?.[k] ?? {}) }])),
    space: { ...parent.space, ...(theme.space ?? {}) },
    stroke: { ...parent.stroke, ...(theme.stroke ?? {}) },
  };
}

/** Contrast promises of a theme. Returns [{pair, ratio, min, ok}]. Text pairs need 4.5 (7 for muted ink on bg is not required). */
export function checkTheme(theme) {
  const c = theme.color;
  const text = [["ink", "bg"], ["ink", "surface"], ["ink", "surfaceAlt"], ["inkMuted", "bg"], ["inkMuted", "surface"], ["inkMuted", "surfaceAlt"], ["inkOnAccent", "accent"], ["accent", "bg"], ["accent", "surface"], ["accent2", "bg"], ["accent2", "surface"], ["positive", "surface"], ["negative", "surface"], ["warning", "surface"], ["ink", "accentSoft"], ["ink", "accent2Soft"]];
  const graphic = [["accent", "surface"], ["accent2", "surface"], ["rule", "bg"]];
  const rows = [];
  for (const [a, b] of text) rows.push({ pair: `${a}/${b}`, ratio: contrast(c[a], c[b]), min: 4.5 });
  for (const [i, color] of c.series.entries()) rows.push({ pair: `series[${i}]/surface`, ratio: contrast(color, c.surface), min: 3 });
  for (const [a, b] of graphic) if (a !== "rule") rows.push({ pair: `${a}/${b} (graphic)`, ratio: contrast(c[a], c[b]), min: 3 });
  return rows.map((row) => ({ ...row, ok: row.ratio >= row.min }));
}
