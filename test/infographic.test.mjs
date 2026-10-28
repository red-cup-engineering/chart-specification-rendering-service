import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  renderInfographic, validateSpec, THEMES, checkTheme, loadFace, measureText, wrapText, hyphenationPoints, contrast, canonicalJson,
} from "@red-cup-engineering/chart-specification-rendering-service/infographic";
import { scoreRender } from "../src/infographic/score.mjs";
import { mediaPlanAsset, svgIsSelfContained, niOf, MAX_INLINE_SVG_CHARS } from "../src/infographic/media-plan-asset.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const specDir = join(root, "examples/specs");
const specs = readdirSync(specDir).filter((f) => f.endsWith(".json")).sort().map((f) => [f.replace(/\.json$/u, ""), JSON.parse(readFileSync(join(specDir, f), "utf8"))]);
const golden = JSON.parse(readFileSync(join(root, "test/golden/infographic-digests.json"), "utf8"));
const byId = (id) => specs.find(([key]) => key === id)[1];

test("every shipped example spec is valid and renders without warnings", () => {
  assert.ok(specs.length >= 4);
  for (const [id, spec] of specs) {
    assert.deepEqual(validateSpec(spec), [], id);
    const r = renderInfographic(spec);
    assert.deepEqual(r.warnings, [], id);
    assert.ok(r.svg.startsWith("<svg ") && r.svg.endsWith("</svg>\n"));
    assert.equal(r.sha256, createHash("sha256").update(r.svg, "utf8").digest("hex"));
  }
});

test("golden: the SVG bytes of each example are the committed digests", () => {
  for (const [id, spec] of specs) assert.equal(renderInfographic(spec).sha256, golden[id], `${id} drifted; if intended, run: node test/golden/update-infographic-digests.mjs`);
  assert.deepEqual(Object.keys(golden).sort(), specs.map(([id]) => id));
});

test("determinism: key order of the spec does not change the bytes; two renders are identical", () => {
  const spec = byId("commission-an-infographic");
  const reordered = JSON.parse(JSON.stringify(spec, (k, v) => (v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).reverse()) : v)));
  assert.equal(canonicalJson(reordered), canonicalJson(spec));
  assert.equal(renderInfographic(spec).specDigest, renderInfographic(reordered).specDigest);
  assert.equal(renderInfographic(spec).svg, renderInfographic(spec).svg);
});

test("determinism: separate processes under other time zones, locales and clocks agree byte for byte", () => {
  const code = `import { renderInfographic } from ${JSON.stringify(new URL("../src/infographic/render.mjs", import.meta.url).href)};
import { readFileSync } from "node:fs";
const spec = JSON.parse(readFileSync(${JSON.stringify(join(specDir, "commission-an-infographic.json"))}, "utf8"));
process.stdout.write(renderInfographic(spec).sha256);`;
  const run = (env) => { const done = spawnSync(process.execPath, ["--input-type=module", "-e", code], { encoding: "utf8", env: { PATH: process.env.PATH, ...env } }); assert.equal(done.status, 0, done.stderr); return done.stdout; };
  const a = run({ TZ: "UTC", LANG: "C" });
  assert.equal(run({ TZ: "Pacific/Auckland", LANG: "de_DE.UTF-8", LC_ALL: "de_DE.UTF-8" }), a);
  assert.equal(a, golden["commission-an-infographic"]);
});

test("source of the engine reads no clock, randomness, environment or network", () => {
  const dir = join(root, "src/infographic");
  for (const f of readdirSync(dir).filter((n) => n.endsWith(".mjs") && n !== "raster.mjs")) assert.doesNotMatch(readFileSync(join(dir, f), "utf8"), /Math\.random|Date\.now|new Date\(|performance\.now|process\.env|fetch\(/u, f);
});

test("font metrics: advances are real, kerning applies, unknown glyphs are reported", () => {
  const f = loadFace("sans");
  assert.equal(f.unitsPerEm, 1000);
  assert.ok(f.advance(0x57) > f.advance(0x69) * 2, "W is much wider than i");
  const kerned = measureText("sans", "AV", 100).width, plain = (f.advance(0x41) + f.advance(0x56)) * 0.1;
  assert.ok(kerned < plain, `AV kerns (${kerned} < ${plain})`);
  assert.equal(measureText("sans", "abc", 10).missing, 0);
  assert.equal(measureText("sans", "中", 10).missing, 1);
  assert.equal(measureText("sans", "−", 10).missing, 0, "minus sign is aliased");
  assert.ok(f.path(0x41).startsWith("M"));
});

test("line breaking: no line exceeds the width, bold markup works, long words hyphenate, NBSP and digit ranges never split", () => {
  const w = wrapText("The **quick** brown fox jumps over the lazy dog because internationalization matters", { face: "sans", size: 24, width: 260 });
  assert.ok(w.lines.length >= 3);
  for (const line of w.lines) assert.ok(line.width <= 260.01, `${line.width}`);
  assert.ok(w.lines.some((l) => l.runs.some((r) => r.face === "sansBold")));
  assert.ok(hyphenationPoints("internationalization").length >= 2);
  const nb = wrapText("warmest 41.9 °F today", { face: "sans", size: 24, width: 140 });
  assert.ok(nb.lines.some((l) => l.runs.map((r) => r.text).join("").includes("41.9 °F")));
  const range = wrapText("from 1951–1980 only", { face: "sans", size: 24, width: 100 });
  assert.ok(range.lines.every((l) => !/1951–$/u.test(l.runs.map((r) => r.text).join(""))));
  const truncated = wrapText("a b c d e f g h i j k l m n o p q r s t u v w x y z", { face: "sans", size: 24, width: 80, maxLines: 2 });
  assert.equal(truncated.truncated, true);
});

test("themes keep their contrast promises (WCAG 2.x AA text, 3:1 marks)", () => {
  for (const theme of Object.values(THEMES)) assert.deepEqual(checkTheme(theme).filter((r) => !r.ok), [], theme.name);
  assert.ok(contrast("#000000", "#ffffff") > 20.9);
});

test("validation refuses malformed specs with a path", () => {
  const bad = structuredClone(byId("commission-an-infographic"));
  bad.blocks[1].type = "pie";
  assert.ok(validateSpec(bad).some((i) => i.path.includes("/blocks/1/type")));
  const extra = structuredClone(byId("commission-an-infographic"));
  extra.blocks[0].colour = "red";
  assert.ok(validateSpec(extra).some((i) => i.message.includes("not allowed")));
  assert.throws(() => renderInfographic({ version: 1, meta: { title: "x", description: "too short" }, blocks: [] }), /invalid/u);
});

test("content that cannot fit is reported, not silently clipped", () => {
  const tiny = structuredClone(byId("commission-an-infographic"));
  for (let i = 0; i < 6; i += 1) tiny.blocks.splice(1, 0, { type: "prose", id: `extra${i}`, heading: "More content than the page can hold", paragraphs: ["A paragraph of ordinary length that takes a few lines of body text at this width so the stack grows."] });
  const r = renderInfographic(tiny);
  assert.equal(r.report.fits, false);
  assert.ok(r.warnings.some((w) => /needs/u.test(w)));
});

test("fixture and derived data are badged in the metadata and drawn", () => {
  const fan = renderInfographic(byId("scenario-fan-fixture"));
  assert.ok(fan.report.provenance.some((p) => p.kind === "fixture"));
  assert.match(fan.svg, /fixtureData/u);
  assert.ok(fan.report.texts.some((t) => t.text === "FIXTURE DATA"));
});

test("accessibility: title, description carrying the text, language, headings, reading order", () => {
  const r = renderInfographic(byId("climate-duluth-landscape"));
  assert.match(r.svg, /role="img"/u);
  assert.match(r.svg, /<title id="[^"]+">Duluth, Minnesota: a warmer place, measured<\/title>/u);
  assert.match(r.svg, /lang="en"/u);
  assert.match(r.svg, /role="heading" aria-level="1"/u);
  assert.match(r.svg, /Text content in reading order: /u);
  assert.ok(r.report.transcript.length > 10);
});

test("transparent overlay canvas draws no background rectangle and keeps the safe area", () => {
  const o = structuredClone(byId("commission-an-infographic"));
  o.canvas = { preset: "landscape-16x9", background: "transparent", safeArea: 0.05 };
  const r = renderInfographic(o);
  assert.doesNotMatch(r.svg, /<rect width="1920" height="1080"/u);
  assert.ok(r.report.inner.x >= 96 - 0.01 && r.report.inner.y >= 54 - 0.01, "safe area respected");
});

test("live text mode emits <text> and the same layout", () => {
  const base = byId("commission-an-infographic");
  const live = renderInfographic(base, { textMode: "live" });
  assert.match(live.svg, /<text /u);
  assert.equal(live.report.texts.length, renderInfographic(base).report.texts.length);
});

test("scorer: the explainer example passes every rubric line; scores are deterministic", () => {
  const spec = byId("commission-an-infographic");
  const s = scoreRender(spec, renderInfographic(spec));
  assert.deepEqual(s.failing, []);
  assert.ok(s.score >= 97, String(s.score));
  assert.deepEqual(scoreRender(spec, renderInfographic(spec)), s);
});

test("scorer detects defects: a collision and a contrast failure lower the score", () => {
  const spec = byId("commission-an-infographic");
  const result = renderInfographic(spec);
  const broken = structuredClone(result);
  broken.report.texts.push({ ...broken.report.texts[0], text: "overlap", role: "body" });
  broken.report.texts.push({ ...broken.report.texts[3], color: "#cccccc", bg: "#ffffff", y: -500 });
  const s = scoreRender(spec, broken, { reRender: false });
  assert.ok(s.metrics.collisionFree.value < 1);
  assert.ok(s.metrics.contrast.value < 1);
  assert.ok(s.score < scoreRender(spec, result).score);
});

test("CLI: render writes svg+report, check detects drift, bad specs are refused with exit 2", () => {
  const out = mkdtempSync(join(tmpdir(), "ig-"));
  const cli = join(root, "scripts/infographic.mjs");
  const spec = join(specDir, "commission-an-infographic.json");
  const run = (args) => spawnSync(process.execPath, [cli, ...args], { encoding: "utf8" });
  const first = run(["render", spec, "--out", out]);
  assert.equal(first.status, 0, first.stderr);
  assert.equal(JSON.parse(first.stdout).sha256, golden["commission-an-infographic"]);
  assert.equal(run(["check", spec, "--out", out]).status, 0);
  const stale = join(out, "commission-an-infographic.svg");
  writeFileSync(stale, "<svg/>");
  assert.equal(run(["check", spec, "--out", out]).status, 3);
  const bad = join(out, "bad.json");
  writeFileSync(bad, '{"version":1}');
  const refused = run(["render", bad, "--out", out]);
  assert.equal(refused.status, 2);
  assert.match(refused.stderr, /refused/u);
});

test("media-plan slot: an infographic fits a shot asset without adaptation (self-contained, identity, aspect, transparent overlay)", () => {
  const spec = byId("climate-duluth-portrait");
  const { asset, report } = mediaPlanAsset(spec, { id: "duluth-summary", role: "overlay", planAspect: "9:16", renderWidth: 1080 });
  assert.deepEqual(Object.keys(asset).sort(), ["id", "identity", "mediaType", "producer", "role", "svg"]);
  assert.equal(asset.mediaType, "image/svg+xml");
  assert.equal(asset.identity, niOf(asset.svg));
  assert.match(asset.identity, /^ni:\/\/\/sha-256;[A-Za-z0-9_-]{43}$/u);
  assert.ok(asset.svg.length <= MAX_INLINE_SVG_CHARS && svgIsSelfContained(asset.svg));
  assert.doesNotMatch(asset.svg, /<rect width="1080" height="1920"/u, "overlay is transparent");
  assert.equal(report.canvas.join("x"), "1080x1920");
  assert.equal(mediaPlanAsset(spec, { id: "duluth-summary", role: "overlay", planAspect: "9:16", renderWidth: 1080 }).asset.identity, asset.identity);
  const frame = mediaPlanAsset(spec, { id: "duluth-frame", role: "frame", planAspect: "9:16" });
  assert.match(frame.asset.svg, /<rect width="1080" height="1920"/u, "a frame is opaque");
});

test("media-plan slot: a wrong aspect is refused instead of letterboxed; live text and unsafe SVG are not admitted", () => {
  assert.throws(() => mediaPlanAsset(byId("climate-duluth-landscape"), { id: "x", planAspect: "9:16" }), /ASPECT_MISMATCH/u);
  assert.throws(() => mediaPlanAsset(byId("climate-duluth-landscape"), { id: "Bad Id", planAspect: "16:9" }), /slug/u);
  assert.equal(svgIsSelfContained('<svg xmlns="http://www.w3.org/2000/svg"><image href="https://x.test/a.png"/></svg>'), false);
  assert.equal(svgIsSelfContained('<svg xmlns="http://www.w3.org/2000/svg"><use href="#a"/></svg>'), true);
  const live = mediaPlanAsset(byId("climate-duluth-landscape"), { id: "live", planAspect: "16:9" });
  assert.doesNotMatch(live.asset.svg, /<text /u, "slot assets always use outlined text");
});
