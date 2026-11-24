// Real font metrics and glyph outlines from the embedded Noto subsets. No canvas, no system fonts, no network:
// widths are advance widths plus GPOS 'kern' pairs, in font units, so the same text measures the same on every host.
import { readFileSync } from "node:fs";

const FONT_DIR = new URL("./fonts/", import.meta.url);

/** The faces the engine ships. A theme names faces, never family strings. */
export const FACES = Object.freeze({
  sans: "NotoSans-Regular",
  sansBold: "NotoSans-Bold",
  sansItalic: "NotoSans-Italic",
  serifBold: "NotoSerif-Bold",
});

const cache = new Map();
const ALIASES = { 0x2212: 0x2013, 0x2009: 0x20, 0x202f: 0x20 };

function parseTables(view) {
  const count = view.getUint16(4);
  const tables = {};
  for (let i = 0; i < count; i += 1) {
    const at = 12 + i * 16;
    const tag = String.fromCharCode(view.getUint8(at), view.getUint8(at + 1), view.getUint8(at + 2), view.getUint8(at + 3));
    tables[tag] = { offset: view.getUint32(at + 8), length: view.getUint32(at + 12) };
  }
  return tables;
}

function parseCmap(view, table) {
  const base = table.offset;
  const subtables = view.getUint16(base + 2);
  let chosen = null;
  for (let i = 0; i < subtables; i += 1) {
    const platform = view.getUint16(base + 4 + i * 8);
    const encoding = view.getUint16(base + 6 + i * 8);
    const offset = view.getUint32(base + 8 + i * 8);
    const format = view.getUint16(base + offset);
    if ((platform === 3 && encoding === 10 && format === 12) || (platform === 3 && encoding === 1 && format === 4 && chosen === null)) chosen = { offset: base + offset, format };
  }
  if (chosen === null) throw new Error("font has no usable Unicode cmap");
  const map = new Map();
  if (chosen.format === 12) {
    const groups = view.getUint32(chosen.offset + 12);
    for (let g = 0; g < groups; g += 1) {
      const at = chosen.offset + 16 + g * 12;
      const start = view.getUint32(at), end = view.getUint32(at + 4), glyph = view.getUint32(at + 8);
      for (let c = start; c <= end; c += 1) map.set(c, glyph + (c - start));
    }
  } else {
    const segX2 = view.getUint16(chosen.offset + 6);
    const endAt = chosen.offset + 14;
    const startAt = endAt + segX2 + 2;
    const deltaAt = startAt + segX2;
    const rangeAt = deltaAt + segX2;
    for (let s = 0; s < segX2 / 2; s += 1) {
      const end = view.getUint16(endAt + s * 2), start = view.getUint16(startAt + s * 2);
      const delta = view.getInt16(deltaAt + s * 2), range = view.getUint16(rangeAt + s * 2);
      for (let c = start; c <= end && c !== 0xffff; c += 1) {
        let glyph;
        if (range === 0) glyph = (c + delta) & 0xffff;
        else {
          const at = rangeAt + s * 2 + range + (c - start) * 2;
          glyph = view.getUint16(at);
          if (glyph !== 0) glyph = (glyph + delta) & 0xffff;
        }
        if (glyph !== 0) map.set(c, glyph);
      }
    }
  }
  return map;
}

const num = (value) => {
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? "0" : String(rounded);
};

/** Parses one TrueType (glyf) font into the interface the engine uses. */
export function parseFont(bytes, kernPairs = {}) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tables = parseTables(view);
  for (const tag of ["head", "hhea", "hmtx", "maxp", "cmap", "loca", "glyf"]) if (!tables[tag]) throw new Error(`font lacks ${tag}`);
  const unitsPerEm = view.getUint16(tables.head.offset + 18);
  const longLoca = view.getInt16(tables.head.offset + 50) === 1;
  const ascent = view.getInt16(tables.hhea.offset + 4), descent = view.getInt16(tables.hhea.offset + 6);
  const hMetrics = view.getUint16(tables.hhea.offset + 34);
  const glyphCount = view.getUint16(tables.maxp.offset + 4);
  let capHeight = Math.round(unitsPerEm * 0.714), xHeight = Math.round(unitsPerEm * 0.536);
  if (tables["OS/2"] && view.getUint16(tables["OS/2"].offset) >= 2) {
    xHeight = view.getInt16(tables["OS/2"].offset + 86);
    capHeight = view.getInt16(tables["OS/2"].offset + 88);
  }
  const cmap = parseCmap(view, tables.cmap);
  const advanceOfGlyph = (glyph) => {
    const index = Math.min(glyph, hMetrics - 1);
    return view.getUint16(tables.hmtx.offset + index * 4);
  };
  const locaOf = (glyph) => (longLoca ? view.getUint32(tables.loca.offset + glyph * 4) : view.getUint16(tables.loca.offset + glyph * 2) * 2);

  // Outline -> contours of {x, y, on}; composite glyphs are flattened.
  function contoursOf(glyph, depth = 0) {
    if (depth > 6 || glyph >= glyphCount) return [];
    const start = locaOf(glyph), end = locaOf(glyph + 1);
    if (start === end) return [];
    let at = tables.glyf.offset + start;
    const contourCount = view.getInt16(at);
    at += 10;
    if (contourCount >= 0) {
      const endPts = [];
      for (let i = 0; i < contourCount; i += 1) { endPts.push(view.getUint16(at)); at += 2; }
      const instructions = view.getUint16(at); at += 2 + instructions;
      const pointCount = contourCount === 0 ? 0 : endPts[contourCount - 1] + 1;
      const flags = [];
      while (flags.length < pointCount) {
        const flag = view.getUint8(at); at += 1;
        flags.push(flag);
        if (flag & 8) { let repeat = view.getUint8(at); at += 1; while (repeat-- > 0) flags.push(flag); }
      }
      const xs = [], ys = [];
      let value = 0;
      for (let i = 0; i < pointCount; i += 1) {
        const f = flags[i];
        if (f & 2) { const d = view.getUint8(at); at += 1; value += f & 16 ? d : -d; } else if (!(f & 16)) { value += view.getInt16(at); at += 2; }
        xs.push(value);
      }
      value = 0;
      for (let i = 0; i < pointCount; i += 1) {
        const f = flags[i];
        if (f & 4) { const d = view.getUint8(at); at += 1; value += f & 32 ? d : -d; } else if (!(f & 32)) { value += view.getInt16(at); at += 2; }
        ys.push(value);
      }
      const contours = [];
      let from = 0;
      for (const last of endPts) {
        const points = [];
        for (let i = from; i <= last; i += 1) points.push({ x: xs[i], y: ys[i], on: (flags[i] & 1) === 1 });
        contours.push(points);
        from = last + 1;
      }
      return contours;
    }
    const out = [];
    for (;;) {
      const flag = view.getUint16(at), component = view.getUint16(at + 2);
      at += 4;
      let dx, dy;
      if (flag & 1) { dx = view.getInt16(at); dy = view.getInt16(at + 2); at += 4; } else { dx = view.getInt8(at); dy = view.getInt8(at + 1); at += 2; }
      if (!(flag & 2)) { dx = 0; dy = 0; }
      let a = 1, b = 0, c = 0, d = 1;
      const f2 = (o) => view.getInt16(o) / 16384;
      if (flag & 8) { a = d = f2(at); at += 2; } else if (flag & 0x40) { a = f2(at); d = f2(at + 2); at += 4; } else if (flag & 0x80) { a = f2(at); b = f2(at + 2); c = f2(at + 4); d = f2(at + 6); at += 8; }
      for (const contour of contoursOf(component, depth + 1)) out.push(contour.map((p) => ({ x: a * p.x + c * p.y + dx, y: b * p.x + d * p.y + dy, on: p.on })));
      if (!(flag & 0x20)) break;
    }
    return out;
  }

  function contourPath(points) {
    // y is flipped so the path draws in SVG's y-down space at scale(size / unitsPerEm).
    const P = (p) => `${num(p.x)} ${num(-p.y)}`;
    const n = points.length;
    if (n === 0) return "";
    let first = points.findIndex((p) => p.on);
    let startPoint;
    let ring;
    if (first === -1) {
      startPoint = { x: (points[0].x + points[n - 1].x) / 2, y: (points[0].y + points[n - 1].y) / 2, on: true };
      ring = points;
    } else {
      startPoint = points[first];
      ring = [...points.slice(first + 1), ...points.slice(0, first)];
    }
    let d = `M${P(startPoint)}`;
    let control = null;
    const quad = (c, to) => { d += `Q${P(c)} ${P(to)}`; };
    for (const p of ring) {
      if (p.on) {
        if (control) { quad(control, p); control = null; } else d += `L${P(p)}`;
      } else if (control) {
        quad(control, { x: (control.x + p.x) / 2, y: (control.y + p.y) / 2 });
        control = p;
      } else control = p;
    }
    if (control) quad(control, startPoint);
    return `${d}Z`;
  }

  const pathCache = new Map();
  // The Debian Noto cut lacks U+2212 MINUS SIGN and U+2009 THIN SPACE; the en dash and a half space stand in for them.
  const resolve = (cp) => (cmap.has(cp) ? cp : ALIASES[cp] ?? cp);
  return {
    unitsPerEm,
    ascent,
    descent,
    capHeight,
    xHeight,
    has: (codepoint) => cmap.has(resolve(codepoint)),
    glyphOf: (codepoint) => cmap.get(resolve(codepoint)) ?? 0,
    advance: (codepoint) => (codepoint === 0x2009 && !cmap.has(0x2009) ? advanceOfGlyph(cmap.get(0x20) ?? 0) / 2 : advanceOfGlyph(cmap.get(resolve(codepoint)) ?? 0)),
    kern: (left, right) => kernPairs[`${resolve(left)}|${resolve(right)}`] ?? 0,
    /** SVG path data of one code point in font units, y-down, or "" for a blank glyph. */
    path(codepoint) {
      if (pathCache.has(codepoint)) return pathCache.get(codepoint);
      const glyph = cmap.get(resolve(codepoint)) ?? 0;
      const d = codepoint === 0x2009 && !cmap.has(0x2009) ? "" : contoursOf(glyph).map(contourPath).join("");
      pathCache.set(codepoint, d);
      return d;
    },
  };
}

/** Loads (once) one shipped face by key from FACES. */
export function loadFace(key) {
  if (cache.has(key)) return cache.get(key);
  const file = FACES[key];
  if (!file) throw new RangeError(`unknown face ${key}; shipped faces are ${Object.keys(FACES).join(", ")}`);
  const bytes = readFileSync(new URL(`${file}.ttf`, FONT_DIR));
  const kern = JSON.parse(readFileSync(new URL(`${file}.kern.json`, FONT_DIR), "utf8")).pairs;
  const font = parseFont(new Uint8Array(bytes), kern);
  if (font.unitsPerEm !== 1000) throw new RangeError(`${key}: the engine's glyph scale assumes 1000 units per em, got ${font.unitsPerEm}`);
  cache.set(key, font);
  return font;
}

/** Advance width of a string in px at `size`, with kerning and optional tracking (em fraction). Also reports missing glyphs. */
export function measureText(faceKey, text, size, tracking = 0) {
  const font = loadFace(faceKey);
  let units = 0;
  let previous = 0;
  let missing = 0;
  let count = 0;
  for (const char of text) {
    const cp = char.codePointAt(0);
    if (cp === 0xad) continue;
    if (!font.has(cp)) missing += 1;
    if (previous) units += font.kern(previous, cp);
    units += font.advance(cp) + tracking * font.unitsPerEm;
    previous = cp;
    count += 1;
  }
  return { width: (units * size) / font.unitsPerEm, missing, count };
}
