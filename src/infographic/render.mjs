// renderInfographic: spec -> { svg, sha256, bytes, report, warnings }. Pure and deterministic: the output is a function of
// the spec alone (no clock, no randomness, no system fonts, no network).
import { CANVAS_PRESETS, resolveTheme } from "./theme.mjs";
import { Scene, esc, n, sha256 } from "./scene.mjs";
import { makeContext } from "./context.mjs";
import { BLOCKS } from "./blocks.mjs";
import { chart } from "./charts.mjs";
import { validateSpec } from "./validate.mjs";
import { plainText } from "./text.mjs";

export const ENGINE_VERSION = "0.2.0";
const PLANNERS = { ...BLOCKS, chart };

/** Stable JSON: object keys sorted, so the digest does not depend on key order. */
export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(",")}}`;
  return JSON.stringify(value);
}

export function resolveCanvas(canvas = {}) {
  const preset = typeof canvas.preset === "string" ? CANVAS_PRESETS[canvas.preset] : null;
  if (typeof canvas.preset === "string" && !preset) throw new RangeError(`unknown canvas preset ${canvas.preset}`);
  const width = canvas.width ?? preset?.width ?? 1920, height = canvas.height ?? preset?.height ?? 1080;
  return { width, height, background: canvas.background ?? "solid", safeArea: canvas.safeArea ?? 0.04, minScale: canvas.minScale ?? 0.9 };
}

function placeRows(blocks, columns) {
  const rows = [];
  let row = null;
  for (const [index, block] of blocks.entries()) {
    const span = Math.min(columns, block.span ?? columns);
    if (!row || row.used + span > columns || block.newRow) { row = { used: 0, items: [] }; rows.push(row); }
    row.items.push({ block, span, index });
    row.used += span;
  }
  return rows;
}

/** Tries scales from 1 downward; returns the largest at which every row's minimum height fits. */
function solve(spec, canvas, theme, textMode, idPrefix) {
  const columns = spec.layout?.columns ?? 12;
  const flow = spec.blocks.filter((b) => b.dock !== "bottom");
  const dock = spec.blocks.filter((b) => b.dock === "bottom");
  const rowsDef = placeRows(flow, columns);
  const u0 = Math.min(canvas.width, canvas.height) / 1080;
  let last = null;
  for (let s = 1; s >= canvas.minScale - 1e-9; s -= 0.02) {
    const scale = Math.round(s * 100) / 100;
    const scene = new Scene({ width: canvas.width, height: canvas.height, theme, textMode, idPrefix, lang: spec.lang ?? "en" });
    const u = u0 * scale;
    const ctx = makeContext({ scene, theme, u, spec });
    const gutter = theme.space.gutter * u;
    const marginX = Math.max(theme.space.margin * u, canvas.safeArea * canvas.width);
    const marginY = Math.max(theme.space.margin * u * 0.8, canvas.safeArea * canvas.height);
    const inner = { x: marginX, y: marginY, w: canvas.width - 2 * marginX, h: canvas.height - 2 * marginY };
    const colW = (inner.w - gutter * (columns - 1)) / columns;
    const planRow = (row) => row.items.map((item) => {
      const w = colW * item.span + gutter * (item.span - 1);
      const planner = PLANNERS[item.block.type];
      if (!planner) throw new RangeError(`unknown block type ${item.block.type}`);
      return { ...item, width: w, plan: planner(ctx, item.block, w) };
    });
    const planned = rowsDef.map((row) => ({ ...row, items: planRow(row) }));
    const dockPlans = dock.map((block) => ({ block, width: inner.w, plan: PLANNERS[block.type](ctx, block, inner.w) }));
    const dockH = dockPlans.reduce((sum, d) => sum + d.plan.ideal, 0) + (dockPlans.length ? gutter : 0);
    const rowMin = planned.map((r) => Math.max(...r.items.map((i) => i.plan.min)));
    const rowIdeal = planned.map((r) => Math.max(...r.items.map((i) => i.plan.ideal)));
    const rowFlex = planned.map((r) => Math.max(...r.items.map((i) => i.plan.flex ?? 0)));
    const gaps = gutter * Math.max(0, planned.length - 1);
    const avail = inner.h - dockH;
    const sumMin = rowMin.reduce((a, b) => a + b, 0) + gaps;
    last = { scale, u, scene, ctx, inner, planned, dockPlans, dockH, rowMin, rowIdeal, rowFlex, gutter, avail, sumMin, colW };
    if (sumMin <= avail + 0.01) return { ...last, fits: true };
  }
  return { ...last, fits: false };
}

function allocate(sol) {
  const { rowMin, rowIdeal, rowFlex, gutter, avail } = sol;
  const gaps = gutter * Math.max(0, rowMin.length - 1);
  let heights = [...rowIdeal];
  const total = heights.reduce((a, b) => a + b, 0) + gaps;
  if (total > avail) {
    const room = total - avail;
    const slack = heights.map((h, i) => h - rowMin[i]);
    const slackSum = slack.reduce((a, b) => a + b, 0);
    heights = heights.map((h, i) => h - (slackSum > 0 ? (room * slack[i]) / slackSum : 0));
  } else if (total < avail) {
    let extra = avail - total;
    const flexSum = rowFlex.reduce((a, b) => a + b, 0);
    if (flexSum > 0) {
      // flexible rows take the surplus first, but no row grows past 1.9x its ideal; the rest opens the gaps (capped), then bottom
      const grown = heights.map((h, i) => h + (extra * rowFlex[i]) / flexSum);
      heights = grown.map((h, i) => Math.min(h, rowIdeal[i] * 1.9));
      extra = avail - (heights.reduce((a, b) => a + b, 0) + gaps);
    }
    sol.gapBonus = rowMin.length > 1 ? Math.min(extra / (rowMin.length - 1), gutter * 1.2) : 0;
  }
  return heights;
}

export function renderInfographic(input, { textMode } = {}) {
  const spec = structuredClone(input);
  const issues = validateSpec(spec);
  if (issues.length) throw new TypeError(`infographic spec is invalid: ${issues.slice(0, 6).map((i) => `${i.path || "/"} ${i.message}`).join("; ")}`);
  const canvas = resolveCanvas(spec.canvas);
  const theme = resolveTheme(spec.theme);
  const specDigest = sha256(canonicalJson(spec));
  const idPrefix = `ig${specDigest.slice(0, 6)}`;
  const mode = textMode ?? spec.canvas?.textMode ?? "outline";
  const sol = solve(spec, canvas, theme, mode, idPrefix);
  const { scene, ctx } = sol;
  const heights = allocate(sol);
  const warnings = [];
  if (!sol.fits) warnings.push(`content needs ${Math.ceil(sol.sumMin)} px but only ${Math.ceil(sol.avail)} px fit at the minimum scale ${sol.scale}; trim content or choose a taller canvas`);

  const columns = spec.layout?.columns ?? 12;
  const gap = sol.gutter + (sol.gapBonus ?? 0);
  let y = sol.inner.y;
  const rowsReport = [];
  sol.planned.forEach((row, r) => {
    const h = heights[r];
    let x = sol.inner.x;
    for (const item of row.items) {
      const box = { x, y, w: item.width, h };
      scene.inBlock(item.block.id ?? `block-${item.index}`, () => item.plan.draw(box));
      rowsReport.push({ block: item.block.id ?? `block-${item.index}`, type: item.block.type, ...box, minHeight: item.plan.min });
      x += item.width + sol.gutter;
    }
    y += h + gap;
  });
  let dy = sol.inner.y + sol.inner.h - sol.dockH + sol.gutter;
  for (const d of sol.dockPlans) {
    const box = { x: sol.inner.x, y: dy, w: d.width, h: d.plan.ideal };
    scene.inBlock(d.block.id ?? "dock", () => d.plan.draw(box));
    rowsReport.push({ block: d.block.id ?? "dock", type: d.block.type, ...box, minHeight: d.plan.min });
    dy += d.plan.ideal;
  }
  if (scene.report.missingGlyphs) warnings.push(`${scene.report.missingGlyphs} character(s) have no glyph in the shipped fonts and render as .notdef`);
  for (const t of scene.report.truncated) warnings.push(`text truncated with an ellipsis in ${t.block}: ${t.text}`);
  for (const o of scene.report.overflow) warnings.push(`text overflows its box in ${o.block} by ${Math.ceil(o.by)} px: ${o.text}`);

  // ---- document ---------------------------------------------------------------------------------------
  const title = spec.meta.title;
  const descParts = [spec.meta.description, ...scene.transcript.map((t) => t.text)].filter(Boolean);
  const desc = `${spec.meta.description}${scene.transcript.length ? ` Text content in reading order: ${scene.transcript.map((t) => t.text).join(" | ")}` : ""}`;
  const head = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${canvas.width} ${canvas.height}" width="${canvas.width}" height="${canvas.height}" role="img" aria-labelledby="${idPrefix}-t" aria-describedby="${idPrefix}-d" lang="${esc(spec.lang ?? "en")}">`,
    `<title id="${idPrefix}-t">${esc(title)}</title>`,
    `<desc id="${idPrefix}-d">${esc(desc)}</desc>`,
    `<metadata>${esc(JSON.stringify({ generator: `chart-specification-rendering-service/infographic ${ENGINE_VERSION}`, spec: `sha256:${specDigest}`, canvas: [canvas.width, canvas.height], scale: sol.scale, theme: theme.name, textMode: mode, fonts: [...scene.report.fonts].sort(), fixtureData: collectProvenance(spec) }))}</metadata>`,
    `<defs>${scene.glyphDefs()}</defs>`,
  ];
  if (canvas.background !== "transparent") head.push(`<rect width="${canvas.width}" height="${canvas.height}" fill="${theme.color.bg}"/>`);
  const svg = `${head.join("\n")}\n${scene.body.join("\n")}\n</svg>\n`;
  const report = {
    engine: ENGINE_VERSION, spec: `sha256:${specDigest}`, canvas, scale: sol.scale, fits: sol.fits, theme: theme.name, textMode: mode,
    inner: sol.inner, columns, colWidth: sol.colW, gutter: sol.gutter, u: sol.u,
    blocks: rowsReport, texts: scene.report.texts, marks: scene.report.marks, boxes: scene.report.boxes,
    missingGlyphs: scene.report.missingGlyphs, truncated: scene.report.truncated, overflow: scene.report.overflow,
    transcript: scene.transcript, provenance: collectProvenance(spec),
  };
  return { svg, sha256: sha256(svg), bytes: Buffer.byteLength(svg, "utf8"), report, warnings, specDigest: `sha256:${specDigest}`, descLength: descParts.join(" ").length };
}

function collectProvenance(spec) {
  return spec.blocks.filter((b) => b.provenance && b.provenance.kind !== "observed").map((b) => ({ block: b.id ?? null, kind: b.provenance.kind, note: b.provenance.note ?? null }));
}

export { plainText, n };
