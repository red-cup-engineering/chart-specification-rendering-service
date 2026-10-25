#!/usr/bin/env node
import { assertKeys, assertPlainObject, assertSpec, bindSpecData, describeSvg, renderBoundSpec } from "./vega-render.mjs";
import { runCommand } from "./chart-face.mjs";

/** The operation definition the command runner and the market-offer deriver bind: schemas plus the function. */
export const operation = {
  name: "renderVegaLiteSpecAsSvg",
  description: "Renders a Vega-Lite v5 or v6 chart specification to byte-reproducible SVG, headless and offline: data is inline or read from a supplied file map, never from the network; the SVG carries title, description and ARIA wiring, keeps text as text, and defines url(#hatch-rrggbb) fills as SVG patterns.",
  inputSchema: {
    type: "object",
    required: ["spec"],
    additionalProperties: false,
    properties: {
      spec: { type: "object", description: "A Vega-Lite v5 or v6 specification (JSON)." },
      data: {
        type: ["object", "array"],
        description: "Either an array of rows (inline data for a spec with no top-level data) or a map of root-relative path to file text (or JSON value) that the spec's data.url values resolve to.",
      },
      baseUrl: { type: "string", description: "Root-relative directory the spec's relative urls are resolved against (the directory the spec file lives in). Default: the root." },
    },
  },
  outputSchema: {
    type: "object",
    required: ["svg", "ni", "size", "mediaType", "warnings"],
    additionalProperties: false,
    properties: {
      svg: { type: "string", description: "The SVG document text." },
      ni: { type: "string", pattern: "^ni:///sha-256;[A-Za-z0-9_-]{43}$", description: "The RFC 6920 name of the UTF-8 bytes of svg." },
      size: { type: "integer", minimum: 1, description: "The UTF-8 byte length of svg." },
      mediaType: { type: "string", const: "image/svg+xml" },
      warnings: { type: "array", items: { type: "string" }, description: "Vega-Lite compiler and renderer warnings, in emission order, without duplicates." },
    },
  },
  operation: renderVegaLiteSpecAsSvg,
};

/**
 * Renders a Vega-Lite v5 or v6 spec to SVG. The same request always yields the same bytes.
 * @param {{spec: object, data?: object | object[], baseUrl?: string}} request
 * @returns {Promise<{svg: string, ni: string, size: number, mediaType: string, warnings: string[]}>}
 * @throws {TypeError} When the request is malformed, the spec does not compile, a url is absolute, has a scheme or leaves the root, a read file is not supplied, or a file cannot be parsed.
 * @throws {RangeError} When the spec exceeds 1 MiB, a dimension is outside 0..20000, the files exceed 16 MiB, or the SVG exceeds 16 MiB.
 */
export async function renderVegaLiteSpecAsSvg(request) {
  assertPlainObject(request, "request");
  assertKeys(request, ["spec", "data", "baseUrl"]);
  assertSpec(request.spec);
  const { spec, files } = bindSpecData(request.spec, request.data, request.baseUrl);
  const { svg, warnings } = await renderBoundSpec(spec, files);
  return { ...describeSvg(svg), warnings };
}

if (import.meta.main) await runCommand(operation);
