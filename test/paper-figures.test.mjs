// The two figures of the white-repopulation paper, kept as Vega-Lite data and rebuilt here from copies of
// its derived CSVs and source-series record. Golden ni: addresses pin the pinned vega/vega-lite; when either is
// bumped on purpose, re-render, look at the figures, and update them.
import test from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderChartSpecifications } from "@red-cup-engineering/chart-specification-rendering-service/render-chart-specifications";
import { here } from "./helpers.mjs";

const GOLDEN = {
  "captive-birth-share-by-decade": "ni:///sha-256;uB-BPuAyRrGJl1QKzgTXDyaGIieMRkFdmjqRPFPvIew",
  "net-migration-share-of-growth": "ni:///sha-256;fWgoGGqWeKfGDTbOsBqhV4paNu2BwDYl_NjCxr9FSK4",
};

async function render() {
  const dir = mkdtempSync(join(tmpdir(), "chart-paper-"));
  cpSync(join(here, "fixtures", "paper-figures"), dir, { recursive: true });
  const names = Object.keys(GOLDEN);
  const { results } = await renderChartSpecifications({ root: dir, specs: names.map((name) => `figures/${name}.vl.json`) });
  const svgs = Object.fromEntries(names.map((name) => [name, readFileSync(join(dir, "figures", `${name}.svg`), "utf8")]));
  rmSync(dir, { recursive: true, force: true });
  return { results, svgs };
}

test("both figures render, byte-stable, to their golden ni: addresses", async () => {
  const { results } = await render();
  const again = await render();
  assert.deepEqual(results.map((result) => result.ni), again.results.map((result) => result.ni));
  assert.deepEqual(Object.fromEntries(results.map((result) => [result.spec.replace(/^figures\/|\.vl\.json$/gu, ""), result.ni])), GOLDEN);
  for (const result of results) assert.deepEqual(result.warnings, []);
});

test("captive births: hatched 1790s bar, whisker computed from the source-series record, first and last labels", async () => {
  const { svgs } = await render();
  const svg = svgs["captive-birth-share-by-decade"];
  assert.match(svg, /<pattern id="hatch-2a78d6"/u);
  assert.equal([...svg.matchAll(/fill="url\(#hatch-2a78d6\)"/gu)].length, 1);
  // 403,648 captive births over 2,034,000 (45 per 1,000) and 2,938,000 (65 per 1,000) assumed births.
  assert.match(svg, />implies 13\.7–19\.8%</u);
  assert.match(svg, />\(crude birth rate 45–65 per 1,000\)</u);
  assert.match(svg, />16\.2%</u);
  assert.match(svg, />16\.0%</u);
  assert.match(svg, />Births into slavery as a share of U\.S\. births</u);
  assert.equal([...svg.matchAll(/>(\d{4}s)</gu)].length, 7);
});

test("net migration: seven intervals, first and last labelled, dashed half-of-growth reference", async () => {
  const { svgs } = await render();
  const svg = svgs["net-migration-share-of-growth"];
  assert.match(svg, />11\.9%</u);
  assert.match(svg, />32\.3%</u);
  assert.match(svg, />half of growth</u);
  assert.match(svg, /stroke-dasharray="3,3"/u);
  assert.doesNotMatch(svg, /<pattern/u);
  assert.equal([...svg.matchAll(/>(\d{4}–\d{4})</gu)].length, 7);
});
