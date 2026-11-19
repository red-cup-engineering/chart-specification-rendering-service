// The scene: an append-only SVG writer that also keeps the layout report the scorer reads. Text is drawn either as
// outlined glyph <use>s (default: identical in every renderer, no fonts needed) or as live <text>.
import { createHash } from "node:crypto";
import { loadFace } from "./font.mjs";
import { wrapText } from "./text.mjs";
import { contrast } from "./color.mjs";

/** Fixed-precision number, locale-free, never "-0". */
export const n = (value, places = 2) => {
  if (!Number.isFinite(value)) throw new RangeError(`non-finite coordinate ${value}`);
  const k = 10 ** places;
  const rounded = Math.round(value * k) / k;
  return Object.is(rounded, -0) ? "0" : String(rounded);
};

export const esc = (value) => String(value).replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;").replace(/"/gu, "&quot;");

export const sha256 = (text) => createHash("sha256").update(text, "utf8").digest("hex");

const INK_UP = 0.77, INK_DOWN = 0.24;

export class Scene {
  constructor({ width, height, theme, textMode = "outline", idPrefix = "ig", lang = "en" }) {
    this.width = width;
    this.height = height;
    this.theme = theme;
    this.textMode = textMode;
    this.idPrefix = idPrefix;
    this.lang = lang;
    this.body = [];
    this.defs = [];
    this.glyphs = new Map();
    this.counter = 0;
    this.bgStack = [theme.color.bg];
    this.blockStack = [];
    this.report = { texts: [], marks: [], boxes: [], missingGlyphs: 0, truncated: [], overflow: [], fonts: new Set() };
    this.transcript = [];
  }

  nextId(kind) { this.counter += 1; return `${this.idPrefix}-${kind}${this.counter}`; }
  get bg() { return this.bgStack[this.bgStack.length - 1]; }
  get blockId() { return this.blockStack[this.blockStack.length - 1] ?? null; }

  emit(markup) { this.body.push(markup); }

  /** Runs `draw` with `color` as the effective background for text contrast. */
  onBackground(color, draw) { this.bgStack.push(color); try { return draw(); } finally { this.bgStack.pop(); } }
  inBlock(id, draw) { this.blockStack.push(id); try { return draw(); } finally { this.blockStack.pop(); } }

  group(attrs, draw) {
    const a = Object.entries(attrs).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => `${k}="${esc(v)}"`).join(" ");
    this.emit(`<g${a ? ` ${a}` : ""}>`);
    const result = draw();
    this.emit("</g>");
    return result;
  }

  attrs(o) {
    return Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== false).map(([k, v]) => ` ${k}="${typeof v === "number" ? n(v) : esc(v)}"`).join("");
  }

  rect(x, y, w, h, { fill = "none", stroke, strokeWidth, rx, opacity, role, label, box = true, extra = {} } = {}) {
    this.emit(`<rect${this.attrs({ x, y, width: w, height: h, rx, fill, stroke, "stroke-width": stroke ? strokeWidth ?? 1.5 : undefined, opacity, role, "aria-label": label, ...extra })}/>`);
    if (box) this.report.boxes.push({ x, y, w, h, fill, block: this.blockId });
  }

  path(d, { fill = "none", stroke, strokeWidth, opacity, linecap, linejoin, dash, fillRule, extra = {} } = {}) {
    this.emit(`<path${this.attrs({ d, fill, stroke, "stroke-width": stroke ? strokeWidth ?? 1.5 : undefined, opacity, "stroke-linecap": linecap, "stroke-linejoin": linejoin, "stroke-dasharray": dash, "fill-rule": fillRule, ...extra })}/>`);
  }

  line(x1, y1, x2, y2, { stroke, strokeWidth = 1.5, dash, opacity, linecap } = {}) {
    this.emit(`<line${this.attrs({ x1, y1, x2, y2, stroke, "stroke-width": strokeWidth, "stroke-dasharray": dash, opacity, "stroke-linecap": linecap })}/>`);
  }

  circle(cx, cy, r, { fill = "none", stroke, strokeWidth, opacity } = {}) {
    this.emit(`<circle${this.attrs({ cx, cy, r, fill, stroke, "stroke-width": stroke ? strokeWidth ?? 1.5 : undefined, opacity })}/>`);
  }

  /** Records a non-text mark (line, bar, marker) for non-text contrast scoring. */
  mark(kind, color, against = this.bg, extra = {}) { this.report.marks.push({ kind, color, against, block: this.blockId, ...extra }); }

  /**
   * Lays out and draws one paragraph. `y` is the top of the first line box. Returns { height, bottom, lines, width }.
   * `role` feeds the scorer (title, heading, body, caption, label, number). `anchor` picks which edge x names.
   */
  paragraph(source, { x, y, width, face = "sans", size, lineHeight = 1.3, tracking = 0, color, align = "left", maxLines = Infinity, role = "body", hyphenate = true, bg, headingLevel, aria = true }) {
    const wrapped = wrapText(source, { face, size, width, tracking, maxLines, hyphenate });
    const lh = size * lineHeight;
    const font = loadFace(face);
    this.report.fonts.add(face);
    this.report.missingGlyphs += wrapped.missing;
    if (wrapped.truncated) this.report.truncated.push({ block: this.blockId, text: String(source).slice(0, 60) });
    const background = bg ?? this.bg;
    const plain = wrapped.lines.map((line) => line.runs.map((run) => run.text).join("")).join(" ");
    if (plain === "") return { height: 0, bottom: y, lines: 0, width: 0 };
    const capH = (font.capHeight / font.unitsPerEm) * size;
    const k = size / font.unitsPerEm;
    const lineMarkup = [];
    const widths = [];
    wrapped.lines.forEach((line, index) => {
      const top = y + index * lh;
      const baseline = top + lh / 2 + capH / 2;
      const lineX = align === "center" ? x + (width - line.width) / 2 : align === "right" ? x + width - line.width : x;
      widths.push(line.width);
      if (line.width > width + 0.5) this.report.overflow.push({ block: this.blockId, text: plain.slice(0, 60), by: line.width - width });
      const numeric = role === "number" || role === "number-unit" || role === "axis";
      const inkTop = numeric ? (capH + size * 0.02) : size * INK_UP, inkH = numeric ? capH + size * 0.04 : size * (INK_UP + INK_DOWN);
      this.report.texts.push({ x: lineX, y: baseline - inkTop, w: line.width, h: inkH, baseline, size, face, color, bg: background, role, block: this.blockId, text: line.runs.map((r) => r.text).join(""), container: { x, w: width } });
      if (this.textMode === "live") lineMarkup.push(this.liveLine(line, lineX, baseline, size, tracking, color));
      else lineMarkup.push(this.outlineLine(line, lineX, baseline, size, tracking, color));
    });
    this.transcript.push({ role, text: plain, block: this.blockId });
    if (aria === false) this.emit(`<g aria-hidden="true">${lineMarkup.join("")}</g>`);
    else if (headingLevel) this.emit(`<g role="heading" aria-level="${headingLevel}" aria-label="${esc(plain)}">${lineMarkup.join("")}</g>`);
    else if (this.textMode === "live") this.emit(`<g>${lineMarkup.join("")}</g>`);
    else this.emit(`<g role="img" aria-label="${esc(plain)}">${lineMarkup.join("")}</g>`);
    return { height: wrapped.lines.length * lh, bottom: y + wrapped.lines.length * lh, lines: wrapped.lines.length, width: Math.max(0, ...widths) };
  }

  outlineLine(line, x, baseline, size, tracking, color) { return this.offsetRuns(line, x, baseline, size, tracking, color); }

  offsetRuns(line, x, baseline, size, tracking, color) {
    let out = `<g transform="translate(${n(x)} ${n(baseline)}) scale(${n(size / 1000, 5)})" fill="${color}">`;
    let offset = 0;
    for (const run of line.runs) {
      const font = loadFace(run.face);
      let pen = 0, previous = 0;
      const uses = [];
      for (const char of run.text) {
        const cp = char.codePointAt(0);
        if (previous) pen += font.kern(previous, cp);
        const d = font.path(cp);
        if (d !== "") {
          const id = `${this.idPrefix}-${run.face}-${cp.toString(36)}`;
          if (!this.glyphs.has(id)) this.glyphs.set(id, { face: run.face, d });
          uses.push(`<use href="#${id}" x="${n(offset + pen, 0)}"/>`);
        }
        pen += font.advance(cp) + tracking * font.unitsPerEm;
        previous = cp;
      }
      offset += pen;
      out += uses.join("");
    }
    return `${out}</g>`;
  }

  liveLine(line, x, baseline, size, tracking, color) {
    const family = (face) => (face.startsWith("serif") ? "'Noto Serif', Georgia, serif" : "'Noto Sans', 'Helvetica Neue', Arial, sans-serif");
    const spans = line.runs.map((run) => `<tspan font-family="${family(run.face)}" font-weight="${run.face.endsWith("Bold") ? 700 : 400}" font-style="${run.face === "sansItalic" ? "italic" : "normal"}">${esc(run.text)}</tspan>`).join("");
    return `<text x="${n(x)}" y="${n(baseline)}" font-size="${n(size)}" fill="${color}"${tracking ? ` letter-spacing="${n(tracking * size)}"` : ""} xml:space="preserve">${spans}</text>`;
  }

  /** The glyph <defs>, sorted for determinism. */
  glyphDefs() {
    return [...this.glyphs.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([id, g]) => `<path id="${id}" d="${g.d}"/>`).join("");
  }
}

/** Contrast of a drawn text against the background the scene believed it sat on. */
export const textContrast = (t) => contrast(t.color, t.bg);
