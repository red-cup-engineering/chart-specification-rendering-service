// Chart block: line, anomalyBars, stripes, fan, bars. Axis gutters come from measured tick-label widths, direct labels
// are de-collided, and annotations are placed by trying candidate positions against already-placed labels and the data.
import { RDBU } from "./theme.mjs";
import { ramp, mix } from "./color.mjs";
import { niceTicks, linear, ols, movingAverage, spreadLabels, fmt, clamp } from "./plot.mjs";
import { n } from "./scene.mjs";

const pointsOf = (s) => s.points ?? s.x.map((x, i) => [x, s.y[i]]);
const colorOf = (ctx, s, i) => (s.tone ? ctx.c[s.tone] ?? s.tone : ctx.c.series[i % ctx.c.series.length]);
const poly = (pts, sx, sy) => pts.filter((p) => p[1] !== null && Number.isFinite(p[1])).map((p, i) => `${i ? "L" : "M"}${n(sx(p[0]))} ${n(sy(p[1]))}`).join("");

function rectHitsPolyline(rect, pts) {
  // sample each segment densely enough that a 2 px line cannot slip through a rectangle
  for (let i = 0; i < pts.length - 1; i += 1) {
    const [x1, y1] = pts[i], [x2, y2] = pts[i + 1];
    const steps = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 3));
    for (let s = 0; s <= steps; s += 1) {
      const x = x1 + ((x2 - x1) * s) / steps, y = y1 + ((y2 - y1) * s) / steps;
      if (x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h) return true;
    }
  }
  return false;
}
const overlap = (a, b, pad = 4) => a.x < b.x + b.w + pad && a.x + a.w + pad > b.x && a.y < b.y + b.h + pad && a.y + a.h + pad > b.y;

export function chart(ctx, block, width) {
  const { c } = ctx;
  const pad = ctx.space("card");
  const inner = width - 2 * pad;
  const kind = block.kind;
  const prov = block.provenance;
  const chipRoom = prov && prov.kind !== "observed" ? ctx.width("ILLUSTRATIVE", "label") + ctx.font("label").size * 1.6 + ctx.px(10) : 0;
  const title = block.title ? ctx.measure(block.title, "heading", inner - chipRoom, { maxLines: 2 }) : { height: 0 };
  const sub = block.subtitle ? ctx.measure(block.subtitle, "caption", inner, { maxLines: 2 }) : { height: 0 };
  const note = block.note ? ctx.measure(block.note, "caption", inner, { maxLines: 3 }) : { height: 0 };
  const headH = title.height + (sub.height ? ctx.px(4) + sub.height : 0) + ctx.px(10);
  const footH = note.height ? ctx.px(8) + note.height : 0;
  const aspect = block.aspect ?? (kind === "stripes" ? 0.28 : 0.5);
  const axisFont = ctx.font("axis");

  // ---- data model per kind -------------------------------------------------------------------------------
  const model = buildModel(ctx, block);
  const yTickW = model.yTicks ? Math.max(...model.yTicks.ticks.map((t) => ctx.width(model.yFormat(t), "axis"))) + ctx.px(12) : 0;
  const xTickH = model.xTicks ? axisFont.size * 1.3 + ctx.px(10) : 0;
  const unitH = model.yUnit ? axisFont.size * 1.3 + ctx.px(6) : 0;
  const labelFont = ctx.font("caption");
  const labels = (model.endLabels ?? []).map((l) => ({ ...l, m: ctx.measure(l.text, "caption", Math.min(inner * 0.24, ctx.px(240)), { maxLines: 3, face: "sansBold" }) }));
  const rightW = labels.length ? Math.max(...labels.map((l) => l.m.width)) + ctx.px(14) : ctx.px(8);
  const legendH = model.legend ? labelFont.size * 1.5 + ctx.px(10) : 0;
  const fixed = 2 * pad + headH + footH + xTickH + unitH + legendH;
  const idealPlot = Math.max(ctx.px(kind === "stripes" ? 140 : 230), inner * aspect - (kind === "stripes" ? 0 : 0));
  const minPlot = ctx.px(kind === "stripes" ? 110 : 190);

  return {
    min: fixed + minPlot, ideal: fixed + idealPlot, flex: block.flex ?? 1,
    draw(box) {
      const inn = ctx.card(box, {});
      const sc = ctx.scene;
      sc.onBackground(c.surface, () => {
        let y = inn.y;
        if (block.title) { ctx.text(block.title, "heading", { x: inn.x, y, width: inn.w - chipRoom, color: c.ink, maxLines: 2, headingLevel: 3 }); }
        if (prov) ctx.provenance(prov, inn.x + inn.w, y, { align: "right" });
        y += title.height;
        if (block.subtitle) { ctx.text(block.subtitle, "caption", { x: inn.x, y: y + ctx.px(4), width: inn.w, color: c.inkMuted, maxLines: 2 }); y += ctx.px(4) + sub.height; }
        y += ctx.px(10);
        if (model.yUnit) { ctx.text(model.yUnit, "axis", { x: inn.x, y, width: inn.w, color: c.inkMuted, maxLines: 1 }); y += unitH; }
        if (model.legend) { drawLegend(ctx, model.legend, inn.x + yTickW, y, inn.w); y += legendH; }
        const bottom = box.y + box.h - inn.pad - footH - xTickH;
        const plot = { x: inn.x + yTickW, y, w: inn.w - yTickW - rightW, h: Math.max(ctx.px(60), bottom - y) };
        model.draw(plot, { labels, inn, axisFont });
        if (block.note) ctx.text(block.note, "caption", { x: inn.x, y: box.y + box.h - inn.pad - note.height, width: inn.w, color: c.inkMuted, maxLines: 3 });
      });
    },
  };
}

function drawLegend(ctx, items, x, y, maxW) {
  let lx = x;
  const f = ctx.font("caption");
  for (const it of items) {
    ctx.scene.rect(lx, y + f.size * 0.3, ctx.px(26), ctx.px(8), { fill: it.color, rx: 3, box: false, opacity: it.opacity });
    ctx.scene.mark("legend", it.color, ctx.c.surface);
    const w = ctx.width(it.text, "caption");
    ctx.text(it.text, "caption", { x: lx + ctx.px(34), y, width: w + 4, color: ctx.c.ink, maxLines: 1 });
    lx += ctx.px(34) + w + ctx.px(26);
  }
}

// ------------------------------------------------------------------------------------------------ models
function buildModel(ctx, block) {
  switch (block.kind) {
    case "line": return lineModel(ctx, block);
    case "anomalyBars": return anomalyModel(ctx, block);
    case "stripes": return stripesModel(ctx, block);
    case "fan": return fanModel(ctx, block);
    case "bars": return barsModel(ctx, block);
    default: throw new RangeError(`unknown chart kind ${block.kind}`);
  }
}

function xAxis(ctx, plot, sx, ticks, y, fmtX, axisFont) {
  const { c } = ctx;
  for (const t of ticks) {
    const x = sx(t);
    const label = fmtX(t);
    const w = ctx.width(label, "axis");
    const lx = clamp(x - w / 2, plot.x - ctx.px(4), plot.x + plot.w - w + ctx.px(4));
    ctx.scene.line(x, y, x, y + ctx.px(6), { stroke: c.inkMuted, strokeWidth: ctx.px(1.5) });
    ctx.text(label, "axis", { x: lx, y: y + ctx.px(8), width: w + 4, color: c.inkMuted, maxLines: 1, hyphenate: false, scoreRole: "axis" });
  }
}

function yGrid(ctx, plot, sy, yTicks, yFormat, zero) {
  const { c } = ctx;
  for (const t of yTicks.ticks) {
    const y = sy(t);
    const isZero = zero && Math.abs(t) < 1e-9;
    ctx.scene.line(plot.x, y, plot.x + plot.w, y, { stroke: isZero ? c.inkMuted : c.rule, strokeWidth: isZero ? ctx.px(2) : ctx.px(1), opacity: isZero ? 1 : 0.7 });
    const label = yFormat(t);
    const w = ctx.width(label, "axis");
    const f = ctx.font("axis");
    ctx.text(label, "axis", { x: plot.x - ctx.px(10) - w, y: y - f.size * f.lineHeight / 2, width: w + 4, color: c.inkMuted, maxLines: 1, hyphenate: false, scoreRole: "axis" });
  }
}

function yearTicks(x0, x1, count) {
  const t = niceTicks(x0, x1, count, { extend: false });
  return t.ticks.filter((v) => v >= x0 - 1e-9 && v <= x1 + 1e-9);
}

function directLabels(ctx, plot, labels, sy, endX) {
  if (!labels.length) return;
  const f = ctx.font("caption");
  const items = labels.map((l) => ({ y: sy(l.y), h: Math.max(l.m.height, f.size * 1.3) }));
  const ys = spreadLabels(items, plot.y, plot.y + plot.h, ctx.px(3));
  labels.forEach((l, i) => {
    const y = ys[i];
    ctx.scene.line(endX + ctx.px(2), sy(l.y), endX + ctx.px(8), y, { stroke: l.color, strokeWidth: ctx.px(1.5) });
    ctx.text(l.text, "caption", { x: endX + ctx.px(12), y: y - l.m.height / 2, width: l.m.width + 4, color: l.textColor ?? ctx.c.ink, face: "sansBold", maxLines: 3 });
  });
}

function placeAnnotations(ctx, plot, annotations, sx, sy, polylines, occupied, obstaclePad = 4) {
  const { c } = ctx;
  const placed = [...occupied];
  const f = ctx.font("caption");
  for (const a of annotations) {
    const px = sx(a.x), py = sy(a.y);
    const maxW = ctx.px(a.width ?? 250);
    const m = ctx.measure(a.text, "caption", maxW, { maxLines: 4, face: "sansBold" });
    const w = m.width + ctx.px(18), h = m.height + ctx.px(12);
    const gap = ctx.px(26);
    const candidates = [
      { x: px + ctx.px(14), y: py - gap - h }, { x: px - ctx.px(14) - w, y: py - gap - h },
      { x: px + ctx.px(14), y: py + gap }, { x: px - ctx.px(14) - w, y: py + gap },
      { x: px - w / 2, y: py - gap - h - ctx.px(30) }, { x: px - w / 2, y: py + gap + ctx.px(30) }, { x: px - w - ctx.px(30), y: py - h / 2 }, { x: px + ctx.px(30), y: py - h / 2 },
      { x: px + ctx.px(14), y: py - gap - h - ctx.px(60) }, { x: px - ctx.px(14) - w, y: py + gap + ctx.px(60) },
    ];
    let chosen = null;
    for (const cand of candidates) {
      const r = { x: clamp(cand.x, plot.x, plot.x + plot.w - w), y: cand.y, w, h };
      if (r.y < plot.y || r.y + r.h > plot.y + plot.h) continue;
      if (placed.some((p) => overlap(p, r, obstaclePad))) continue;
      if (polylines.some((pl) => rectHitsPolyline({ x: r.x - 2, y: r.y - 2, w: r.w + 4, h: r.h + 4 }, pl))) continue;
      chosen = r;
      break;
    }
    if (!chosen) {
      // exhaustive fallback: scan the plot on a 10 px lattice, nearest free rectangle to the anchor wins (ties by y then x)
      const scan = [];
      for (let yy = plot.y; yy + h <= plot.y + plot.h; yy += 10) for (let xx = plot.x; xx + w <= plot.x + plot.w; xx += 10) scan.push({ x: xx, y: yy, w, h, d: Math.hypot(xx + w / 2 - px, yy + h / 2 - py) });
      scan.sort((a, b) => a.d - b.d || a.y - b.y || a.x - b.x);
      chosen = scan.find((r) => !placed.some((p) => overlap(p, r, obstaclePad)) && !polylines.some((pl) => rectHitsPolyline({ x: r.x - 2, y: r.y - 2, w: r.w + 4, h: r.h + 4 }, pl))) ?? null;
    }
    chosen ??= (() => { const cand = candidates[0]; return { x: clamp(cand.x, plot.x, plot.x + plot.w - w), y: clamp(cand.y, plot.y, plot.y + plot.h - h), w, h, forced: true }; })();
    if (chosen.forced) ctx.scene.report.overflow.push({ block: ctx.scene.blockId, text: `annotation ${a.text.slice(0, 40)}`, by: 1 });
    placed.push(chosen);
    const anchorY = chosen.y > py ? chosen.y : chosen.y + chosen.h;
    const anchorX = clamp(px, chosen.x + ctx.px(8), chosen.x + chosen.w - ctx.px(8));
    ctx.scene.line(px, py, anchorX, anchorY, { stroke: c.ink, strokeWidth: ctx.px(1.8) });
    ctx.scene.circle(px, py, ctx.px(5.5), { fill: c.surface, stroke: c.ink, strokeWidth: ctx.px(2.5) });
    ctx.scene.rect(chosen.x, chosen.y, chosen.w, chosen.h, { fill: c.surface, stroke: c.ink, strokeWidth: ctx.px(1.5), rx: ctx.px(8), box: false });
    ctx.scene.report.boxes.push({ x: chosen.x, y: chosen.y, w: chosen.w, h: chosen.h, fill: c.surface, chip: true, block: ctx.scene.blockId });
    ctx.scene.onBackground(c.surface, () => ctx.text(a.text, "caption", { x: chosen.x + ctx.px(9), y: chosen.y + ctx.px(6), width: m.width + 4, color: c.ink, face: "sansBold", maxLines: 4 }));
  }
  return placed;
}

function lineModel(ctx, block) {
  const { c } = ctx;
  const series = block.series.map((s, i) => ({ ...s, pts: pointsOf(s), color: colorOf(ctx, s, i) }));
  const all = series.flatMap((s) => s.pts.filter((p) => p[1] !== null));
  const ys = all.map((p) => p[1]);
  let lo = block.yMin ?? Math.min(...ys), hi = block.yMax ?? Math.max(...ys);
  if (block.includeZero) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
  const yTicks = niceTicks(lo, hi, block.yTickCount ?? 5);
  const decimals = block.yDecimals ?? yTicks.decimals;
  const yFormat = (v) => fmt(v, decimals, { sign: block.signed && v > 0 });
  const x0 = block.xMin ?? Math.min(...all.map((p) => p[0])), x1 = block.xMax ?? Math.max(...all.map((p) => p[0]));
  const trend = block.trend ? ols(series.find((s) => s.name === block.trend.series ?? true)?.pts.filter((p) => p[0] >= (block.trend.from ?? x0) && p[1] !== null) ?? series[0].pts) : null;
  const endLabels = series.filter((s) => s.label !== false && series.length > 0).map((s) => { const last = s.pts.filter((p) => p[1] !== null).at(-1); return { text: s.label ?? s.name, y: last[1], color: s.color, textColor: undefined }; });
  return {
    yTicks, yFormat, yUnit: block.yUnit, xTicks: yearTicks(x0, x1, block.xTickCount ?? 7), endLabels,
    draw(plot, { labels }) {
      const sy = linear(yTicks.min, yTicks.max, plot.y + plot.h, plot.y), sx = linear(x0, x1, plot.x, plot.x + plot.w);
      yGrid(ctx, plot, sy, yTicks, yFormat, block.includeZero || yTicks.min < 0);
      xAxis(ctx, plot, sx, yearTicks(x0, x1, block.xTickCount ?? 7), plot.y + plot.h, (v) => String(v), ctx.font("axis"));
      const polylines = [];
      for (const s of series) {
        const pts = s.pts.filter((p) => p[1] !== null);
        if (s.band) {
          const lo2 = s.band.low.map((v, i) => [pts[i][0], v]), hi2 = s.band.high.map((v, i) => [pts[i][0], v]).reverse();
          ctx.scene.path(`${poly(lo2, sx, sy)}${hi2.map((p) => `L${n(sx(p[0]))} ${n(sy(p[1]))}`).join("")}Z`, { fill: s.color, opacity: 0.16 });
        }
        if (s.raw) {
          ctx.scene.path(poly(s.pts, sx, sy), { stroke: s.color, strokeWidth: ctx.px(1.8), opacity: 0.45, linejoin: "round" });
          const w = block.smooth ?? 11;
          const sm = movingAverage(s.pts.map((p) => p[1]), w).map((v, i) => [s.pts[i][0], v]).filter((p) => p[1] !== null);
          ctx.scene.path(poly(sm, sx, sy), { stroke: s.color, strokeWidth: ctx.px(4.5), linejoin: "round", linecap: "round" });
          polylines.push(sm.map((p) => [sx(p[0]), sy(p[1])]));
        } else {
          ctx.scene.path(poly(pts, sx, sy), { stroke: s.color, strokeWidth: ctx.px(s.width ?? 4), linejoin: "round", linecap: "round", dash: s.dash });
          polylines.push(pts.map((p) => [sx(p[0]), sy(p[1])]));
        }
        ctx.scene.mark("line", s.color, c.surface);
        const last = pts.at(-1);
        ctx.scene.circle(sx(last[0]), sy(last[1]), ctx.px(6), { fill: s.color, stroke: c.surface, strokeWidth: ctx.px(2.5) });
      }
      if (trend) {
        const a = block.trend.from ?? x0, b = x1;
        ctx.scene.path(`M${n(sx(a))} ${n(sy(trend.intercept + trend.slope * a))}L${n(sx(b))} ${n(sy(trend.intercept + trend.slope * b))}`, { stroke: c.ink, strokeWidth: ctx.px(2.5), dash: `${n(ctx.px(9))} ${n(ctx.px(7))}`, linecap: "butt" });
        ctx.scene.mark("trend", c.ink, c.surface);
        polylines.push([[sx(a), sy(trend.intercept + trend.slope * a)], [sx(b), sy(trend.intercept + trend.slope * b)]]);
      }
      directLabels(ctx, plot, labels, sy, plot.x + plot.w);
      if (block.annotations) placeAnnotations(ctx, plot, block.annotations, sx, sy, polylines, []);
    },
  };
}

function anomalyModel(ctx, block) {
  const { c } = ctx;
  const pts = pointsOf(block.series[0]).filter((p) => p[1] !== null);
  const ys = pts.map((p) => p[1]);
  const m = block.colorRange ?? Math.max(...ys.map(Math.abs));
  const yTicks = niceTicks(Math.min(0, ...ys), Math.max(0, ...ys), block.yTickCount ?? 5);
  const decimals = block.yDecimals ?? yTicks.decimals;
  const yFormat = (v) => fmt(v, decimals, { sign: v > 0 });
  const x0 = pts[0][0], x1 = pts.at(-1)[0];
  const colorFor = (v) => ramp(RDBU, 0.5 + clamp(v / m, -1, 1) * 0.5 * 0.96);
  const win = block.smooth ?? 11;
  const smooth = movingAverage(ys, win).map((v, i) => [pts[i][0], v]).filter((p) => p[1] !== null);
  const last = pts.at(-1);
  const legend = block.smooth === 0 ? null : [{ text: `${win}-year average`, color: c.ink }];
  return {
    yTicks, yFormat, yUnit: block.yUnit, xTicks: yearTicks(x0, x1, 7), legend,
    draw(plot) {
      const sy = linear(yTicks.min, yTicks.max, plot.y + plot.h, plot.y);
      const step = plot.w / pts.length;
      const sx = linear(x0 - 0.5, x1 + 0.5, plot.x, plot.x + plot.w);
      yGrid(ctx, plot, sy, yTicks, yFormat, true);
      xAxis(ctx, plot, sx, yearTicks(x0, x1, 7), plot.y + plot.h, (v) => String(v), ctx.font("axis"));
      const gap = step > 5 ? Math.min(2, step * 0.18) : 0.6;
      const zero = sy(0);
      for (const [x, v] of pts) {
        const top = Math.min(sy(v), zero), h = Math.abs(sy(v) - zero);
        ctx.scene.rect(sx(x - 0.5) + gap / 2, top, Math.max(0.5, step - gap), Math.max(0.5, h), { fill: colorFor(v), box: false });
      }
      ctx.scene.mark("bar", colorFor(m), c.surface);
      ctx.scene.mark("bar", colorFor(-m), c.surface);
      if (block.smooth !== 0) {
        ctx.scene.path(poly(smooth, sx, sy), { stroke: c.surface, strokeWidth: ctx.px(8), linejoin: "round", linecap: "round" });
        ctx.scene.path(poly(smooth, sx, sy), { stroke: c.ink, strokeWidth: ctx.px(4), linejoin: "round", linecap: "round" });
        ctx.scene.mark("line", c.ink, c.surface);
      }
      if (block.annotations) {
        const barRects = pts.map(([x, v]) => ({ x: sx(x - 0.5), y: Math.min(sy(v), zero), w: step, h: Math.max(1, Math.abs(sy(v) - zero)) }));
        placeAnnotations(ctx, plot, block.annotations.map((a) => ({ ...a, y: a.y ?? pts.find((p) => p[0] === a.x)?.[1] ?? 0 })), sx, sy, [smooth.map((p) => [sx(p[0]), sy(p[1])])], barRects, 1);
      }
    },
  };
}

function stripesModel(ctx, block) {
  const { c } = ctx;
  const pts = pointsOf(block.series[0]).filter((p) => p[1] !== null);
  const vals = pts.map((p) => p[1]);
  const center = block.center ?? vals.reduce((a, b) => a + b, 0) / vals.length;
  const m = block.colorRange ?? Math.max(...vals.map((v) => Math.abs(v - center)));
  const colorFor = (v) => ramp(RDBU, 0.5 + clamp((v - center) / m, -1, 1) * 0.5 * 0.96);
  return {
    xTicks: [pts[0][0], pts.at(-1)[0]],
    draw(plot) {
      const step = plot.w / pts.length;
      pts.forEach(([, v], i) => ctx.scene.rect(plot.x + i * step - 0.2, plot.y, step + 0.4, plot.h, { fill: colorFor(v), box: false }));
      ctx.scene.mark("stripe", colorFor(m + center), c.surface);
      ctx.scene.mark("stripe", colorFor(center - m), c.surface);
      ctx.scene.rect(plot.x, plot.y, plot.w, plot.h, { fill: "none", stroke: c.rule, strokeWidth: ctx.px(1.5), box: false });
      const first = String(pts[0][0]), last = String(pts.at(-1)[0]);
      ctx.text(first, "axis", { x: plot.x, y: plot.y + plot.h + ctx.px(8), width: ctx.width(first, "axis") + 4, color: c.inkMuted, maxLines: 1, scoreRole: "axis" });
      ctx.text(last, "axis", { x: plot.x + plot.w - ctx.width(last, "axis"), y: plot.y + plot.h + ctx.px(8), width: ctx.width(last, "axis") + 4, color: c.inkMuted, maxLines: 1, scoreRole: "axis" });
      const sw = ctx.px(220), sx0 = plot.x + plot.w / 2 - sw / 2, sy0 = plot.y + plot.h + ctx.px(12);
      const lowLabel = block.legendLow ?? `${fmt(center - m, 1, { sign: true })} cooler`, highLabel = block.legendHigh ?? `${fmt(center + m, 1, { sign: true })} warmer`;
      const lw = ctx.width(lowLabel, "axis"), hw = ctx.width(highLabel, "axis");
      ctx.text(lowLabel, "axis", { x: sx0 - lw - ctx.px(10), y: sy0 - ctx.px(5), width: lw + 4, color: c.inkMuted, maxLines: 1, scoreRole: "axis" });
      for (let k = 0; k < 44; k += 1) ctx.scene.rect(sx0 + (k * sw) / 44, sy0, sw / 44 + 0.4, ctx.px(14), { fill: ramp(RDBU, (k / 43) * 0.96 + 0.02), box: false });
      ctx.text(highLabel, "axis", { x: sx0 + sw + ctx.px(10), y: sy0 - ctx.px(5), width: hw + 4, color: c.inkMuted, maxLines: 1, scoreRole: "axis" });
    },
  };
}

function fanModel(ctx, block) {
  const { c } = ctx;
  const obs = block.observed.map((s, i) => ({ ...s, pts: pointsOf(s), color: colorOf(ctx, { tone: s.tone ?? "ink" }, i) }));
  const scen = block.scenarios.map((s, i) => ({ ...s, color: colorOf(ctx, s, i + 1) }));
  const allY = [...obs.flatMap((s) => s.pts.map((p) => p[1])), ...scen.flatMap((s) => [...s.low.map((p) => p[1]), ...s.high.map((p) => p[1])])];
  const yTicks = niceTicks(Math.min(...allY), Math.max(...allY), block.yTickCount ?? 5);
  const yFormat = (v) => fmt(v, block.yDecimals ?? yTicks.decimals, { sign: block.signed && v > 0 });
  const x0 = Math.min(...obs.flatMap((s) => s.pts.map((p) => p[0]))), x1 = Math.max(...scen.flatMap((s) => s.median.map((p) => p[0])));
  const from = block.fromX ?? Math.max(...obs.flatMap((s) => s.pts.map((p) => p[0])));
  const endLabels = scen.map((s) => ({ text: s.name, y: s.median.at(-1)[1], color: s.color }));
  return {
    yTicks, yFormat, yUnit: block.yUnit, xTicks: yearTicks(x0, x1, 7), endLabels,
    legend: [{ text: block.bandLabel ?? "Shaded band: likely range", color: scen[0]?.color ?? c.accent, opacity: 0.3 }],
    draw(plot, { labels }) {
      const sy = linear(yTicks.min, yTicks.max, plot.y + plot.h, plot.y), sx = linear(x0, x1, plot.x, plot.x + plot.w);
      yGrid(ctx, plot, sy, yTicks, yFormat, yTicks.min < 0);
      xAxis(ctx, plot, sx, yearTicks(x0, x1, 7), plot.y + plot.h, (v) => String(v), ctx.font("axis"));
      ctx.scene.rect(sx(from), plot.y, plot.x + plot.w - sx(from), plot.h, { fill: c.surfaceAlt, opacity: 0.55, box: false });
      ctx.scene.line(sx(from), plot.y, sx(from), plot.y + plot.h, { stroke: c.inkMuted, strokeWidth: ctx.px(2), dash: `${n(ctx.px(6))} ${n(ctx.px(5))}` });
      const lab = block.projectionLabel ?? "Projected";
      ctx.text(lab.toUpperCase(), "label", { x: sx(from) + ctx.px(10), y: plot.y + ctx.px(6), width: ctx.width(lab.toUpperCase(), "label") + 4, color: c.inkMuted, maxLines: 1, bg: c.surfaceAlt });
      const polylines = [];
      for (const s of scen) {
        const lo = s.low, hi = [...s.high].reverse();
        ctx.scene.path(`${poly(lo, sx, sy)}${hi.map((p) => `L${n(sx(p[0]))} ${n(sy(p[1]))}`).join("")}Z`, { fill: s.color, opacity: 0.2 });
        ctx.scene.path(poly(s.median, sx, sy), { stroke: s.color, strokeWidth: ctx.px(4.5), linejoin: "round", linecap: "round", dash: s.dash });
        ctx.scene.mark("line", s.color, c.surface);
        polylines.push(s.median.map((p) => [sx(p[0]), sy(p[1])]));
      }
      for (const s of obs) {
        ctx.scene.path(poly(s.pts, sx, sy), { stroke: s.color, strokeWidth: ctx.px(1.8), opacity: s.smooth ? 0.4 : 1, linejoin: "round" });
        if (s.smooth) {
          const sm = movingAverage(s.pts.map((p) => p[1]), s.smooth).map((v, i) => [s.pts[i][0], v]).filter((p) => p[1] !== null);
          ctx.scene.path(poly(sm, sx, sy), { stroke: s.color, strokeWidth: ctx.px(4.5), linejoin: "round", linecap: "round" });
          polylines.push(sm.map((p) => [sx(p[0]), sy(p[1])]));
        } else polylines.push(s.pts.map((p) => [sx(p[0]), sy(p[1])]));
        ctx.scene.mark("line", s.color, c.surface);
      }
      directLabels(ctx, plot, labels, sy, plot.x + plot.w);
      if (block.annotations) placeAnnotations(ctx, plot, block.annotations, sx, sy, polylines, []);
    },
  };
}

function barsModel(ctx, block) {
  const { c } = ctx;
  const items = block.items;
  const max = block.max ?? Math.max(...items.map((i) => i.value));
  const decimals = block.decimals ?? 0;
  return {
    xTicks: null,
    draw(plot) {
      const rowH = plot.h / items.length;
      const labelW = Math.min(plot.w * 0.38, Math.max(...items.map((i) => ctx.width(i.label, "body"))) + ctx.px(14));
      const valueW = Math.max(...items.map((i) => ctx.width(`${fmt(i.value, decimals)}${block.unit ?? ""}`, "body", { face: "sansBold" }))) + ctx.px(12);
      const barMax = plot.w - labelW - valueW;
      items.forEach((it, i) => {
        const y = plot.y + i * rowH;
        const bh = Math.min(rowH * 0.62, ctx.px(44));
        const by = y + (rowH - bh) / 2;
        const color = it.tone ? c[it.tone] ?? it.tone : c.series[0];
        const f = ctx.font("body");
        const lm = ctx.measure(it.label, "body", labelW - ctx.px(10), { maxLines: 2 });
        ctx.text(it.label, "body", { x: plot.x, y: y + rowH / 2 - lm.height / 2, width: labelW - ctx.px(10), color: c.ink, maxLines: 2 });
        const bw = Math.max(ctx.px(3), (it.value / max) * barMax);
        ctx.scene.rect(plot.x + labelW, by, bw, bh, { fill: color, rx: ctx.px(5), box: false });
        ctx.scene.mark("bar", color, c.surface);
        ctx.text(`${fmt(it.value, decimals)}${block.unit ?? ""}`, "body", { x: plot.x + labelW + bw + ctx.px(10), y: y + rowH / 2 - f.size * f.lineHeight / 2, width: valueW, color: c.ink, face: "sansBold", maxLines: 1, scoreRole: "number" });
      });
    },
  };
}

export const CHART_KINDS = ["line", "anomalyBars", "stripes", "fan", "bars"];
