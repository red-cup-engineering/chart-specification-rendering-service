// Builds the example infographic specs from the committed open data under data/. Pure: no network, no clock.
// Usage: node examples/build-example-specs.mjs [outDir]   (default examples/specs)
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");

/** NOAA Climate-at-a-Glance CSV -> { base, rows: [{ year, month, value, departure }] } */
function parseNoaa(text) {
  const base = Number(/Base Period Average: ([\d.]+)/u.exec(text)?.[1]);
  const rows = text.split("\n").filter((l) => /^\d{6},/u.test(l)).map((l) => {
    const [d, v, dep] = l.split(",");
    return { year: Math.floor(Number(d) / 100), month: Number(d) % 100, value: Number(v), departure: Number(dep) };
  });
  return { base, rows };
}
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
function ols(points) {
  const mx = mean(points.map((p) => p[0])), my = mean(points.map((p) => p[1]));
  let sxx = 0, sxy = 0;
  for (const [x, y] of points) { sxx += (x - mx) ** 2; sxy += (x - mx) * (y - my); }
  const slope = sxy / sxx, intercept = my - slope * mx;
  const rmse = Math.sqrt(points.reduce((s, [x, y]) => s + (y - intercept - slope * x) ** 2, 0) / (points.length - 2));
  return { slope, intercept, rmse, n: points.length, mx, sxx };
}
const round = (v, d = 1) => Math.round(v * 10 ** d) / 10 ** d;
const sign = (v, d = 1) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(d)}`;

const annual = parseNoaa(read("data/climate/noaa-nclimdiv-mn03-annual-tavg.csv"));
const winter = parseNoaa(read("data/climate/noaa-nclimdiv-mn03-djf-tavg.csv"));
const gis = read("data/climate/nasa-gistemp-v4-global-land-ocean.csv").split("\n").filter((l) => /^\d{4},/u.test(l)).map((l) => { const c = l.split(","); return { year: Number(c[0]), jd: Number(c[13]) }; }).filter((r) => Number.isFinite(r.jd));
const outline = JSON.parse(read("data/geo/minnesota-outline.json"));

const A = annual.rows.filter((r) => r.month === 12);
const lastYear = A.at(-1).year;
const dep = A.map((r) => [r.year, round(r.departure, 1)]);
const last = A.at(-1);
const decade = mean(A.filter((r) => r.year > lastYear - 10).map((r) => r.departure));
const early = mean(A.filter((r) => r.year >= 1901 && r.year <= 1930).map((r) => r.departure));
const warmest = [...A].sort((a, b) => b.value - a.value)[0];
const t70 = ols(A.filter((r) => r.year >= 1970).map((r) => [r.year, r.value]));
const W = winter.rows;
const wt70 = ols(W.filter((r) => r.year >= 1970 && r.year <= lastYear).map((r) => [r.year, r.value]));
const wLast = W.filter((r) => r.year <= lastYear).at(-1);
const gLast = gis.filter((r) => r.year === lastYear).at(-1) ?? gis.at(-1);
const trendDecadeF = t70.slope * 10;
const meanDepAll = mean(A.map((r) => r.departure));

// 80% prediction interval of the 1970-onward linear trend, projected 2026-2050 (a statistical extrapolation, not a model)
const z80 = 1.2816;
const proj = [];
for (let y = lastYear; y <= 2050; y += 1) {
  const fit = t70.intercept + t70.slope * y;
  const se = t70.rmse * Math.sqrt(1 + 1 / t70.n + (y - t70.mx) ** 2 / t70.sxx);
  proj.push({ y, fit: round(fit - annual.base, 2), lo: round(fit - z80 * se - annual.base, 2), hi: round(fit + z80 * se - annual.base, 2) });
}

const sources = () => ({
  type: "sources", id: "sources", dock: "bottom", columns: 2,
  items: [
    `NOAA NCEI nClimDiv, Minnesota Climate Division 3 (includes Duluth): annual and Dec\u2013Feb mean temperature, ${A[0].year}\u2013${lastYear}, departures from 1901\u20132000 (${annual.base}\u00a0\u00b0F).`,
    "NASA GISS GISTEMP v4, global land-ocean index, departures from 1951\u20131980. Both retrieved 2026-10-24.",
  ],
  stamp: "Same spec, same bytes; no generative model. Colour: ColorBrewer RdBu. Fonts: Noto (OFL).",
});

const landscape = {
  version: 1, id: "climate-duluth-landscape", lang: "en",
  meta: {
    title: "Duluth, Minnesota: a warmer place, measured",
    description: `Landscape climate summary for Duluth, Minnesota. Northeast Minnesota annual mean temperature has run ${sign(decade)} degrees Fahrenheit above its 1901 to 2000 average over the last ten years, with the warmest year ${warmest.year} at ${warmest.value} degrees. A bar chart shows every year since ${A[0].year}; summary cards give the warming trend, the winter departure and the global comparison; warming stripes show the same record as colour.`,
    license: "CC BY 4.0 (graphic); data per NOAA NCEI and NASA GISS terms",
  },
  canvas: { preset: "landscape-16x9", safeArea: 0.04 },
  theme: "ledger",
  blocks: [
    { type: "header", id: "header", kicker: "Climate place by place", title: `Duluth’s last decade ran ${sign(decade)}\u00a0\u00b0F above the 20th century`, subtitle: `Annual mean temperature, Northeast Minnesota (NOAA climate division 3), ${A[0].year}–${lastYear}`, badge: { text: "Duluth, MN", icon: "pin" } },
    { type: "heroStat", id: "hero", span: 4, value: sign(decade), unit: "\u00b0F", label: `warmer than 1901\u20132000, ${lastYear - 9}\u2013${lastYear}`, context: `Annual mean against the ${annual.base}\u00a0\u00b0F norm.`, icon: "thermometer", tone: "accent2", provenance: { kind: "observed" } },
    {
      type: "chart", id: "anomaly", span: 8, kind: "anomalyBars", title: "Every year since 1895, against the 1901–2000 average", yUnit: "°F departure from average", provenance: { kind: "observed" },
      series: [{ name: "Northeast Minnesota", points: dep }], smooth: 11,
      annotations: [{ x: warmest.year, y: round(warmest.departure, 1), text: `${warmest.year}: warmest year, ${warmest.value}\u00a0\u00b0F (${sign(warmest.departure)})`, width: 260 }],
    },
    {
      type: "stats", id: "cards", span: 7, items: [
        { value: sign(trendDecadeF), unit: "°F / decade", label: "Warming trend since 1970", note: `Linear fit, annual means ${1970}–${lastYear}.`, icon: "chart", tone: "accent2", provenance: { kind: "derived", note: "least-squares fit to NOAA annual means" } },
        { value: sign(wLast.departure), unit: "°F", label: `Winter ${wLast.year}, vs average`, note: `Dec–Feb ${wLast.year}; winter trend since 1970 ${sign(wt70.slope * 10)} °F per decade.`, icon: "snowflake", tone: "accent", provenance: { kind: "observed" } },
        { value: sign(gLast.jd * 1.8), unit: "°F", label: `Global, ${gLast.year}`, note: "NASA land-ocean index vs 1951–1980, converted from °C.", icon: "globe", tone: "accent", provenance: { kind: "observed" } },
      ],
    },
    {
      type: "chart", id: "stripes", span: 5, kind: "stripes", title: "Warming stripes", subtitle: "One stripe per year, coldest to warmest", series: [{ name: "Northeast Minnesota", points: A.map((r) => [r.year, r.value]) }], provenance: { kind: "observed" }, aspect: 0.3,
      legendLow: "colder", legendHigh: "warmer", flex: 0.3,
    },
    sources(),
  ],
};

const portrait = {
  version: 1, id: "climate-duluth-portrait", lang: "en",
  meta: {
    title: "Duluth, Minnesota: climate summary (vertical)",
    description: `Vertical climate summary for Duluth, Minnesota: headline departure, a bar chart of annual temperature, a statistical trend extrapolation to 2050 with an 80 percent prediction band, warming stripes, and a locator map. Observed data are from NOAA nClimDiv; the extrapolation is derived and labelled as such.`,
    license: "CC BY 4.0 (graphic); data per NOAA NCEI and NASA GISS terms",
  },
  canvas: { preset: "portrait-9x16", safeArea: 0.05 },
  theme: "ledger",
  blocks: [
    { type: "header", id: "header", kicker: "Climate place by place", title: "Duluth, Minnesota", subtitle: "What a century of thermometers says about the Head of the Lakes", badge: { text: `${A[0].year}–${lastYear}`, icon: "calendar" } },
    { type: "heroStat", id: "hero", kicker: `Average year, ${lastYear - 9}–${lastYear}`, value: sign(decade), unit: "°F", label: "warmer than the 20th century", context: `Against the ${annual.base} °F annual mean of 1901–2000. ${A[0].year}–${A[0].year + 29} ran ${sign(early)} °F.`, icon: "thermometer", tone: "accent2", provenance: { kind: "observed" } },
    { type: "chart", id: "stripes", kind: "stripes", title: "The record as colour", subtitle: "One stripe per year", series: [{ name: "Northeast Minnesota", points: A.map((r) => [r.year, r.value]) }], provenance: { kind: "observed" }, aspect: 0.3, flex: 0.2, legendLow: "colder", legendHigh: "warmer" },
    {
      type: "chart", id: "fan", kind: "fan", title: `If the 1970–${lastYear} trend simply continued`, subtitle: "Arithmetic, not prophecy: the trend continued, with an 80% band. Not a climate-model projection.", yUnit: "°F departure from the 1901–2000 average", provenance: { kind: "derived", note: "least-squares trend 1970-2025 extrapolated; band is the 80% prediction interval" }, signed: true,
      observed: [{ name: "Observed", tone: "ink", smooth: 11, points: dep.filter((p) => p[0] >= 1950) }],
      scenarios: [{ name: "Trend extrapolation", tone: "accent2", median: proj.map((p) => [p.y, p.fit]), low: proj.map((p) => [p.y, p.lo]), high: proj.map((p) => [p.y, p.hi]) }],
      fromX: lastYear, bandLabel: "80% prediction band", projectionLabel: "Extrapolated", aspect: 0.62, flex: 1.2,
    },
    { type: "locator", id: "map", title: "Where this is", caption: "Duluth sits at the western tip of Lake Superior; the data cover Northeast Minnesota.", outline: outline.rings, marker: { lon: -92.1005, lat: 46.7867, label: "Duluth" } },
    { type: "sources", id: "sources", dock: "bottom", columns: 1, items: [`NOAA NCEI nClimDiv, Minnesota Climate Division 3, annual mean temperature, departures from 1901–2000 (${annual.base} °F). Retrieved 2026-10-24.`, "Boundary: US Census via us-atlas 3.0.1 (public domain)."], stamp: "Deterministic render from a JSON spec; no generative model. ColorBrewer RdBu; Noto fonts (OFL)." },
  ],
};

const explainer = {
  version: 1, id: "commission-an-infographic", lang: "en",
  meta: {
    title: "How a deterministic infographic is made",
    description: "A five-step process from data and a JSON spec to a byte-identical SVG and PNG video frames, a comparison with image-generation models on reproducibility, editability and traceability, and the timeline of the engine's capabilities.",
    license: "CC BY 4.0",
  },
  canvas: { preset: "landscape-16x9", safeArea: 0.04 },
  theme: "ledger",
  blocks: [
    { type: "header", id: "header", kicker: "561 Group · Red Cup Engineering", title: "From data to a frame you can reproduce", subtitle: "A spec goes in; the same SVG comes out, every time.", badge: { text: "No model in the loop", icon: "shield" } },
    { type: "process", id: "steps", title: "Five steps", steps: [
      { title: "Bring the data", body: "Open datasets with a source and a retrieval date.", icon: "database" },
      { title: "Write the spec", body: "Blocks, not pixels: hero stat, chart, timeline, locator.", icon: "book" },
      { title: "Measure the text", body: "Real font metrics decide every line break.", icon: "gear" },
      { title: "Solve the layout", body: "Grid, safe areas and a fit loop; nothing overlaps.", icon: "building" },
      { title: "Emit SVG, then PNG", body: "16:9 and 9:16 frames from the same bytes.", icon: "chart" },
    ] },
    { type: "comparison", id: "versus", span: 8, title: "Against an image-generation model", columns: [
      { heading: "Generated image", tone: "inkMuted", items: [{ text: "Different picture on every run", good: false }, { text: "Text is drawn pixels and can be misspelled", good: false }, { text: "No sources; numbers cannot be traced", good: false }, { text: "Fixed pixel size", good: false }] },
      { heading: "Deterministic render", tone: "accent", items: [{ text: "Same spec, same bytes", good: true }, { text: "Every glyph from a shipped font", good: true }, { text: "Data provenance and spec digest embedded", good: true }, { text: "Vector: any size, 16:9 or 9:16", good: true }] },
    ] },
    { type: "callout", id: "honest", span: 4, tone: "accent2", icon: "warning", title: "What it does not do", text: "It does not paint scenes. Illustration is drawn from a small icon set; a generated illustration can be supplied as a separate, labelled asset." },
    { type: "sources", id: "sources", dock: "bottom", columns: 1, items: ["Engine: chart-specification-rendering-service, src/infographic. Fonts: Noto Sans and Noto Serif (SIL OFL 1.1)."] },
  ],
};

const scenarioYears = Array.from({ length: 2051 - 2025 }, (_, i) => 2025 + i);
const fixtureFan = {
  version: 1, id: "scenario-fan-fixture", lang: "en",
  meta: {
    title: "Scenario fan chart (fixture data)",
    description: "A demonstration of the projection fan chart block on dark theme. All projected values are fixture data invented to exercise the layout, not a forecast, and the chart is badged as fixture data.",
  },
  canvas: { preset: "landscape-16x9", safeArea: 0.04 },
  theme: "night",
  blocks: [
    { type: "header", id: "header", kicker: "Layout demonstration", title: "Two futures, one chart", subtitle: "Scenario bands with direct labels and a visible boundary between record and projection", badge: { text: "Fixture data", icon: "warning" } },
    {
      type: "chart", id: "fan", span: 8, kind: "fan", title: "Annual mean temperature departure", yUnit: "°F departure from average", signed: true,
      provenance: { kind: "fixture", note: "scenario values are invented for layout testing" },
      observed: [{ name: "Observed", tone: "ink", smooth: 11, points: dep.filter((p) => p[0] >= 1960) }],
      scenarios: [
        { name: "Higher emissions", tone: "accent2", median: scenarioYears.map((y) => [y, round(2.4 + 0.085 * (y - 2025) + 0.0006 * (y - 2025) ** 2, 2)]), low: scenarioYears.map((y) => [y, round(2.0 + 0.07 * (y - 2025) + 0.0004 * (y - 2025) ** 2, 2)]), high: scenarioYears.map((y) => [y, round(2.8 + 0.1 * (y - 2025) + 0.0008 * (y - 2025) ** 2, 2)]) },
        { name: "Lower emissions", tone: "accent", median: scenarioYears.map((y) => [y, round(2.4 + 0.035 * (y - 2025), 2)]), low: scenarioYears.map((y) => [y, round(2.1 + 0.02 * (y - 2025), 2)]), high: scenarioYears.map((y) => [y, round(2.7 + 0.05 * (y - 2025), 2)]) },
      ],
      fromX: 2025, bandLabel: "Shaded: likely range", projectionLabel: "Projected",
    },
    { type: "chart", id: "bars", span: 4, kind: "bars", title: "Hot days per year (fixture)", unit: " days", provenance: { kind: "fixture" }, items: [{ label: "1990s", value: 2, tone: "accent" }, { label: "2010s", value: 5, tone: "accent" }, { label: "2040s, lower", value: 9, tone: "accent" }, { label: "2040s, higher", value: 17, tone: "accent2" }] },
    { type: "callout", id: "warn", tone: "warning", icon: "warning", title: "Fixture data", text: "These projections are invented to test the layout. Do not cite them. The observed line up to 2025 is real NOAA data." },
    { type: "sources", id: "sources", dock: "bottom", columns: 1, items: ["Observed: NOAA NCEI nClimDiv, Minnesota Climate Division 3, annual mean temperature. Projected values: fixture."] },
  ],
};

const out = process.argv[2] ?? join(root, "examples/specs");
mkdirSync(out, { recursive: true });
for (const spec of [landscape, portrait, explainer, fixtureFan]) writeFileSync(join(out, `${spec.id}.json`), `${JSON.stringify(spec, null, 1)}\n`);
console.log(JSON.stringify({ lastYear, decade: round(decade), trendDecadeF: round(trendDecadeF, 2), warmest: warmest.year, meanDepAll: round(meanDepAll), wLast, gLast, proj2050: proj.at(-1) }));
