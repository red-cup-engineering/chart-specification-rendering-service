import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderChartSpecifications } from "@red-cup-engineering/chart-specification-rendering-service/render-chart-specifications";
import { barSpec, root } from "./helpers.mjs";

const cli = join(root, "scripts/render-chart-specifications.mjs");
const run = (args, options = {}) => spawnSync(process.execPath, [cli, ...args], { encoding: "utf8", ...options });

function repository() {
  const dir = mkdtempSync(join(tmpdir(), "chart-cli-"));
  mkdirSync(join(dir, "figures"));
  mkdirSync(join(dir, "data"));
  writeFileSync(join(dir, "data", "rows.csv"), "k,v\na,3\nb,5\n");
  writeFileSync(join(dir, "figures", "two-bars.vl.json"), JSON.stringify(barSpec({ data: { url: "../data/rows.csv" } })));
  return dir;
}

test("renders <name>.svg beside the spec, reads data relative to the spec, and is idempotent", () => {
  const dir = repository();
  try {
    const first = run(["--root", dir, "figures/two-bars.vl.json"]);
    assert.equal(first.status, 0, first.stderr);
    const result = JSON.parse(first.stdout);
    assert.equal(result.svg, "figures/two-bars.svg");
    assert.equal(result.status, "written");
    const text = readFileSync(join(dir, "figures", "two-bars.svg"), "utf8");
    assert.match(text, /^<svg /u);
    assert.equal(text.length, readFileSync(join(dir, "figures", "two-bars.svg")).length);
    const second = JSON.parse(run(["--root", dir, "figures/two-bars.vl.json"]).stdout);
    assert.equal(second.status, "unchanged");
    assert.equal(second.sha256, result.sha256);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("--out writes the SVG elsewhere and leaves the spec directory alone", () => {
  const dir = repository();
  try {
    const done = run(["--root", dir, "--out", "build", "figures/two-bars.vl.json"]);
    assert.equal(done.status, 0, done.stderr);
    assert.ok(existsSync(join(dir, "build", "two-bars.svg")));
    assert.ok(!existsSync(join(dir, "figures", "two-bars.svg")));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("--check exits 3 on a stale or missing SVG and writes nothing", () => {
  const dir = repository();
  try {
    assert.equal(run(["--root", dir, "--check", "figures/two-bars.vl.json"]).status, 3);
    assert.ok(!existsSync(join(dir, "figures", "two-bars.svg")));
    assert.equal(run(["--root", dir, "figures/two-bars.vl.json"]).status, 0);
    assert.equal(run(["--root", dir, "--check", "figures/two-bars.vl.json"]).status, 0);
    writeFileSync(join(dir, "data", "rows.csv"), "k,v\na,3\nb,9\n");
    assert.equal(run(["--root", dir, "--check", "figures/two-bars.vl.json"]).status, 3);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("several specs in one call, in the order given", async () => {
  const dir = repository();
  try {
    writeFileSync(join(dir, "figures", "other.vl.json"), JSON.stringify(barSpec({ title: "Other", data: { url: "../data/rows.csv" } })));
    const { results, stale } = await renderChartSpecifications({ root: dir, specs: ["figures/other.vl.json", "figures/two-bars.vl.json"] });
    assert.deepEqual(results.map((result) => result.svg), ["figures/other.svg", "figures/two-bars.svg"]);
    assert.equal(stale, 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("refuses specs and data outside the root, including through symlinks, and any network url", () => {
  const dir = repository();
  const outside = mkdtempSync(join(tmpdir(), "chart-outside-"));
  try {
    writeFileSync(join(outside, "secret.csv"), "k,v\na,1\n");
    writeFileSync(join(outside, "x.vl.json"), JSON.stringify(barSpec()));
    assert.match(run(["--root", dir, join(outside, "x.vl.json")]).stderr, /outside the root/u);
    writeFileSync(join(dir, "figures", "escape.vl.json"), JSON.stringify(barSpec({ data: { url: "../../secret.csv" } })));
    assert.match(run(["--root", dir, "figures/escape.vl.json"]).stderr, /outside the root/u);
    symlinkSync(join(outside, "secret.csv"), join(dir, "data", "link.csv"));
    writeFileSync(join(dir, "figures", "link.vl.json"), JSON.stringify(barSpec({ data: { url: "../data/link.csv" } })));
    assert.match(run(["--root", dir, "figures/link.vl.json"]).stderr, /resolves outside the root/u);
    writeFileSync(join(dir, "figures", "net.vl.json"), JSON.stringify(barSpec({ data: { url: "https://example.com/x.csv" } })));
    const net = run(["--root", dir, "figures/net.vl.json"]);
    assert.equal(net.status, 2);
    assert.match(net.stderr, /not a relative path/u);
    assert.ok(!existsSync(join(dir, "figures", "net.svg")));
  } finally { rmSync(dir, { recursive: true, force: true }); rmSync(outside, { recursive: true, force: true }); }
});

test("usage errors exit 2", () => {
  assert.equal(run([]).status, 2);
  assert.equal(run(["--root", "."]).status, 2);
  assert.equal(run(["--bogus"]).status, 2);
  assert.equal(run(["--help"]).status, 0);
});

test("the CLI renders what the operation renders", async () => {
  const dir = repository();
  try {
    const { renderVegaLiteSpecAsSvg } = await import("@red-cup-engineering/chart-specification-rendering-service/render-vega-lite-spec-as-svg");
    const expected = await renderVegaLiteSpecAsSvg({ spec: barSpec({ data: { url: "../data/rows.csv" } }), baseUrl: "figures", data: { "data/rows.csv": "k,v\na,3\nb,5\n" } });
    run(["--root", dir, "figures/two-bars.vl.json"]);
    assert.equal(readFileSync(join(dir, "figures", "two-bars.svg"), "utf8"), expected.svg);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("--png rasterizes through rsvg-convert when it is installed", { skip: spawnSync("rsvg-convert", ["--version"]).error ? "rsvg-convert is not installed" : false }, () => {
  const dir = repository();
  try {
    const done = run(["--root", dir, "--png", "figures/two-bars.vl.json"]);
    assert.equal(done.status, 0, done.stderr);
    assert.deepEqual([...readFileSync(join(dir, "figures", "two-bars.png")).subarray(1, 4)], [80, 78, 71]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

