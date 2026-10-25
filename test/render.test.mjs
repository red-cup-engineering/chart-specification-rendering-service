import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { renderVegaLiteSpecAsSvg } from "@red-cup-engineering/chart-specification-rendering-service/render-vega-lite-spec-as-svg";
import { barSpec, hatchedSpec, root } from "./helpers.mjs";

test("renders a described spec to an SVG whose ni address, size and media type are those of its UTF-8 text", async () => {
  const result = await renderVegaLiteSpecAsSvg({ spec: barSpec() });
  assert.ok(result.svg.startsWith("<svg "));
  assert.ok(result.svg.endsWith("</svg>\n"));
  assert.equal(result.ni, `ni:///sha-256;${createHash("sha256").update(result.svg, "utf8").digest("base64url")}`);
  assert.equal(result.size, Buffer.byteLength(result.svg, "utf8"));
  assert.equal(result.mediaType, "image/svg+xml");
  assert.equal(result.sha256, undefined);
  assert.deepEqual(result.warnings, []);
});

test("determinism: two renders in one process are byte-identical", async () => {
  const [a, b] = [await renderVegaLiteSpecAsSvg({ spec: barSpec() }), await renderVegaLiteSpecAsSvg({ spec: barSpec() })];
  assert.equal(a.svg, b.svg);
  assert.equal(a.ni, b.ni);
});

test("determinism: concurrent renders equal sequential renders, whatever the order", async () => {
  const specs = [barSpec(), hatchedSpec(), barSpec({ title: "Other" })];
  const sequential = [];
  for (const spec of specs) sequential.push((await renderVegaLiteSpecAsSvg({ spec })).ni);
  const concurrent = await Promise.all([...specs].reverse().map((spec) => renderVegaLiteSpecAsSvg({ spec })));
  assert.deepEqual(concurrent.map((result) => result.ni).reverse(), sequential);
});

test("determinism: separate processes, with different time zones, locales and clocks, agree byte for byte", () => {
  const request = JSON.stringify({ spec: barSpec() });
  const run = (env) => {
    const done = spawnSync(process.execPath, [join(root, "scripts/render-vega-lite-spec-as-svg.mjs")], { input: `${request}\n`, encoding: "utf8", env: { PATH: process.env.PATH, ...env } });
    assert.equal(done.status, 0, done.stderr);
    return done.stdout;
  };
  const first = run({ TZ: "UTC", LANG: "C" });
  assert.equal(run({ TZ: "Pacific/Auckland", LANG: "de_DE.UTF-8", LC_ALL: "de_DE.UTF-8" }), first);
  assert.match(JSON.parse(first).ni, /^ni:\/\/\/sha-256;[A-Za-z0-9_-]{43}$/u);
});

test("temporal axes render the same in any host time zone: renders pin UTC and restore the host zone", async () => {
  const spec = barSpec({
    data: { values: [{ t: "2020-01-01", v: 1 }, { t: "2021-01-01", v: 2 }] },
    mark: "line",
    encoding: { x: { field: "t", type: "temporal", timeUnit: "year" }, y: { field: "v", type: "quantitative" } },
  });
  const request = JSON.stringify({ spec });
  const run = (TZ) => spawnSync(process.execPath, [join(root, "scripts/render-vega-lite-spec-as-svg.mjs")], { input: `${request}\n`, encoding: "utf8", env: { PATH: process.env.PATH, TZ } }).stdout;
  assert.equal(run("UTC"), run("America/Los_Angeles"));
  assert.equal(run("UTC"), run("Pacific/Auckland"));
  const before = process.env.TZ;
  process.env.TZ = "Asia/Tokyo";
  try { await renderVegaLiteSpecAsSvg({ spec }); assert.equal(process.env.TZ, "Asia/Tokyo"); }
  finally { if (before === undefined) delete process.env.TZ; else process.env.TZ = before; }
});

test("text stays text, with title and description for assistive technology", async () => {
  const { svg } = await renderVegaLiteSpecAsSvg({ spec: barSpec({ title: "Cats & <dogs>" }) });
  assert.match(svg, /<text /u);
  assert.doesNotMatch(svg, /<image|<foreignObject/u);
  assert.match(svg, /<title id="(vl-[0-9a-f]{8})-title">Cats &amp; &lt;dogs&gt;<\/title>/u);
  assert.match(svg, /<desc id="vl-[0-9a-f]{8}-desc">Two bars: a is 3, b is 5\.<\/desc>/u);
  assert.match(svg, /role="img" aria-labelledby="vl-[0-9a-f]{8}-title" aria-describedby="vl-[0-9a-f]{8}-desc"/u);
});

test("a spec with no description renders with a warning, not silently inaccessible", async () => {
  const { warnings, svg } = await renderVegaLiteSpecAsSvg({ spec: barSpec({ description: undefined }) });
  assert.match(warnings.join("\n"), /no description/u);
  assert.doesNotMatch(svg, /<desc /u);
});

test("hatching: url(#hatch-rrggbb) fills are defined as SVG patterns in a deterministic defs block", async () => {
  const { svg, warnings } = await renderVegaLiteSpecAsSvg({ spec: hatchedSpec() });
  assert.equal([...svg.matchAll(/<pattern id="hatch-2a78d6"/gu)].length, 1);
  assert.match(svg, /<pattern id="hatch-2a78d6" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate\(45\)"><line x1="0" y1="0" x2="0" y2="4" stroke="#2a78d6" stroke-width="1.4"\/><\/pattern>/u);
  assert.match(svg, /fill="url\(#hatch-2a78d6\)"/u);
  assert.deepEqual(warnings, []);
});

test("hatching: no defs when unused; several colors are defined once each, in sorted order", async () => {
  assert.doesNotMatch((await renderVegaLiteSpecAsSvg({ spec: barSpec() })).svg, /<defs>/u);
  const spec = barSpec({
    data: { values: [{ k: "a", v: 3 }, { k: "b", v: 5 }, { k: "c", v: 2 }] },
    encoding: {
      x: { field: "k", type: "nominal" },
      y: { field: "v", type: "quantitative" },
      fill: { condition: [{ test: "datum.k === 'a'", value: "url(#hatch-d62728)" }, { test: "datum.k === 'b'", value: "url(#hatch-2a78d6)" }], value: "url(#hatch-d62728)" },
    },
  });
  const { svg } = await renderVegaLiteSpecAsSvg({ spec });
  assert.deepEqual([...svg.matchAll(/<pattern id="(hatch-[0-9a-f]{6})"/gu)].map((match) => match[1]), ["hatch-2a78d6", "hatch-d62728"]);
});

test("a fill that names an undefined pattern is reported", async () => {
  const spec = hatchedSpec();
  spec.encoding.fill.condition.value = "url(#stripes)";
  const { warnings } = await renderVegaLiteSpecAsSvg({ spec });
  assert.match(warnings.join("\n"), /url\(#stripes\) is not defined/u);
});

test("data: an inline array supplies the rows of a spec without top-level data", async () => {
  const spec = barSpec(); delete spec.data;
  const inline = await renderVegaLiteSpecAsSvg({ spec, data: [{ k: "a", v: 3 }, { k: "b", v: 5 }] });
  assert.equal(inline.svg, (await renderVegaLiteSpecAsSvg({ spec: barSpec() })).svg);
  await assert.rejects(renderVegaLiteSpecAsSvg({ spec: barSpec(), data: [] }), /already declares top-level data/u);
});

test("data: spec urls resolve against baseUrl in the supplied file map, as text or JSON", async () => {
  const spec = barSpec({ data: { url: "../data/rows.csv" } });
  const viaCsv = await renderVegaLiteSpecAsSvg({ spec, baseUrl: "figures", data: { "data/rows.csv": "k,v\na,3\nb,5\n" } });
  assert.equal(viaCsv.svg, (await renderVegaLiteSpecAsSvg({ spec: barSpec() })).svg);
  const jsonSpec = barSpec({ data: { url: "rows.json" } });
  const viaJson = await renderVegaLiteSpecAsSvg({ spec: jsonSpec, data: { "./rows.json": [{ k: "a", v: 3 }, { k: "b", v: 5 }] } });
  assert.equal(viaJson.svg, viaCsv.svg);
});

test("data: a url the file map does not supply is refused by name", async () => {
  await assert.rejects(renderVegaLiteSpecAsSvg({ spec: barSpec({ data: { url: "rows.csv" } }), data: {} }), /"rows\.csv", which data does not supply/u);
  await assert.rejects(renderVegaLiteSpecAsSvg({ spec: barSpec({ data: { url: "rows.csv" } }) }), /which data does not supply/u);
});

test("data: network, absolute, scheme and escaping urls are refused, and nothing is fetched", async (t) => {
  const fetched = [];
  t.mock.method(globalThis, "fetch", async (...args) => { fetched.push(args); throw new Error("network used"); });
  for (const url of ["https://example.com/rows.csv", "http://127.0.0.1/rows.csv", "file:///etc/passwd", "/etc/passwd", "//example.com/rows.csv", "../outside.csv", "a/../../outside.csv", "a\\b.csv"]) {
    await assert.rejects(renderVegaLiteSpecAsSvg({ spec: barSpec({ data: { url } }), data: { "outside.csv": "k,v\na,1\n" } }), TypeError, url);
  }
  await assert.rejects(renderVegaLiteSpecAsSvg({ spec: barSpec({ data: { url: "rows.csv" } }), baseUrl: "https://example.com/", data: { "rows.csv": "k,v\n" } }), /baseUrl/u);
  await assert.rejects(renderVegaLiteSpecAsSvg({ spec: barSpec(), data: { "https://example.com/rows.csv": "k,v\n" } }), /not a relative path/u);
  assert.deepEqual(fetched, []);
});

test("data: lookup transforms and layers read their urls through the same file map", async () => {
  const spec = barSpec({
    data: { url: "rows.csv" },
    transform: [{ lookup: "k", from: { data: { url: "labels.csv" }, key: "k", fields: ["label"] } }],
    mark: "bar",
    encoding: { x: { field: "label", type: "nominal" }, y: { field: "v", type: "quantitative" } },
  });
  const result = await renderVegaLiteSpecAsSvg({ spec, data: { "rows.csv": "k,v\na,3\nb,5\n", "labels.csv": "k,label\na,Alpha\nb,Beta\n" } });
  assert.match(result.svg, />Alpha</u);
  await assert.rejects(renderVegaLiteSpecAsSvg({ spec, data: { "rows.csv": "k,v\na,3\n" } }), /labels\.csv/u);
});

test("a data file that cannot be parsed is refused, not rendered empty", async () => {
  await assert.rejects(renderVegaLiteSpecAsSvg({ spec: barSpec({ data: { url: "rows.json" } }), data: { "rows.json": "{not json" } }), /Data ingestion failed/u);
});

test("malformed requests are refused", async () => {
  await assert.rejects(renderVegaLiteSpecAsSvg(null), TypeError);
  await assert.rejects(renderVegaLiteSpecAsSvg({}), /spec must be an object/u);
  await assert.rejects(renderVegaLiteSpecAsSvg({ spec: barSpec(), extra: 1 }), /does not admit extra/u);
  await assert.rejects(renderVegaLiteSpecAsSvg({ spec: barSpec(), data: "rows" }), /data must be an object/u);
  await assert.rejects(renderVegaLiteSpecAsSvg({ spec: { mark: "bar", encoding: { x: { field: "a", type: "nominal" }, y: { field: "b", type: "nonsense" } }, data: { values: [] } } }), TypeError);
  await assert.rejects(renderVegaLiteSpecAsSvg({ spec: barSpec({ width: 1e9 }) }), RangeError);
  await assert.rejects(renderVegaLiteSpecAsSvg({ spec: barSpec({ title: "x".repeat(2 * 1024 * 1024) }) }), RangeError);
});

test("the command face reads NDJSON, writes NDJSON, and renders refusals as data with exit 2", () => {
  const input = [JSON.stringify({ spec: barSpec() }), JSON.stringify({ spec: barSpec({ data: { url: "https://example.com/x.csv" } }) }), JSON.stringify({ nospec: true })].join("\n");
  const done = spawnSync(process.execPath, [join(root, "scripts/render-vega-lite-spec-as-svg.mjs")], { input, encoding: "utf8" });
  const lines = done.stdout.trim().split("\n").map((line) => JSON.parse(line));
  assert.equal(done.status, 2);
  assert.equal(lines.length, 3);
  assert.match(lines[0].svg, /^<svg /u);
  assert.equal(lines[1].ok, false);
  assert.equal(lines[1].refusal.reason, "TypeError");
  assert.equal(lines[2].refusal.reason, "InvalidInput");
});
