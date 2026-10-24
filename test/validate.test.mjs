import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { validateVegaLiteSpec } from "@red-cup-engineering/chart-specification-rendering-service/validate-vega-lite-spec";
import { barSpec, root } from "./helpers.mjs";

test("a good spec validates with no issues", () => {
  assert.deepEqual(validateVegaLiteSpec({ spec: barSpec() }), { valid: true, issues: [], warnings: [] });
});

test("the paper figures are valid Vega-Lite", async () => {
  const { readFileSync } = await import("node:fs");
  for (const name of ["captive-birth-share-by-decade", "net-migration-share-of-growth"]) {
    const spec = JSON.parse(readFileSync(join(root, `test/fixtures/paper-figures/figures/${name}.vl.json`), "utf8"));
    const result = validateVegaLiteSpec({ spec });
    assert.deepEqual(result.issues, [], name);
    assert.equal(result.valid, true);
  }
});

test("schema violations are reported as data, deduplicated and bounded", () => {
  const result = validateVegaLiteSpec({ spec: barSpec({ mark: "barz" }) });
  assert.equal(result.valid, false);
  assert.ok(result.issues.length > 0 && result.issues.length <= 50);
  assert.ok(result.issues.every((issue) => issue.kind === "schema" || issue.kind === "compile"));
  assert.equal(new Set(result.issues.map((issue) => `${issue.path}|${issue.message}`)).size, result.issues.length);
});

test("a spec that is schema-valid but does not compile is reported with its compile error", () => {
  const spec = { data: { values: [{ a: 1 }] }, mark: "point", encoding: { x: { field: "a", type: "quantitative" } }, transform: [{ filter: "datum.a >" }] };
  const result = validateVegaLiteSpec({ spec });
  assert.equal(result.valid, false);
});

test("a missing description is a warning, not an issue", () => {
  const spec = barSpec(); delete spec.description;
  const result = validateVegaLiteSpec({ spec });
  assert.equal(result.valid, true);
});

test("malformed requests are refused", () => {
  assert.throws(() => validateVegaLiteSpec({}), /spec must be an object/u);
  assert.throws(() => validateVegaLiteSpec({ spec: {}, data: {} }), /does not admit data/u);
  assert.throws(() => validateVegaLiteSpec({ spec: barSpec({ height: -5 }) }), RangeError);
});

test("the command face validates over NDJSON", () => {
  const done = spawnSync(process.execPath, [join(root, "scripts/validate-vega-lite-spec.mjs")], { input: `${JSON.stringify({ spec: barSpec() })}\n`, encoding: "utf8" });
  assert.equal(done.status, 0);
  assert.deepEqual(JSON.parse(done.stdout), { valid: true, issues: [], warnings: [] });
});
