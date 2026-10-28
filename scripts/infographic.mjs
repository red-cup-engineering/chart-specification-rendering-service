#!/usr/bin/env node
// infographic <render|score|compare|check> ... : the repository CLI of the deterministic infographic engine.
// Each subcommand reads files and writes files (the protocol the next step reads); every refusal is a message on stderr
// and a non-zero exit (2 refusal, 3 stale/drift under check). Same input, same bytes.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { renderInfographic } from "../src/infographic/render.mjs";
import { scoreRender, RUBRIC, COMMON_CRITERIA } from "../src/infographic/score.mjs";
import { rasterizeSvg, decodePng, pixelDescriptors, VIDEO_SIZES } from "../src/infographic/raster.mjs";
import { validateSpec } from "../src/infographic/validate.mjs";
import { mediaPlanAsset } from "../src/infographic/media-plan-asset.mjs";

const refuse = (message, code = 2) => { process.stderr.write(`refused: ${message}\n`); process.exit(code); };
const readJson = (path) => { try { return JSON.parse(readFileSync(path, "utf8")); } catch (error) { return refuse(`cannot read JSON ${path}: ${error.message}`); } };
const stable = (value) => `${JSON.stringify(value, (k, v) => (v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((key) => [key, v[key]])) : v), 1)}\n`;

function parseArgs(argv) {
  const positional = [], flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i].startsWith("--")) { const key = argv[i].slice(2); if (["strict", "check", "live"].includes(key)) flags[key] = true; else flags[key] = argv[(i += 1)]; } else positional.push(argv[i]);
  }
  return { positional, flags };
}

function renderOne(specPath, outDir, flags) {
  const spec = readJson(specPath);
  const issues = validateSpec(spec);
  if (issues.length) refuse(`${specPath} is not a valid infographic spec: ${issues.slice(0, 5).map((i) => `${i.path || "/"} ${i.message}`).join("; ")}`);
  const result = renderInfographic(spec, { textMode: flags.live ? "live" : undefined });
  if (flags.strict && result.warnings.length) refuse(`strict: ${result.warnings.join("; ")}`);
  const id = spec.id ?? basename(specPath, ".json");
  mkdirSync(outDir, { recursive: true });
  const files = { svg: join(outDir, `${id}.svg`), report: join(outDir, `${id}.report.json`) };
  if (flags.check) {
    if (!existsSync(files.svg) || readFileSync(files.svg, "utf8") !== result.svg) { process.stderr.write(`stale: ${files.svg}\n`); process.exit(3); }
    return { id, status: "unchanged", sha256: result.sha256 };
  }
  writeFileSync(files.svg, result.svg);
  writeFileSync(files.report, stable({ id, svgSha256: result.sha256, bytes: result.bytes, spec: result.specDigest, warnings: result.warnings, report: { ...result.report, texts: result.report.texts, boxes: result.report.boxes } }));
  const written = { id, svg: files.svg, report: files.report, sha256: result.sha256, bytes: result.bytes, warnings: result.warnings, scale: result.report.scale, png: [] };
  if (flags.png) {
    for (const key of flags.png.split(",")) {
      const size = VIDEO_SIZES[key];
      if (!size) refuse(`unknown --png size ${key}; one of ${Object.keys(VIDEO_SIZES).join(", ")}`);
      const [w, h] = size;
      const cw = result.report.canvas.width, ch = result.report.canvas.height;
      if (Math.abs(w / h - cw / ch) > 0.01) continue; // only sizes of the canvas's own aspect
      const png = rasterizeSvg(result.svg, { width: w, height: h });
      const path = join(outDir, `${id}.${key}.png`);
      writeFileSync(path, png);
      written.png.push(path);
    }
  }
  return { spec, result, written };
}

const [command, ...rest] = process.argv.slice(2);
const { positional, flags } = parseArgs(rest);
const out = resolve(flags.out ?? ".");

if (command === "render") {
  if (!positional.length) refuse("render needs at least one spec path");
  for (const p of positional) { const r = renderOne(p, out, flags); console.log(JSON.stringify(r.written ?? r)); }
} else if (command === "check") {
  if (!positional.length) refuse("check needs at least one spec path");
  for (const p of positional) console.log(JSON.stringify(renderOne(p, out, { ...flags, check: true })));
} else if (command === "score") {
  if (!positional.length) refuse("score needs at least one spec path");
  for (const p of positional) {
    const { spec, result, written } = renderOne(p, out, flags);
    const score = scoreRender(spec, result);
    const path = join(out, `${written.id}.score.json`);
    writeFileSync(path, stable({ id: written.id, svgSha256: result.sha256, spec: result.specDigest, ...score }));
    console.log(JSON.stringify({ id: written.id, score: score.score, failing: score.failing, file: path }));
  }
} else if (command === "plan-asset") {
  // plan-asset <spec.json> --id <slug> --aspect 9:16|16:9 [--role overlay|frame] [--render-width 540] --out dir
  if (positional.length !== 1 || !flags.id || !flags.aspect) refuse("plan-asset needs one spec, --id <slug> and --aspect 16:9|9:16");
  const spec = readJson(positional[0]);
  const issues = validateSpec(spec);
  if (issues.length) refuse(`${positional[0]} is not a valid infographic spec: ${issues.slice(0, 5).map((i) => `${i.path || "/"} ${i.message}`).join("; ")}`);
  let made;
  try { made = mediaPlanAsset(spec, { id: flags.id, role: flags.role ?? "overlay", planAspect: flags.aspect, renderWidth: flags["render-width"] ? Number(flags["render-width"]) : undefined }); } catch (error) { refuse(error.message); }
  mkdirSync(out, { recursive: true });
  const path = join(out, `${flags.id}.plan-asset.json`);
  writeFileSync(path, stable(made.asset));
  console.log(JSON.stringify({ file: path, identity: made.asset.identity, ...made.report }));
} else if (command === "compare") {
  // compare --manifest benchmark.json --scores a.score.json,b.score.json --svgs a.svg,b.svg --out dir
  if (!flags.manifest || !flags.scores) refuse("compare needs --manifest <benchmark.json> and --scores <a.score.json,...>");
  const manifest = readJson(flags.manifest);
  const baseDir = flags["files-root"] ? resolve(flags["files-root"]) : dirname(resolve(flags.manifest));
  const ours = flags.scores.split(",").map((p) => { const s = readJson(p); const svgPath = p.replace(/\.score\.json$/u, ".svg"); const svg = readFileSync(svgPath, "utf8"); const m = /viewBox="0 0 (\d+) (\d+)"/u.exec(svg); const w = Number(m[1]), h = Number(m[2]); const short = Math.min(w, h); const f = 1080 / short; return { id: s.id, score: s.score, metrics: s.metrics, desc: decodedDescriptors(rasterizeSvg(svg, { width: Math.round(w * f), height: Math.round(h * f) })) }; });
  const theirs = manifest.items.map((item) => {
    const file = resolve(baseDir, item.file);
    if (!existsSync(file)) refuse(`benchmark file ${file} does not exist`);
    return { id: item.id, title: item.title, provider: item.provider, size: item.size, audit: item.audit, desc: decodedDescriptors(readFileSync(file)) };
  });
  mkdirSync(out, { recursive: true });
  const comparison = { rubric: "infographic-quality-rubric/1", commonCriteria: COMMON_CRITERIA, weights: Object.fromEntries(Object.entries(RUBRIC).map(([k, v]) => [k, v.weight])), ours, benchmark: theirs, judgment: manifest.judgment ?? null };
  writeFileSync(join(out, "comparison.json"), stable(comparison));
  console.log(JSON.stringify({ ours: ours.map((o) => [o.id, o.score]), benchmark: theirs.map((t) => t.id), file: join(out, "comparison.json") }));
} else {
  refuse("usage: infographic <render|check|score|plan-asset|compare> [--out dir] [--png 1080p-16x9,1080x1920-9x16] [--strict] [--live] <spec.json>...");
}

function decodedDescriptors(pngBytes) { return pixelDescriptors(decodePng(pngBytes)); }
