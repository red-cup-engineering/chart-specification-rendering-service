// Specs arrive from buyers and Vega evaluates the expressions they contain. The pinned vega (>= 6.2.0, with
// vega-expression >= 5.2.1 and vega-functions > 6.1.0) carries the fixes for the expression abuses that
// reached `toString`/`constructor` and for `setdata`; these pin that no such expression runs code.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderVegaLiteSpecAsSvg } from "@red-cup-engineering/chart-specification-rendering-service/render-vega-lite-spec-as-svg";
import { barSpec, root } from "./helpers.mjs";

const MARK = "__vegaExpressionEscaped";
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const lock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8"));
const atLeast = (version, minimum) => {
  const [a, b] = [version, minimum].map((text) => text.split(".").map(Number));
  for (let i = 0; i < 3; i += 1) if (a[i] !== b[i]) return a[i] > b[i];
  return true;
};

test("the pinned vega, vega-expression and vega-functions are past the XSS advisories", () => {
  assert.ok(atLeast(pkg.dependencies.vega, "6.2.0"), "vega >= 6.2.0");
  assert.equal(pkg.dependencies.vega.split(".")[0], "6");
  assert.ok(atLeast(pkg.dependencies["vega-lite"], "6.0.0"));
  assert.ok(atLeast(lock.packages["node_modules/vega-expression"].version, "5.2.1"), "vega-expression >= 5.2.1");
  assert.ok(atLeast(lock.packages["node_modules/vega-functions"].version, "6.1.1"), "vega-functions > 6.1.0");
});

const ESCAPES = [
  `toString.constructor('globalThis.${MARK}=1')()`,
  `(1).constructor.constructor('globalThis.${MARK}=1')()`,
  `datum['constructor']['constructor']('globalThis.${MARK}=1')()`,
  `''['constructor']['constructor']('globalThis.${MARK}=1')()`,
  `toString['call'].constructor('globalThis.${MARK}=1')()`,
  `[].map.constructor('globalThis.${MARK}=1')()`,
  `this.constructor.constructor('globalThis.${MARK}=1')()`,
  `{}.__proto__.constructor.constructor('globalThis.${MARK}=1')()`,
];

test("a calculate transform that reaches Function through toString/constructor is refused or inert", async () => {
  delete globalThis[MARK];
  for (const expression of ESCAPES) {
    const spec = barSpec();
    spec.transform = [{ calculate: expression, as: "boom" }];
    try { await renderVegaLiteSpecAsSvg({ spec }); } catch { /* refusing is a correct answer */ }
    assert.equal(globalThis[MARK], undefined, `ran code: ${expression}`);
  }
});

test("a signal expression that reaches Function through toString/constructor is refused or inert", async () => {
  delete globalThis[MARK];
  for (const expression of ESCAPES) {
    const spec = barSpec();
    spec.params = [{ name: "p", expr: expression }];
    try { await renderVegaLiteSpecAsSvg({ spec }); } catch { /* refusing is a correct answer */ }
    assert.equal(globalThis[MARK], undefined, `ran code: ${expression}`);
  }
});

test("markup in a title, description or data value is escaped in the SVG, never carried as markup", async () => {
  const payload = `</title><script>globalThis.${MARK}=1</script><title>`;
  const spec = barSpec({ title: payload, description: payload });
  const { svg } = await renderVegaLiteSpecAsSvg({ spec });
  assert.doesNotMatch(svg, /<script/u);
  assert.match(svg, /&lt;script&gt;/u);
});
