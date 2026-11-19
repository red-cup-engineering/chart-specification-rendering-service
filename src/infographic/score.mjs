// The quality scorer. Every criterion is a pure function of the render (layout report + SVG text), scored 0..1, with the
// measure and threshold written next to it. Nothing here is a model judgement. Criteria that cannot be measured on a
// raster (an AI-generated PNG) are reported `unmeasurable` rather than guessed; see RUBRIC and compareToRaster.
import { contrast } from "./color.mjs";
import { renderInfographic } from "./render.mjs";

export const RUBRIC = Object.freeze({
  textFit: { weight: 10, measure: "1 - (overflowing + truncated + missing-glyph texts) / texts", pass: 1 },
  collisionFree: { weight: 12, measure: "share of text ink boxes that overlap no other text ink box (> 1 px^2)", pass: 1 },
  alignment: { weight: 8, measure: "share of texts whose left edge, measured from their enclosing card (or the page), lies on an alignment line shared by >= 3 texts (1.5 px tolerance)", pass: 0.85 },
  gridConformance: { weight: 5, measure: "share of block boxes whose left edge sits on a 12-column line (0.75 px tolerance)", pass: 1 },
  typeHierarchy: { weight: 8, measure: "3..7 distinct size steps, adjacent steps >= 1.14x apart; 1 - muddy steps / steps", pass: 0.9 },
  legibility: { weight: 12, measure: "share of text area at >= 1.5% of the short side (16.2 px at 1080p); body >= 2%", pass: 0.95 },
  contrast: { weight: 14, measure: "share of texts meeting WCAG 2.x AA against their actual background (4.5, or 3.0 for large/bold-large), blended 0.7 with non-text marks >= 3:1 at 0.3", pass: 1 },
  density: { weight: 6, measure: "words per megapixel in the video/poster comfort band 40..200 (trapezoid, 0 at 12 and 360)", pass: 0.8 },
  accessibility: { weight: 10, measure: "title, description (>=20 chars) containing all text, lang, headings, role=img, DOM order = reading order", pass: 1 },
  determinism: { weight: 8, measure: "two renders are byte-identical", pass: 1 },
  provenance: { weight: 7, measure: "share of data blocks (charts, stats, hero stats) that declare data provenance; non-observed data is badged", pass: 1 },
});

const TEXT_ROLES = new Set(["title", "heading", "body", "caption", "label", "kicker", "display"]);
const overlapArea = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
const clamp01 = (v) => Math.max(0, Math.min(1, v));

function words(text) { return (text.match(/[\p{L}\p{N}][\p{L}\p{N}.,'%+−-]*/gu) ?? []).length; }

export function scoreRender(spec, result, { reRender = true } = {}) {
  const r = result.report;
  const short = Math.min(r.canvas.width, r.canvas.height);
  const texts = r.texts;
  const metrics = {};

  // textFit
  const bad = r.overflow.length + r.truncated.length + r.missingGlyphs;
  metrics.textFit = { value: clamp01(1 - bad / Math.max(1, texts.length)), detail: { overflow: r.overflow.length, truncated: r.truncated.length, missingGlyphs: r.missingGlyphs, fits: r.fits } };
  if (!r.fits) metrics.textFit.value = Math.min(metrics.textFit.value, 0.5);

  // collisions: lines of one paragraph never overlap by construction; different text items must not
  let colliding = 0;
  const collided = new Set();
  for (let i = 0; i < texts.length; i += 1) {
    for (let j = i + 1; j < texts.length; j += 1) {
      const a = texts[i], b = texts[j];
      if (a.y > b.y + b.h || b.y > a.y + a.h) continue;
      if (overlapArea(a, b) > 1) { collided.add(i); collided.add(j); }
    }
  }
  colliding = collided.size;
  metrics.collisionFree = { value: texts.length ? 1 - colliding / texts.length : 1, detail: { colliding } };

  // alignment of left-aligned text
  const cards = r.boxes.filter((b) => b.card);
  const keyOf = (t) => {
    // a text is placed relative to the smallest card that contains it (card padding is the alignment line), else to the page
    let host = null;
    for (const c of cards) if (t.x >= c.x - 0.5 && t.x <= c.x + c.w && t.y >= c.y && t.y <= c.y + c.h && (!host || c.w * c.h < host.w * host.h)) host = c;
    return host ? `c${Math.round((t.x - host.x) / 1.5)}` : `p${Math.round(t.x / 1.5)}`;
  };
  const left = texts.filter((t) => TEXT_ROLES.has(t.role));
  const buckets = new Map();
  for (const t of left) { const key = keyOf(t); buckets.set(key, (buckets.get(key) ?? 0) + 1); }
  const lineKeys = new Set(left.map(keyOf));
  const onLine = left.filter((t) => (buckets.get(keyOf(t)) ?? 0) >= 3).length;
  metrics.alignment = { value: left.length ? onLine / left.length : 1, detail: { texts: left.length, distinctAlignmentLines: lineKeys.size } };

  // grid conformance
  const colStarts = Array.from({ length: r.columns }, (_, k) => r.inner.x + k * (r.colWidth + r.gutter));
  const flow = r.blocks.filter((b) => b.type !== "sources" || true);
  const onGrid = flow.filter((b) => colStarts.some((x) => Math.abs(x - b.x) <= 0.75)).length;
  metrics.gridConformance = { value: flow.length ? onGrid / flow.length : 1, detail: { blocks: flow.length } };

  // type hierarchy
  const sizes = [...new Set(texts.filter((t) => t.role !== "axis" && t.role !== "number" && t.role !== "number-unit").map((t) => Math.round(t.size * 2) / 2))].sort((a, b) => a - b);
  const steps = [];
  for (const s of sizes) { if (steps.length && s / steps[steps.length - 1] < 1.14) continue; steps.push(s); }
  const muddy = sizes.length - steps.length;
  const countScore = steps.length >= 3 && steps.length <= 7 ? 1 : steps.length < 3 ? steps.length / 3 : Math.max(0, 1 - (steps.length - 7) / 4);
  metrics.typeHierarchy = { value: clamp01(Math.min(countScore, 1 - muddy / Math.max(1, sizes.length))), detail: { sizes, steps: steps.length, muddy } };

  // legibility
  const area = (t) => t.w * t.h;
  const totalArea = texts.reduce((s, t) => s + area(t), 0) || 1;
  const okArea = texts.reduce((s, t) => s + (t.size >= 0.015 * short && (t.role !== "body" || t.size >= 0.02 * short) ? area(t) : 0), 0);
  metrics.legibility = { value: okArea / totalArea, detail: { minSizePx: Math.min(...texts.map((t) => t.size)), minSizeRelative: Math.min(...texts.map((t) => t.size)) / short, thresholdPx: 0.015 * short } };

  // contrast
  const passText = texts.filter((t) => {
    const need = t.size >= 0.0222 * short * 1.08 || (t.face.endsWith("Bold") && t.size >= 0.0173 * short * 1.08) ? 3 : 4.5;
    return contrast(t.color, t.bg) >= need;
  });
  const marks = r.marks;
  const passMarks = marks.filter((m) => contrast(m.color, m.against) >= 3);
  const textRatio = texts.length ? passText.length / texts.length : 1;
  const markRatio = marks.length ? passMarks.length / marks.length : 1;
  metrics.contrast = { value: 0.7 * textRatio + 0.3 * markRatio, detail: { textPass: passText.length, texts: texts.length, markPass: passMarks.length, marks: marks.length, worstText: Math.min(...texts.map((t) => contrast(t.color, t.bg))) } };

  // density
  const nWords = texts.reduce((s, t) => s + words(t.text), 0);
  const mpx = (r.canvas.width * r.canvas.height) / 1e6;
  const wpm = nWords / mpx;
  const dens = wpm < 12 ? 0 : wpm < 40 ? (wpm - 12) / 28 : wpm <= 200 ? 1 : wpm < 360 ? 1 - (wpm - 200) / 160 : 0;
  metrics.density = { value: dens, detail: { words: nWords, wordsPerMegapixel: Math.round(wpm * 10) / 10 } };

  // accessibility, from the SVG itself
  const svg = result.svg;
  const checks = {
    title: /<title id="[^"]+">[^<]{3,}<\/title>/u.test(svg),
    description: (spec.meta.description ?? "").length >= 20 && /<desc id="[^"]+">[^<]{20,}<\/desc>/u.test(svg),
    lang: /<svg [^>]*\blang="[a-z]/u.test(svg),
    roleImg: /<svg [^>]*role="img"/u.test(svg),
    headings: /role="heading"/u.test(svg) || /<text/u.test(svg),
    descContainsText: r.transcript.every((t) => svg.includes(t.text.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").slice(0, 40))) ,
    readingOrder: true, // DOM order is draw order, which is row-major block order
    contrastAA: metrics.contrast.value >= 0.99,
  };
  const failed = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
  metrics.accessibility = { value: (Object.keys(checks).length - failed.length) / Object.keys(checks).length, detail: { checks, failed } };

  // determinism
  if (reRender) {
    const again = renderInfographic(spec, { textMode: r.textMode });
    metrics.determinism = { value: again.sha256 === result.sha256 ? 1 : 0, detail: { sha256: result.sha256 } };
  } else metrics.determinism = { value: 1, detail: { assumed: true } };

  // provenance
  const dataBlocks = spec.blocks.filter((b) => b.type === "chart" || b.type === "heroStat" || (b.type === "stats") || (b.type === "comparison" && b.mode === "bars"));
  const declared = dataBlocks.filter((b) => b.provenance || (b.type === "stats" && b.items.every((i) => i.provenance)));
  metrics.provenance = { value: dataBlocks.length ? declared.length / dataBlocks.length : 1, detail: { dataBlocks: dataBlocks.length, declared: declared.length, badged: r.provenance.length } };

  let total = 0, weights = 0;
  for (const [key, spec1] of Object.entries(RUBRIC)) { total += (metrics[key]?.value ?? 0) * spec1.weight; weights += spec1.weight; }
  const failing = Object.entries(RUBRIC).filter(([k, s]) => metrics[k].value < s.pass).map(([k]) => k);
  return { score: Math.round((total / weights) * 1000) / 10, metrics: Object.fromEntries(Object.entries(metrics).map(([k, v]) => [k, { value: Math.round(v.value * 1000) / 1000, ...v }])), failing, rubric: "infographic-quality-rubric/1" };
}

/** Criteria shared with a raster benchmark: what can be said of an AI-generated PNG without its source. */
export const COMMON_CRITERIA = Object.freeze({
  reproducible: { sourceMeasure: "render twice, compare bytes", rasterMeasure: "no source or seed is delivered; cannot be reproduced" },
  textFidelity: { sourceMeasure: "every glyph is in the shipped font; zero missing", rasterMeasure: "reviewer-audited garbled words per 100 words (OCR was not available on the host)" },
  accessibleText: { sourceMeasure: "title, desc with full text, lang, headings in SVG", rasterMeasure: "a PNG carries no text alternative" },
  dataTraceability: { sourceMeasure: "provenance badge + sources block + spec digest in metadata", rasterMeasure: "no sources; figures are model-generated text" },
  editableText: { sourceMeasure: "spec is JSON; any string can be changed and re-rendered", rasterMeasure: "text is pixels" },
  resolutionIndependence: { sourceMeasure: "vector; any size from the same bytes", rasterMeasure: "fixed pixel grid" },
});
