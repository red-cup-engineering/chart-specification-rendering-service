// Text-and-shape blocks. Every block is `plan(ctx, block, width) -> { min, ideal, flex, draw(box) }`: it measures with the
// real font metrics first, so the page layout can solve heights before anything is drawn.
import { mix, contrast } from "./color.mjs";
import { linear } from "./plot.mjs";
import { n } from "./scene.mjs";

const tone = (ctx, name, fallback = "accent") => ctx.c[name] ?? ctx.c[fallback];
const softOf = (ctx, name) => ctx.c[`${name}Soft`] ?? mix(ctx.c[name] ?? ctx.c.accent, ctx.c.surface, 0.88);

// ---------------------------------------------------------------------------------------------------- header
function header(ctx, block, width) {
  const { c } = ctx;
  const gap = ctx.space("gutter");
  const badgeW = block.badge ? Math.max(ctx.width(block.badge.text, "label") + 2.4 * ctx.font("label").size + ctx.px(36), ctx.px(150)) : 0;
  const textW = width - (badgeW ? badgeW + gap : 0);
  const kicker = block.kicker ? ctx.measure(block.kicker.toUpperCase(), "kicker", textW) : { height: 0 };
  const title = ctx.measure(block.title, "display", textW, { maxLines: block.titleMaxLines ?? 3 });
  const sub = block.subtitle ? ctx.measure(block.subtitle, "body", textW, { maxLines: 3 }) : { height: 0 };
  const g1 = kicker.height ? ctx.px(10) : 0, g2 = sub.height ? ctx.px(12) : 0;
  const rule = ctx.px(14);
  const height = kicker.height + g1 + title.height + g2 + sub.height + rule;
  return {
    min: height, ideal: height, flex: 0,
    draw(box) {
      let y = box.y;
      if (block.kicker) { ctx.text(block.kicker.toUpperCase(), "kicker", { x: box.x, y, width: textW, color: c.accent }); y += kicker.height + g1; }
      const t = ctx.text(block.title, "display", { x: box.x, y, width: textW, color: c.ink, maxLines: block.titleMaxLines ?? 3, headingLevel: 1 });
      y += t.height + g2;
      if (block.subtitle) { ctx.text(block.subtitle, "body", { x: box.x, y, width: textW, color: c.inkMuted, maxLines: 3 }); y += sub.height; }
      ctx.scene.rect(box.x, box.y + height - rule + ctx.px(4), ctx.px(96), Math.max(3, ctx.px(5)), { fill: c.accent2, rx: 2, box: false });
      if (block.badge) {
        const bx = box.x + box.w - badgeW, f = ctx.font("label"), bh = Math.max(ctx.px(64), f.size * 3.2);
        ctx.scene.rect(bx, box.y, badgeW, bh, { fill: c.surface, stroke: c.rule, strokeWidth: ctx.px(1.5), rx: ctx.space("radius"), box: false });
        ctx.scene.report.boxes.push({ x: bx, y: box.y, w: badgeW, h: bh, fill: c.surface, card: true, block: ctx.scene.blockId });
        if (block.badge.icon) ctx.icon(block.badge.icon, bx + ctx.px(14), box.y + (bh - ctx.px(30)) / 2, ctx.px(30), c.accent2);
        ctx.scene.onBackground(c.surface, () => ctx.text(block.badge.text, "label", { x: bx + ctx.px(56), y: box.y + (bh - f.size * f.lineHeight) / 2, width: badgeW - ctx.px(64), color: c.ink, maxLines: 1 }));
      }
    },
  };
}

// ---------------------------------------------------------------------------------------------------- hero stat
function heroStat(ctx, block, width) {
  const { c } = ctx;
  const pad = ctx.space("card");
  const inner = width - 2 * pad;
  const accent = tone(ctx, block.tone ?? "accent2", "accent2");
  const hero = ctx.font("hero");
  const unitRole = ctx.font("display");
  const unitW = block.unit ? ctx.width(block.unit, "display") + ctx.px(8) : 0;
  let scale = 1;
  const valueW = (s) => ctx.width(block.value, "hero", { scale: s });
  while (valueW(scale) + unitW * scale > inner && scale > 0.35) scale -= 0.04;
  const numberH = hero.size * scale * 0.9;
  const kicker = block.kicker ? ctx.measure(block.kicker.toUpperCase(), "kicker", inner) : { height: 0 };
  const label = ctx.measure(block.label, "title", inner - ctx.px(8), { maxLines: 3 });
  const context = block.context ? ctx.measure(block.context, "body", inner - ctx.px(8), { maxLines: 6 }) : { height: 0 };
  const g = ctx.px(12);
  const iconH = block.icon ? ctx.px(44) + g : 0;
  const height = 2 * pad + iconH + (kicker.height ? kicker.height + g : 0) + numberH + g + label.height + (context.height ? g + context.height : 0);
  return {
    min: height, ideal: height, flex: 0,
    draw(box) {
      const inn = ctx.card(box, { fill: c.surface, accent });
      const extra = Math.max(0, box.h - height) / 2;
      let y = inn.y + extra;
      const x = inn.x + ctx.px(8);
      const w = inn.w - ctx.px(8);
      ctx.scene.onBackground(c.surface, () => {
        if (block.icon) { ctx.icon(block.icon, x, y, ctx.px(44), accent, ctx.px(2.2)); y += iconH; }
        if (block.kicker) { ctx.text(block.kicker.toUpperCase(), "kicker", { x, y, width: w, color: c.inkMuted }); y += kicker.height + g; }
        const vf = ctx.font("hero", { scale });
        const vw = ctx.width(block.value, "hero", { scale });
        ctx.text(block.value, "hero", { x, y: y - vf.size * (vf.lineHeight - 0.9) / 2 - vf.size * 0.02, width: vw + 4, color: accent, scale, scoreRole: "number", maxLines: 1, hyphenate: false });
        if (block.unit) ctx.text(block.unit, "display", { x: x + vw + ctx.px(8) * scale, y: y + numberH - unitRole.size * unitRole.lineHeight * 0.92, width: unitW + 4, color: accent, scoreRole: "number-unit", maxLines: 1, hyphenate: false });
        y += numberH + g;
        const l = ctx.text(block.label, "title", { x, y, width: w, color: c.ink, maxLines: 3, headingLevel: 2 });
        y += l.height;
        if (block.context) ctx.text(block.context, "body", { x, y: y + g, width: w, color: c.inkMuted, maxLines: 6 });
      });
    },
  };
}

// ---------------------------------------------------------------------------------------------------- stats row
function sparkPath(values, x, y, w, h) {
  const lo = Math.min(...values), hi = Math.max(...values);
  const sx = linear(0, values.length - 1, x, x + w), sy = linear(lo, hi === lo ? lo + 1 : hi, y + h, y);
  return values.map((v, i) => `${i ? "L" : "M"}${n(sx(i))} ${n(sy(v))}`).join("");
}

function stats(ctx, block, width) {
  const { c } = ctx;
  const gap = ctx.space("gutter") * 0.75;
  const items = block.items;
  const minW = ctx.px(250);
  const cols = Math.max(1, Math.min(block.columns ?? items.length, Math.floor((width + gap) / (minW + gap))));
  const cardW = (width - gap * (cols - 1)) / cols;
  const pad = ctx.px(20);
  const inner = cardW - 2 * pad;
  const rows = Math.ceil(items.length / cols);
  const plans = items.map((item) => {
    const iconW = item.icon ? ctx.px(40) + ctx.px(14) : 0;
    const val = ctx.width(item.value, "display", { scale: 1.15 });
    const unit = item.unit ? ctx.width(item.unit, "heading") + ctx.px(6) : 0;
    let scale = 1.15;
    while ((ctx.width(item.value, "display", { scale }) + unit + iconW > inner) && scale > 0.6) scale -= 0.05;
    const label = ctx.measure(item.label, "body", inner, { maxLines: 3 });
    const note = item.note ? ctx.measure(item.note, "caption", inner, { maxLines: 4 }) : { height: 0 };
    const spark = item.trend ? ctx.px(46) : 0;
    const numH = ctx.font("display", { scale }).size * 1.0;
    return { item, scale, iconW, label, note, spark, numH, val, unit, h: 2 * pad + numH + ctx.px(8) + label.height + (note.height ? ctx.px(6) + note.height : 0) + (spark ? ctx.px(14) + spark : 0) };
  });
  const rowH = [];
  for (let r = 0; r < rows; r += 1) rowH.push(Math.max(...plans.slice(r * cols, (r + 1) * cols).map((p) => p.h)));
  const height = rowH.reduce((a, b) => a + b, 0) + gap * (rows - 1);
  return {
    min: height, ideal: height, flex: 0,
    draw(box) {
      let y = box.y;
      plans.forEach((p, i) => {
        const col = i % cols, row = Math.floor(i / cols);
        if (col === 0 && row > 0) y += rowH[row - 1] + gap;
        const x = box.x + col * (cardW + gap);
        const accent = tone(ctx, p.item.tone ?? "accent");
        const inn = ctx.card({ x, y, w: cardW, h: rowH[row] + (row === rows - 1 ? Math.max(0, box.h - height) : 0) }, { pad, accent });
        ctx.scene.onBackground(c.surface, () => {
          let yy = inn.y;
          const vf = ctx.font("display", { scale: p.scale });
          let xx = inn.x + ctx.px(8);
          if (p.item.icon) { ctx.icon(p.item.icon, xx, yy + (p.numH - ctx.px(40)) / 2 + ctx.px(2), ctx.px(40), accent, ctx.px(2)); xx += p.iconW; }
          const vw = ctx.width(p.item.value, "display", { scale: p.scale });
          ctx.text(p.item.value, "display", { x: xx, y: yy - vf.size * (vf.lineHeight - 1) / 2, width: vw + 4, color: accent, scale: p.scale, scoreRole: "number", maxLines: 1, hyphenate: false });
          if (p.item.unit) ctx.text(p.item.unit, "heading", { x: xx + vw + ctx.px(6), y: yy + p.numH - ctx.font("heading").size * 1.3, width: p.unit + 4, color: accent, scoreRole: "number-unit", maxLines: 1, hyphenate: false });
          yy += p.numH + ctx.px(8);
          const l = ctx.text(p.item.label, "body", { x: inn.x + ctx.px(8), y: yy, width: inn.w - ctx.px(8), color: c.ink, maxLines: 3, face: "sansBold" });
          yy += l.height;
          if (p.item.note) { const t = ctx.text(p.item.note, "caption", { x: inn.x + ctx.px(8), y: yy + ctx.px(6), width: inn.w - ctx.px(8), color: c.inkMuted, maxLines: 4 }); yy += ctx.px(6) + t.height; }
          if (p.item.trend) {
            const sy = yy + ctx.px(14);
            ctx.scene.path(sparkPath(p.item.trend, inn.x + ctx.px(8), sy, inn.w - ctx.px(24), p.spark), { stroke: accent, strokeWidth: ctx.px(3), linecap: "round", linejoin: "round" });
            ctx.scene.mark("spark", accent, c.surface);
            const last = p.item.trend[p.item.trend.length - 1], lo = Math.min(...p.item.trend), hi = Math.max(...p.item.trend);
            ctx.scene.circle(inn.x + inn.w - ctx.px(16), sy + (hi === lo ? p.spark / 2 : p.spark - ((last - lo) / (hi - lo)) * p.spark), ctx.px(5), { fill: accent });
          }
        });
      });
    },
  };
}

// ---------------------------------------------------------------------------------------------------- callout
function callout(ctx, block, width) {
  const { c } = ctx;
  const accent = tone(ctx, block.tone ?? "accent");
  const fill = softOf(ctx, block.tone ?? "accent");
  const pad = ctx.px(22);
  const iconW = block.icon ? ctx.px(40) + ctx.px(16) : 0;
  const inner = width - 2 * pad - iconW - ctx.px(6);
  const title = block.title ? ctx.measure(block.title, "heading", inner, { maxLines: 2 }) : { height: 0 };
  const body = ctx.measure(block.text, "body", inner, { maxLines: 8 });
  const height = 2 * pad + title.height + (title.height ? ctx.px(6) : 0) + body.height;
  return {
    min: height, ideal: height, flex: 0,
    draw(box) {
      ctx.scene.rect(box.x, box.y, box.w, box.h, { fill, stroke: mix(accent, fill, 0.55), strokeWidth: ctx.px(1.5), rx: ctx.space("radius"), box: false });
      ctx.scene.rect(box.x, box.y + ctx.space("radius"), ctx.px(6), box.h - 2 * ctx.space("radius"), { fill: accent, rx: 3, box: false });
      ctx.scene.report.boxes.push({ x: box.x, y: box.y, w: box.w, h: box.h, fill, card: true, block: ctx.scene.blockId });
      const extra = Math.max(0, box.h - height) / 2;
      let y = box.y + pad + extra;
      const x = box.x + pad + ctx.px(6);
      ctx.scene.onBackground(fill, () => {
        if (block.icon) ctx.icon(block.icon, x, y, ctx.px(40), contrast(accent, fill) >= 3 ? accent : c.ink, ctx.px(2.2));
        const tx = x + iconW;
        if (block.title) { const t = ctx.text(block.title, "heading", { x: tx, y, width: inner, color: c.ink, maxLines: 2, headingLevel: 3 }); y += t.height + ctx.px(6); }
        ctx.text(block.text, "body", { x: tx, y, width: inner, color: c.ink, maxLines: 8 });
      });
    },
  };
}

// ---------------------------------------------------------------------------------------------------- prose
function prose(ctx, block, width) {
  const { c } = ctx;
  const accent = tone(ctx, block.tone ?? "accent");
  const pad = ctx.space("card");
  const inner = width - 2 * pad - ctx.px(6);
  const iconW = block.icon ? ctx.px(36) + ctx.px(14) : 0;
  const head = block.heading ? ctx.measure(block.heading, "title", inner - iconW, { maxLines: 3 }) : { height: 0 };
  const paras = (block.paragraphs ?? []).map((p) => ctx.measure(p, "body", inner));
  const bulletIndent = ctx.px(30);
  const bullets = (block.bullets ?? []).map((b) => ctx.measure(b, "body", inner - bulletIndent));
  const g = ctx.px(12);
  const blocks = [...paras.map((p) => p.height), ...bullets.map((p) => p.height)];
  const height = 2 * pad + Math.max(head.height, block.icon ? ctx.px(36) : 0) + (blocks.length ? g : 0) + blocks.reduce((a, b) => a + b, 0) + g * Math.max(0, blocks.length - 1) * 0.7;
  return {
    min: height, ideal: height, flex: 0.2,
    draw(box) {
      const inn = ctx.card(box, { accent });
      const x = inn.x + ctx.px(6);
      let y = inn.y;
      ctx.scene.onBackground(c.surface, () => {
        if (block.icon) ctx.icon(block.icon, x, y, ctx.px(36), accent, ctx.px(2.1));
        if (block.heading) ctx.text(block.heading, "title", { x: x + iconW, y: y + (block.icon ? Math.max(0, (ctx.px(36) - head.height) / 2) : 0), width: inner - iconW, color: c.ink, maxLines: 3, headingLevel: 3 });
        y += Math.max(head.height, block.icon ? ctx.px(36) : 0) + g;
        for (const p of block.paragraphs ?? []) { const r = ctx.text(p, "body", { x, y, width: inner, color: c.ink }); y += r.height + g * 0.7; }
        for (const b of block.bullets ?? []) {
          const f = ctx.font("body");
          ctx.scene.circle(x + ctx.px(8), y + f.size * f.lineHeight / 2, ctx.px(5), { fill: accent });
          ctx.scene.mark("bullet", accent, c.surface);
          const r = ctx.text(b, "body", { x: x + bulletIndent, y, width: inner - bulletIndent, color: c.ink });
          y += r.height + g * 0.7;
        }
      });
    },
  };
}

// ---------------------------------------------------------------------------------------------------- comparison
function comparison(ctx, block, width) {
  const { c } = ctx;
  if (block.mode === "bars") return comparisonBars(ctx, block, width);
  const gap = ctx.space("gutter");
  const cols = block.columns;
  const cw = (width - gap * (cols.length - 1)) / cols.length;
  const pad = ctx.px(24);
  const inner = cw - 2 * pad;
  const plans = cols.map((col) => {
    const head = ctx.measure(col.heading, "heading", inner, { maxLines: 2 });
    const metricH = col.metric ? ctx.font("display").size * 1.1 : 0;
    const items = (col.items ?? []).map((t) => ctx.measure(t.text, "body", inner - ctx.px(40), { maxLines: 4 }));
    const itemsH = items.reduce((s, m) => s + Math.max(m.height, ctx.px(32)) + ctx.px(12), 0);
    return { col, head, metricH, items, h: 2 * pad + head.height + (metricH ? metricH + ctx.px(8) : 0) + ctx.px(12) + itemsH };
  });
  const title = block.title ? ctx.measure(block.title, "title", width, { maxLines: 2 }) : { height: 0 };
  const colH = Math.max(...plans.map((p) => p.h));
  const height = title.height + (title.height ? ctx.px(14) : 0) + colH;
  return {
    min: height, ideal: height, flex: 0.2,
    draw(box) {
      let y = box.y;
      if (block.title) { const t = ctx.text(block.title, "title", { x: box.x, y, width: box.w, color: c.ink, maxLines: 2, headingLevel: 2 }); y += t.height + ctx.px(14); }
      plans.forEach((p, i) => {
        const x = box.x + i * (cw + gap);
        const accent = tone(ctx, p.col.tone ?? (i === 0 ? "inkMuted" : "accent2"), "accent");
        const h = box.y + box.h - y;
        const inn = ctx.card({ x, y, w: cw, h }, { pad, accent });
        ctx.scene.onBackground(c.surface, () => {
          let yy = inn.y;
          const hd = ctx.text(p.col.heading, "heading", { x: inn.x + ctx.px(6), y: yy, width: inn.w - ctx.px(6), color: c.ink, maxLines: 2, headingLevel: 3 });
          yy += hd.height;
          if (p.col.metric) {
            const vf = ctx.font("display");
            const vw = ctx.width(p.col.metric.value, "display");
            ctx.text(p.col.metric.value, "display", { x: inn.x + ctx.px(6), y: yy + ctx.px(4), width: vw + 4, color: accent === c.inkMuted ? c.ink : accent, scoreRole: "number", maxLines: 1, hyphenate: false });
            if (p.col.metric.unit) ctx.text(p.col.metric.unit, "heading", { x: inn.x + ctx.px(10) + vw, y: yy + ctx.px(4) + vf.size * 1.1 - ctx.font("heading").size * 1.45, width: ctx.width(p.col.metric.unit, "heading") + 4, color: accent === c.inkMuted ? c.ink : accent, scoreRole: "number-unit", maxLines: 1 });
            yy += p.metricH + ctx.px(8);
          }
          yy += ctx.px(12);
          ctx.scene.line(inn.x + ctx.px(6), yy - ctx.px(6), inn.x + inn.w, yy - ctx.px(6), { stroke: c.rule, strokeWidth: ctx.px(1.5) });
          (p.col.items ?? []).forEach((item, k) => {
            const glyph = item.icon ?? (item.good === false ? "cross" : item.good === true ? "check" : "arrow-right");
            const gc = item.good === false ? c.negative : item.good === true ? c.positive : accent === c.inkMuted ? c.ink : accent;
            const m = p.items[k];
            ctx.icon(glyph, inn.x + ctx.px(6), yy + ctx.px(3), ctx.px(26), gc, ctx.px(2.4));
            ctx.text(item.text, "body", { x: inn.x + ctx.px(46), y: yy, width: inn.w - ctx.px(46), color: c.ink, maxLines: 4 });
            yy += Math.max(m.height, ctx.px(32)) + ctx.px(12);
          });
        });
      });
    },
  };
}

function comparisonBars(ctx, block, width) {
  const { c } = ctx;
  const pad = ctx.space("card");
  const inner = width - 2 * pad;
  const labelW = Math.min(inner * 0.34, Math.max(...block.rows.map((r) => ctx.width(r.label, "body"))) + ctx.px(12));
  const names = block.series;
  const rowH = ctx.px(34) * names.length + ctx.px(26);
  const title = block.title ? ctx.measure(block.title, "title", inner, { maxLines: 2 }) : { height: 0 };
  const legendH = names.length > 1 ? ctx.px(34) : 0;
  const max = block.max ?? Math.max(...block.rows.flatMap((r) => r.values));
  const height = 2 * pad + title.height + (title.height ? ctx.px(12) : 0) + legendH + block.rows.length * rowH;
  const colors = [c.series[0], c.series[1], c.series[2]];
  return {
    min: height, ideal: height, flex: 0.3,
    draw(box) {
      const inn = ctx.card(box, {});
      let y = inn.y;
      ctx.scene.onBackground(c.surface, () => {
        if (block.title) { const t = ctx.text(block.title, "title", { x: inn.x, y, width: inn.w, color: c.ink, maxLines: 2, headingLevel: 3 }); y += t.height + ctx.px(12); }
        if (legendH) {
          let lx = inn.x;
          names.forEach((name, i) => {
            ctx.scene.rect(lx, y + ctx.px(6), ctx.px(18), ctx.px(18), { fill: colors[i], rx: 3, box: false });
            ctx.scene.mark("legend", colors[i], c.surface);
            const w = ctx.width(name, "caption");
            ctx.text(name, "caption", { x: lx + ctx.px(26), y: y + ctx.px(2), width: w + 4, color: c.ink, maxLines: 1 });
            lx += ctx.px(26) + w + ctx.px(28);
          });
          y += legendH;
        }
        const extra = Math.max(0, box.y + box.h - inn.pad - y - block.rows.length * rowH) / block.rows.length;
        const sx = linear(0, max, 0, inn.w - labelW - ctx.px(110));
        for (const row of block.rows) {
          const f = ctx.font("body");
          ctx.text(row.label, "body", { x: inn.x, y: y + (rowH - ctx.px(26) + extra) / 2 - f.size * f.lineHeight / 2 + ctx.px(2), width: labelW - ctx.px(8), color: c.ink, maxLines: 2 });
          row.values.forEach((v, i) => {
            const by = y + i * ctx.px(34) + ctx.px(4);
            const bw = Math.max(ctx.px(3), sx(v));
            ctx.scene.rect(inn.x + labelW, by, bw, ctx.px(26), { fill: colors[i], rx: 4, box: false });
            ctx.scene.mark("bar", colors[i], c.surface);
            ctx.text(`${v}${block.unit ?? ""}`, "caption", { x: inn.x + labelW + bw + ctx.px(8), y: by + (ctx.px(26) - ctx.font("caption").size * 1.32) / 2, width: ctx.px(100), color: c.ink, face: "sansBold", maxLines: 1, scoreRole: "number" });
          });
          y += rowH + extra;
        }
      });
    },
  };
}

// ---------------------------------------------------------------------------------------------------- timeline
function timeline(ctx, block, width) {
  const { c } = ctx;
  const ev = block.events;
  const pad = ctx.space("card");
  const inner = width - 2 * pad;
  const title = block.title ? ctx.measure(block.title, "title", inner, { maxLines: 2 }) : { height: 0 };
  const slot = inner / ev.length;
  const textW = Math.min(2 * slot - ctx.px(20), ctx.px(340));
  const horizontal = block.orientation === "horizontal" || (block.orientation !== "vertical" && textW >= ctx.px(170));
  if (horizontal) {
    const sides = ev.map((e, i) => {
      const when = ctx.measure(e.when, "label", textW, { maxLines: 1 });
      const head = ctx.measure(e.title, "heading", textW, { maxLines: 2 });
      const body = e.body ? ctx.measure(e.body, "caption", textW, { maxLines: 4 }) : { height: 0 };
      return { when, head, body, h: when.height + ctx.px(4) + head.height + (body.height ? ctx.px(4) + body.height : 0), above: i % 2 === 0 };
    });
    const up = Math.max(0, ...sides.filter((s) => s.above).map((s) => s.h));
    const down = Math.max(0, ...sides.filter((s) => !s.above).map((s) => s.h));
    const stem = ctx.px(26);
    const height = 2 * pad + title.height + (title.height ? ctx.px(10) : 0) + up + stem + ctx.px(24) + stem + down;
    return {
      min: height, ideal: height, flex: 0.3,
      draw(box) {
        const inn = ctx.card(box, {});
        let y = inn.y;
        ctx.scene.onBackground(c.surface, () => {
          if (block.title) { const t = ctx.text(block.title, "title", { x: inn.x, y, width: inn.w, color: c.ink, maxLines: 2, headingLevel: 3 }); y += t.height + ctx.px(10); }
          const free = box.y + box.h - inn.pad - y - (up + stem + ctx.px(24) + stem + down);
          const axisY = y + up + stem + ctx.px(12) + Math.max(0, free) / 2;
          ctx.scene.line(inn.x, axisY, inn.x + inn.w, axisY, { stroke: c.rule, strokeWidth: ctx.px(4), linecap: "round" });
          ev.forEach((e, i) => {
            const cx = inn.x + (i + 0.5) * slot;
            const s = sides[i];
            const accent = tone(ctx, e.tone ?? "accent");
            const tx = Math.min(Math.max(cx - textW / 2, inn.x), inn.x + inn.w - textW);
            ctx.scene.line(cx, s.above ? axisY - stem : axisY + stem * 0, cx, s.above ? axisY : axisY + stem, { stroke: accent, strokeWidth: ctx.px(3) });
            ctx.scene.circle(cx, axisY, ctx.px(11), { fill: c.surface, stroke: accent, strokeWidth: ctx.px(4.5) });
            ctx.scene.mark("node", accent, c.surface);
            const top = s.above ? axisY - stem - s.h : axisY + stem;
            let yy = top;
            ctx.text(e.when.toUpperCase(), "label", { x: tx, y: yy, width: textW, color: accent === c.accent2 ? c.accent2 : c.accent, align: "left", maxLines: 1 });
            yy += s.when.height + ctx.px(4);
            const h = ctx.text(e.title, "heading", { x: tx, y: yy, width: textW, color: c.ink, maxLines: 2 });
            yy += h.height + ctx.px(4);
            if (e.body) ctx.text(e.body, "caption", { x: tx, y: yy, width: textW, color: c.inkMuted, maxLines: 4 });
          });
        });
      },
    };
  }
  const nodeX = ctx.px(70);
  const tw = inner - nodeX - ctx.px(24);
  const rows = ev.map((e) => {
    const head = ctx.measure(e.title, "heading", tw, { maxLines: 2 });
    const body = e.body ? ctx.measure(e.body, "body", tw, { maxLines: 4 }) : { height: 0 };
    const when = ctx.measure(e.when, "label", tw, { maxLines: 1 });
    return { when, head, body, h: when.height + ctx.px(4) + head.height + (body.height ? ctx.px(4) + body.height : 0) + ctx.px(20) };
  });
  const height = 2 * pad + title.height + (title.height ? ctx.px(10) : 0) + rows.reduce((s, r) => s + r.h, 0);
  return {
    min: height, ideal: height, flex: 0.3,
    draw(box) {
      const inn = ctx.card(box, {});
      let y = inn.y;
      ctx.scene.onBackground(c.surface, () => {
        if (block.title) { const t = ctx.text(block.title, "title", { x: inn.x, y, width: inn.w, color: c.ink, maxLines: 2, headingLevel: 3 }); y += t.height + ctx.px(10); }
        const extra = Math.max(0, box.y + box.h - inn.pad - y - rows.reduce((s, r) => s + r.h, 0)) / rows.length;
        const top = y;
        const bottom = y + rows.reduce((s, r) => s + r.h + extra, 0) - ctx.px(20);
        ctx.scene.line(inn.x + ctx.px(18), top + ctx.px(10), inn.x + ctx.px(18), bottom - ctx.px(4), { stroke: c.rule, strokeWidth: ctx.px(4), linecap: "round" });
        ev.forEach((e, i) => {
          const accent = tone(ctx, e.tone ?? "accent");
          ctx.scene.circle(inn.x + ctx.px(18), y + ctx.px(14), ctx.px(11), { fill: c.surface, stroke: accent, strokeWidth: ctx.px(4.5) });
          ctx.scene.mark("node", accent, c.surface);
          let yy = y;
          ctx.text(e.when.toUpperCase(), "label", { x: inn.x + nodeX, y: yy, width: tw, color: accent === c.accent2 ? c.accent2 : c.accent, maxLines: 1 });
          yy += rows[i].when.height + ctx.px(4);
          const h = ctx.text(e.title, "heading", { x: inn.x + nodeX, y: yy, width: tw, color: c.ink, maxLines: 2 });
          yy += h.height + ctx.px(4);
          if (e.body) ctx.text(e.body, "body", { x: inn.x + nodeX, y: yy, width: tw, color: c.inkMuted, maxLines: 4 });
          y += rows[i].h + extra;
        });
      });
    },
  };
}

// ---------------------------------------------------------------------------------------------------- process
function process(ctx, block, width) {
  const { c } = ctx;
  const steps = block.steps;
  const pad = ctx.space("card");
  const inner = width - 2 * pad;
  const title = block.title ? ctx.measure(block.title, "title", inner, { maxLines: 2 }) : { height: 0 };
  const arrow = ctx.px(40);
  const minStep = ctx.px(200);
  const perRow = Math.max(1, Math.min(block.perRow ?? steps.length, Math.floor((inner + arrow) / (minStep + arrow))));
  const sw = (inner - arrow * (perRow - 1)) / perRow;
  const plans = steps.map((s) => ({
    head: ctx.measure(s.title, "heading", sw, { maxLines: 2 }),
    body: s.body ? ctx.measure(s.body, "caption", sw, { maxLines: 6 }) : { height: 0 },
  }));
  const rows = Math.ceil(steps.length / perRow);
  const badge = ctx.px(52);
  const rowH = [];
  for (let r = 0; r < rows; r += 1) rowH.push(badge + ctx.px(12) + Math.max(...plans.slice(r * perRow, (r + 1) * perRow).map((p) => p.head.height + (p.body.height ? ctx.px(6) + p.body.height : 0))));
  const rowGap = ctx.px(26);
  const height = 2 * pad + title.height + (title.height ? ctx.px(12) : 0) + rowH.reduce((a, b) => a + b, 0) + rowGap * (rows - 1);
  return {
    min: height, ideal: height, flex: 0.3,
    draw(box) {
      const inn = ctx.card(box, {});
      let y = inn.y;
      ctx.scene.onBackground(c.surface, () => {
        if (block.title) { const t = ctx.text(block.title, "title", { x: inn.x, y, width: inn.w, color: c.ink, maxLines: 2, headingLevel: 3 }); y += t.height + ctx.px(12); }
        const extra = Math.max(0, box.y + box.h - inn.pad - y - (height - 2 * pad - title.height - (title.height ? ctx.px(12) : 0))) / rows;
        steps.forEach((s, i) => {
          const r = Math.floor(i / perRow), k = i % perRow;
          if (k === 0 && r > 0) y += rowH[r - 1] + rowGap + extra;
          const x = inn.x + k * (sw + arrow);
          const accent = tone(ctx, s.tone ?? "accent");
          ctx.scene.circle(x + badge / 2, y + badge / 2, badge / 2, { fill: accent });
          ctx.scene.mark("badge", accent, c.surface);
          ctx.scene.onBackground(accent, () => {
            const label = String(i + 1);
            const f = ctx.font("heading");
            const w = ctx.width(label, "heading");
            ctx.text(label, "heading", { x: x + badge / 2 - w / 2, y: y + badge / 2 - f.size * f.lineHeight / 2, width: w + 2, color: c.inkOnAccent, scoreRole: "number", maxLines: 1, hyphenate: false });
          });
          if (s.icon) ctx.icon(s.icon, x + badge + ctx.px(14), y + (badge - ctx.px(34)) / 2, ctx.px(34), accent, ctx.px(2.2));
          if (k < perRow - 1 && i < steps.length - 1) ctx.icon("arrow-right", x + sw + (arrow - ctx.px(24)) / 2, y + badge / 2 - ctx.px(12), ctx.px(24), c.inkMuted, ctx.px(2.4));
          let yy = y + badge + ctx.px(12);
          const h = ctx.text(s.title, "heading", { x, y: yy, width: sw, color: c.ink, maxLines: 2 });
          yy += h.height + ctx.px(6);
          if (s.body) ctx.text(s.body, "caption", { x, y: yy, width: sw, color: c.inkMuted, maxLines: 6 });
        });
      });
    },
  };
}

// ---------------------------------------------------------------------------------------------------- locator
function locator(ctx, block, width) {
  const { c } = ctx;
  const pad = ctx.space("card");
  const inner = width - 2 * pad;
  const title = block.title ? ctx.measure(block.title, "title", inner, { maxLines: 2 }) : { height: 0 };
  const cap = block.caption ? ctx.measure(block.caption, "caption", inner, { maxLines: 3 }) : { height: 0 };
  const rings = block.outline;
  const all = rings.flat();
  if (block.marker) all.push([block.marker.lon, block.marker.lat]);
  const lons = all.map((p) => p[0]), lats = all.map((p) => p[1]);
  const lon0 = Math.min(...lons), lon1 = Math.max(...lons), lat0 = Math.min(...lats), lat1 = Math.max(...lats);
  const kx = Math.cos((((lat0 + lat1) / 2) * Math.PI) / 180);
  const spanX = (lon1 - lon0) * kx, spanY = lat1 - lat0;
  const aspect = spanY / spanX;
  const mapW = inner;
  const ideal = 2 * pad + title.height + (title.height ? ctx.px(10) : 0) + clampH(mapW * aspect, ctx.px(220), ctx.px(620)) + (cap.height ? ctx.px(10) + cap.height : 0);
  function clampH(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
  return {
    min: 2 * pad + title.height + ctx.px(220) + cap.height, ideal, flex: 1,
    draw(box) {
      const inn = ctx.card(box, {});
      let y = inn.y;
      ctx.scene.onBackground(c.surface, () => {
        if (block.title) { const t = ctx.text(block.title, "title", { x: inn.x, y, width: inn.w, color: c.ink, maxLines: 2, headingLevel: 3 }); y += t.height + ctx.px(10); }
        const areaH = box.y + box.h - inn.pad - y - (cap.height ? cap.height + ctx.px(10) : 0);
        const scale = Math.min(inn.w / spanX, areaH / spanY);
        const ox = inn.x + (inn.w - spanX * scale) / 2, oy = y + (areaH - spanY * scale) / 2;
        const px = (lon) => ox + (lon - lon0) * kx * scale;
        const py = (lat) => oy + (lat1 - lat) * scale;
        const ringPath = (ring) => `${ring.map(([lon, lat], i) => `${i ? "L" : "M"}${n(px(lon))} ${n(py(lat))}`).join("")}Z`;
        for (const ring of block.context ?? []) ctx.scene.path(ringPath(ring), { fill: c.surfaceAlt, stroke: c.rule, strokeWidth: ctx.px(1.5), linejoin: "round" });
        for (const ring of rings) ctx.scene.path(ringPath(ring), { fill: c.surfaceAlt, stroke: c.inkMuted, strokeWidth: ctx.px(2), linejoin: "round" });
        for (const ring of block.region ?? []) ctx.scene.path(ringPath(ring), { fill: mix(c.accent, c.surface, 0.72), stroke: c.accent, strokeWidth: ctx.px(2.5), linejoin: "round" });
        ctx.scene.mark("region", c.accent, c.surface);
        if (block.regionLabel) {
          const ring = (block.region ?? [])[0];
          if (ring) {
            const cx = ring.reduce((s, p) => s + p[0], 0) / ring.length, cy = ring.reduce((s, p) => s + p[1], 0) / ring.length;
            const w = ctx.width(block.regionLabel, "label");
            ctx.scene.onBackground(mix(c.accent, c.surface, 0.72), () => ctx.text(block.regionLabel, "label", { x: px(cx) - w / 2, y: py(cy) - ctx.font("label").size, width: w + 4, color: c.ink, maxLines: 1 }));
          }
        }
        if (block.marker) {
          const mx = px(block.marker.lon), my = py(block.marker.lat);
          ctx.scene.circle(mx, my, ctx.px(17), { fill: c.accent2, opacity: 0.22 });
          ctx.scene.circle(mx, my, ctx.px(8.5), { fill: c.accent2, stroke: c.surface, strokeWidth: ctx.px(3) });
          ctx.scene.mark("marker", c.accent2, c.surface);
          const label = block.marker.label;
          const lw = ctx.width(label, "label") + ctx.px(20), lh = ctx.font("label").size * 1.9;
          const right = mx + ctx.px(16) + lw <= inn.x + inn.w;
          const lx = right ? mx + ctx.px(16) : mx - ctx.px(16) - lw;
          ctx.scene.rect(lx, my - lh / 2, lw, lh, { fill: c.surface, stroke: c.accent2, strokeWidth: ctx.px(2), rx: lh / 2, box: false });
          ctx.scene.report.boxes.push({ x: lx, y: my - lh / 2, w: lw, h: lh, fill: c.surface, chip: true, block: ctx.scene.blockId });
          ctx.scene.onBackground(c.surface, () => ctx.text(label, "label", { x: lx + ctx.px(10), y: my - ctx.font("label").size * 1.2 / 2, width: lw - ctx.px(14), color: c.ink, maxLines: 1 }));
        }
        if (block.caption) ctx.text(block.caption, "caption", { x: inn.x, y: box.y + box.h - inn.pad - cap.height, width: inn.w, color: c.inkMuted, maxLines: 3 });
      });
    },
  };
}

// ---------------------------------------------------------------------------------------------------- sources
function sources(ctx, block, width) {
  const { c } = ctx;
  const items = block.items;
  const colGap = ctx.space("gutter");
  const cols = Math.max(1, Math.min(block.columns ?? (width > ctx.px(1300) ? 2 : 1), items.length));
  const cw = (width - colGap * (cols - 1)) / cols;
  const head = ctx.measure("SOURCES AND METHOD", "kicker", width);
  const per = Math.ceil(items.length / cols);
  const colItems = Array.from({ length: cols }, (_, k) => items.slice(k * per, (k + 1) * per));
  const measured = colItems.map((list) => list.map((t) => ctx.measure(t, "caption", cw, {})));
  const colH = Math.max(...measured.map((m) => m.reduce((s, x) => s + x.height + ctx.px(4), 0)));
  const stamp = block.stamp ? ctx.measure(block.stamp, "caption", width, { maxLines: 2 }) : { height: 0 };
  const height = ctx.px(10) + head.height + ctx.px(8) + colH + (stamp.height ? ctx.px(8) + stamp.height : 0);
  return {
    min: height, ideal: height, flex: 0,
    draw(box) {
      ctx.scene.line(box.x, box.y + ctx.px(2), box.x + box.w, box.y + ctx.px(2), { stroke: c.rule, strokeWidth: ctx.px(1.5) });
      let y = box.y + ctx.px(10);
      ctx.text("SOURCES AND METHOD", "kicker", { x: box.x, y, width: box.w, color: c.inkMuted, scoreRole: "label" });
      y += head.height + ctx.px(8);
      colItems.forEach((list, k) => {
        let yy = y;
        list.forEach((t, i) => { const r = ctx.text(t, "caption", { x: box.x + k * (cw + colGap), y: yy, width: cw, color: c.inkMuted }); yy += r.height + ctx.px(4); });
      });
      if (block.stamp) ctx.text(block.stamp, "caption", { x: box.x, y: y + colH + ctx.px(8), width: box.w, color: c.inkMuted, maxLines: 2 });
    },
  };
}

export const BLOCKS = { header, heroStat, stats, callout, prose, comparison, timeline, process, locator, sources };
