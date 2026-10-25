// Rewrites test/golden/infographic-digests.json from the committed example specs. Run only after reviewing the SVG diff.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { renderInfographic } from "../../src/infographic/render.mjs";

const root = fileURLToPath(new URL("../..", import.meta.url));
const dir = join(root, "examples/specs");
const out = {};
for (const f of readdirSync(dir).filter((n) => n.endsWith(".json")).sort()) out[f.replace(/\.json$/u, "")] = renderInfographic(JSON.parse(readFileSync(join(dir, f), "utf8"))).sha256;
writeFileSync(join(root, "test/golden/infographic-digests.json"), `${JSON.stringify(out, null, 1)}\n`);
console.log(out);
