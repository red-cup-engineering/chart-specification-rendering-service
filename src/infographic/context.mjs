// The drawing context handed to every block: theme-scaled type roles, text measurement/drawing, cards and chips.
import { wrapText } from "./text.mjs";
import { iconMarkup } from "./icons.mjs";
import { measureText } from "./font.mjs";
import { mix, contrast } from "./color.mjs";

export function makeContext({ scene, theme, u, spec }) {
  const c = theme.color;
  const ctx = {
    scene, theme, u, spec, c,
    px: (v) => v * u,
    space: (key) => theme.space[key] * u,
    /** Scaled type role: { face, size, lineHeight, tracking }. `scale` multiplies the size, `face` replaces it. */
    font(role, { scale = 1, face } = {}) {
      const t = theme.type[role];
      if (!t) throw new RangeError(`unknown type role ${role}`);
      return { face: face ?? t.face, size: t.size * u * scale, lineHeight: t.lineHeight, tracking: t.tracking, role };
    },
    /** Measures a paragraph without drawing. */
    measure(source, role, width, { maxLines = Infinity, scale = 1, face, hyphenate = true } = {}) {
      const f = ctx.font(role, { scale, face });
      const w = wrapText(source, { face: f.face, size: f.size, width, tracking: f.tracking, maxLines, hyphenate });
      const widest = Math.max(0, ...w.lines.map((l) => l.width));
      return { height: w.lines.length * f.size * f.lineHeight, lines: w.lines.length, width: widest, font: f };
    },
    /** Draws a paragraph in a type role; returns the scene's paragraph result. */
    text(source, role, { x, y, width, color = c.ink, align = "left", maxLines = Infinity, scale = 1, face, bg, headingLevel, hyphenate = true, scoreRole } = {}) {
      const f = ctx.font(role, { scale, face });
      return scene.paragraph(source, { x, y, width, face: f.face, size: f.size, lineHeight: f.lineHeight, tracking: f.tracking, color, align, maxLines, role: scoreRole ?? role, bg, headingLevel, hyphenate });
    },
    width(text, role, { scale = 1, face } = {}) {
      const f = ctx.font(role, { scale, face });
      return measureText(f.face, text, f.size, f.tracking).width;
    },
    icon(name, x, y, size, color, strokeWidth) { scene.emit(iconMarkup(name, x, y, size, color, strokeWidth ?? Math.max(1.6, 2))); },
    /** A rounded card; returns the inner box. */
    card(box, { fill = c.surface, border = c.rule, accent, radius = theme.space.radius * u, pad = theme.space.card * u } = {}) {
      scene.rect(box.x, box.y, box.w, box.h, { fill, stroke: border, strokeWidth: Math.max(1, 1.5 * u), rx: radius, box: false });
      if (accent) scene.rect(box.x, box.y + radius, Math.max(4, 6 * u), Math.max(0, box.h - 2 * radius), { fill: accent, rx: 3 * u, box: false });
      scene.report.boxes.push({ x: box.x, y: box.y, w: box.w, h: box.h, fill, card: true, block: scene.blockId });
      return { x: box.x + pad, y: box.y + pad, w: box.w - 2 * pad, h: box.h - 2 * pad, pad };
    },
    /** A pill with text; returns its width. `tone` is a colour token name. */
    chip(label, x, y, { tone = "inkMuted", fill, size = "label", align = "left" } = {}) {
      const f = ctx.font(size);
      const textW = measureText(f.face, label, f.size, f.tracking).width;
      const padX = 0.6 * f.size, h = f.size * 1.75;
      const w = textW + 2 * padX;
      const left = align === "right" ? x - w : x;
      const ink = c[tone] ?? tone;
      const bg = fill ?? mix(ink, c.surface, 0.9);
      scene.rect(left, y, w, h, { fill: bg, stroke: ink, strokeWidth: Math.max(1, 1.2 * u), rx: h / 2, box: false });
      scene.report.boxes.push({ x: left, y, w, h, fill: bg, chip: true, block: scene.blockId });
      scene.onBackground(bg, () => ctx.text(label, size, { x: left + padX, y: y + (h - f.size * f.lineHeight) / 2, width: textW + 2, color: contrast(ink, bg) >= 4.5 ? ink : c.ink }));
      return { w, h, left };
    },
    /** Honest-data badge for non-observed series. */
    provenance(prov, x, y, { align = "left" } = {}) {
      if (!prov || prov.kind === "observed") return null;
      const label = { fixture: "FIXTURE DATA", illustrative: "ILLUSTRATIVE", derived: "DERIVED", model: "MODEL OUTPUT" }[prov.kind] ?? String(prov.kind).toUpperCase();
      return ctx.chip(label, x, y, { tone: prov.kind === "derived" || prov.kind === "model" ? "accent" : "warning", align });
    },
    contrast,
  };
  return ctx;
}
