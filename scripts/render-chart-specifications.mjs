#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { renderVegaLiteSpecAsSvg } from "./render-vega-lite-spec-as-svg.mjs";
import { collectSpecUrls, resolveDataPath } from "./vega-render.mjs";

const USAGE = "usage: render-chart-specifications --root <repo> [--out <dir>] [--check] [--png] <spec.vl.json>...";

export const commandDescription = {
  name: "render-chart-specifications",
  description: `Renders Vega-Lite spec files to <name>.svg beside each spec (or in --out). ${USAGE}`,
};

function inside(root, path) {
  const from = relative(root, path);
  return from !== "" && !from.startsWith("..") && !isAbsolute(from);
}

function readInside(root, relativePath, label) {
  const path = resolve(root, relativePath);
  if (!existsSync(path)) throw new TypeError(`${label} ${JSON.stringify(relativePath)} does not exist under the root`);
  const real = realpathSync(path);
  if (!inside(root, real)) throw new TypeError(`${label} ${JSON.stringify(relativePath)} resolves outside the root`);
  return readFileSync(real, "utf8");
}

/**
 * Renders spec files under a repository root to SVG files. Reads only the spec files and the data files they
 * reference by relative `url`, all confined to the real path of the root.
 * @param {{root: string, specs: string[], out?: string, check?: boolean, png?: boolean}} request
 * @returns {Promise<{results: {spec: string, svg: string, sha256: string, bytes: number, status: string, warnings: string[]}[], stale: number}>}
 * @throws {TypeError} When no spec is given, a spec is not inside the root, a spec is not JSON, a referenced file is missing or outside the root, or the spec is refused by renderVegaLiteSpecAsSvg.
 */
export async function renderChartSpecifications({ root, specs, out, check = false, png = false }) {
  if (typeof root !== "string" || root === "") throw new TypeError(`--root is required. ${USAGE}`);
  if (!Array.isArray(specs) || specs.length === 0) throw new TypeError(`at least one spec file is required. ${USAGE}`);
  const realRoot = realpathSync(resolve(root));
  const results = [];
  for (const specArgument of specs) {
    const specPath = resolve(realRoot, specArgument);
    const specRelative = relative(realRoot, specPath).split(sep).join("/");
    if (!inside(realRoot, specPath)) throw new TypeError(`${specArgument} is outside the root`);
    let spec;
    try { spec = JSON.parse(readInside(realRoot, specRelative, "spec")); }
    catch (error) { throw new TypeError(`${specRelative}: ${error.message}`); }
    const baseUrl = dirname(specRelative) === "." ? "" : dirname(specRelative);
    const data = {};
    for (const { url } of collectSpecUrls(spec)) {
      const key = resolveDataPath(baseUrl, url, `${specRelative}: url`);
      data[key] = readInside(realRoot, key, `${specRelative}: data file`);
    }
    let rendered;
    try { rendered = await renderVegaLiteSpecAsSvg({ spec, data, baseUrl }); }
    catch (error) { throw new TypeError(`${specRelative}: ${error.message}`); }
    const name = basename(specPath).replace(/\.vl\.json$|\.json$/u, "");
    const svgPath = out === undefined ? join(dirname(specPath), `${name}.svg`) : join(resolve(realRoot, out), `${name}.svg`);
    const existing = existsSync(svgPath) ? readFileSync(svgPath, "utf8") : undefined;
    let status = existing === rendered.svg ? "unchanged" : check ? "stale" : "written";
    if (status === "written") {
      mkdirSync(dirname(svgPath), { recursive: true });
      writeFileSync(svgPath, rendered.svg, "utf8");
    }
    if (png && !check) {
      const converted = spawnSync("rsvg-convert", ["--zoom", "2", "--format", "png", "--output", svgPath.replace(/\.svg$/u, ".png"), svgPath], { encoding: "utf8" });
      if (converted.error || converted.status !== 0) throw new TypeError(`--png needs rsvg-convert on PATH: ${converted.error?.message ?? converted.stderr}`);
    }
    results.push({ spec: specRelative, svg: relative(realRoot, svgPath).split(sep).join("/"), sha256: rendered.sha256, bytes: rendered.bytes, status, warnings: rendered.warnings });
  }
  return { results, stale: results.filter((result) => result.status === "stale").length };
}

function parseArguments(argv) {
  const request = { specs: [], check: false, png: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--root" || argument === "--out") {
      if (index + 1 >= argv.length) throw new TypeError(`${argument} needs a value. ${USAGE}`);
      request[argument.slice(2)] = argv[(index += 1)];
    } else if (argument === "--check" || argument === "--png") request[argument.slice(2)] = true;
    else if (argument.startsWith("--")) throw new TypeError(`unknown option ${argument}. ${USAGE}`);
    else request.specs.push(argument);
  }
  return request;
}

export const command = {
  run: ({ argv }) => renderChartSpecifications(parseArguments(argv)),
  formatResult: ({ results }) => results.map((result) => `${JSON.stringify(result)}\n`).join(""),
  resultExitCode: ({ stale }) => (stale > 0 ? 3 : 0),
  exitCode: 2,
};

if (import.meta.main) {
  const { runJavascriptNodeOperationModule } = await import("@red-cup-engineering/javascript-node-services-section/operation");
  if (process.argv.includes("--help")) process.stdout.write(`${commandDescription.name} - ${commandDescription.description}\n`);
  else {
    process.exitCode = (await runJavascriptNodeOperationModule({ command }, {
      arguments: process.argv.slice(2), standardInput: process.stdin, standardOutput: process.stdout, standardError: process.stderr,
    })).exitCode;
  }
}
