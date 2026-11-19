// One-off data preparation (network): US Census cartographic boundaries via us-atlas (public domain) -> a Douglas-Peucker
// simplified Minnesota ring list for the locator block. Output is committed (data/geo/minnesota-outline.json); renders never fetch.
// Usage: node examples/prepare-minnesota-outline.mjs <out.json>
import { writeFileSync } from "node:fs";

const URL_TOPO = "https://cdn.jsdelivr.net/npm/us-atlas@3.0.1/states-10m.json";
const topo = await (await fetch(URL_TOPO)).json();
const { scale, translate } = topo.transform;
const arcs = topo.arcs.map((arc) => {
  let x = 0, y = 0;
  return arc.map(([dx, dy]) => { x += dx; y += dy; return [x * scale[0] + translate[0], y * scale[1] + translate[1]]; });
});
const arcPoints = (index) => (index >= 0 ? arcs[index] : [...arcs[~index]].reverse());
const ring = (indices) => indices.flatMap((i, k) => { const pts = arcPoints(i); return k === 0 ? pts : pts.slice(1); });
const state = topo.objects.states.geometries.find((g) => g.id === "27");
const polys = state.type === "Polygon" ? [state.arcs] : state.arcs;

function dp(points, eps) {
  if (points.length < 3) return points;
  const [a, b] = [points[0], points.at(-1)];
  let worst = 0, at = 0;
  for (let i = 1; i < points.length - 1; i += 1) {
    const [x, y] = points[i];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const t = dx || dy ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy))) : 0;
    const d = Math.hypot(x - (a[0] + t * dx), y - (a[1] + t * dy));
    if (d > worst) { worst = d; at = i; }
  }
  return worst > eps ? [...dp(points.slice(0, at + 1), eps).slice(0, -1), ...dp(points.slice(at), eps)] : [a, b];
}
const rings = polys.map((p) => dp(ring(p[0]), 0.035).map(([x, y]) => [Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000]));
writeFileSync(process.argv[2], `${JSON.stringify({ source: "US Census Bureau cartographic boundary (public domain) via us-atlas@3.0.1 states-10m", simplification: "Douglas-Peucker, 0.035 degrees", rings }, null, 0)}\n`);
console.log(rings.map((r) => r.length));
