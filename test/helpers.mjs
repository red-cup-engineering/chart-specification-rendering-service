import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const here = dirname(fileURLToPath(import.meta.url));
export const root = join(here, "..");
export const fixture = (name) => readFileSync(join(here, "fixtures", name), "utf8");
export const json = (path) => JSON.parse(readFileSync(join(root, path), "utf8"));

/** Two bars, described: the smallest chart that exercises layout, text and ARIA. */
export const barSpec = (extra = {}) => ({
  description: "Two bars: a is 3, b is 5.",
  title: "Two bars",
  width: 120,
  height: 80,
  data: { values: [{ k: "a", v: 3 }, { k: "b", v: 5 }] },
  mark: "bar",
  encoding: { x: { field: "k", type: "nominal" }, y: { field: "v", type: "quantitative" } },
  ...extra,
});

export const hatchedSpec = () => barSpec({
  encoding: {
    x: { field: "k", type: "nominal" },
    y: { field: "v", type: "quantitative" },
    fill: { condition: { test: "datum.k === 'a'", value: "url(#hatch-2a78d6)" }, value: "#2a78d6" },
  },
});
