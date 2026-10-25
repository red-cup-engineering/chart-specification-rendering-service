// The deterministic Vega-Lite -> SVG core shared by the operations. Nothing here touches the network, the
// filesystem, the clock or ambient randomness: every byte of output is a function of the request.
import { addressContent } from "@red-cup-engineering/computer-content-address-engineering-services-section/content-address";
import { sha256Hex } from "@red-cup-engineering/cryptographic-integrity-service";
import { element, serialize } from "@red-cup-engineering/xml-document-rendering-service/core";
import { readXmlDocument } from "@red-cup-engineering/xml-document-rendering-service/document-read";
import { posix } from "node:path";
import * as vega from "vega";
import * as vegaLite from "vega-lite";

export const MAX_SPEC_BYTES = 1024 * 1024;
export const MAX_FILE_BYTES = 16 * 1024 * 1024;
export const MAX_SVG_BYTES = 16 * 1024 * 1024;
export const MAX_DIMENSION = 20000;

/** Defaults under the spec's own `config`: a font-family stack string (no resolved font), white ground. */
export const DEFAULT_CONFIG = Object.freeze({
  font: "Helvetica, Arial, sans-serif",
  background: "white",
});

const SCHEME = /^[A-Za-z][A-Za-z0-9+.-]*:/u;
const HATCH_REFERENCE = /url\(#hatch-([0-9a-f]{6})\)/gu;

// ---------------------------------------------------------------------------------------------------------
// Text measurement. Vega lays out axes and titles from measured text widths; with a canvas those depend on
// the installed fonts, so two machines would lay the same chart out differently. Measurement is therefore a
// fixed Helvetica-metrics table (em fractions) on every host, and canvas measurement is switched off.
// ---------------------------------------------------------------------------------------------------------
const NARROW = new Set("iljtfI.,:;|!'`()[]/\\ ");
const WIDE = new Set("mwMW@%");
function characterWidth(character) {
  if (character === " ") return 0.278;
  if (character >= "0" && character <= "9") return 0.556;
  if (NARROW.has(character)) return 0.28;
  if (WIDE.has(character)) return 0.83;
  if (character >= "A" && character <= "Z") return 0.68;
  if (character >= "a" && character <= "z") return 0.54;
  if (character === "–") return 0.556;
  if (character === "—") return 1;
  return 0.6;
}
function fixedTextWidth(item, text) {
  const size = Number(item.fontSize) || 11;
  const bold = item.fontWeight === "bold" || Number(item.fontWeight) >= 600;
  let sum = 0;
  for (const character of String(text)) sum += characterWidth(character);
  return sum * size * (bold ? 1.06 : 1);
}
vega.textMetrics.canvas(false);
vega.textMetrics.width = fixedTextWidth;

// ---------------------------------------------------------------------------------------------------------
// Request admission
// ---------------------------------------------------------------------------------------------------------
export function assertPlainObject(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
}

export function assertKeys(request, allowed) {
  for (const key of Object.keys(request)) if (!allowed.includes(key)) throw new TypeError(`request does not admit ${key}`);
}

export function assertSpec(spec) {
  assertPlainObject(spec, "spec");
  const bytes = Buffer.byteLength(JSON.stringify(spec));
  if (bytes > MAX_SPEC_BYTES) throw new RangeError(`spec is ${bytes} bytes; the limit is ${MAX_SPEC_BYTES}`);
  for (const key of ["width", "height"]) {
    if (typeof spec[key] === "number" && !(spec[key] >= 0 && spec[key] <= MAX_DIMENSION)) {
      throw new RangeError(`spec.${key} ${spec[key]} is outside 0..${MAX_DIMENSION}`);
    }
  }
}

/** Every string-valued `url` in a spec (data sources, lookup sources, image marks), with its JSON path. */
export function collectSpecUrls(spec) {
  const found = [];
  const walk = (node, path) => {
    if (Array.isArray(node)) node.forEach((entry, index) => walk(entry, `${path}[${index}]`));
    else if (node !== null && typeof node === "object") {
      for (const [key, value] of Object.entries(node)) {
        const here = path === "" ? key : `${path}.${key}`;
        if (key === "url" && typeof value === "string") found.push({ path: here, url: value });
        else walk(value, here);
      }
    }
  };
  walk(spec, "");
  return found;
}

/**
 * A spec `url` (or a file-map key) as a root-relative POSIX path, resolved against `baseUrl`.
 * Anything with a URL scheme, a leading slash, or a path that climbs above the root is refused: this
 * service never reaches the network or the ambient filesystem.
 */
export function resolveDataPath(baseUrl, url, label = "url") {
  if (typeof url !== "string" || url === "") throw new TypeError(`${label} must be a non-empty string`);
  if (SCHEME.test(url) || url.startsWith("/") || url.includes("\\") || url.includes("\0")) {
    throw new TypeError(`${label} ${JSON.stringify(url)} is not a relative path: only files supplied in data are readable, never the network or an absolute path`);
  }
  const resolved = posix.normalize(posix.join(baseUrl === "" ? "." : baseUrl, url));
  if (resolved === ".." || resolved.startsWith("../") || resolved === ".") {
    throw new TypeError(`${label} ${JSON.stringify(url)} resolves outside the root`);
  }
  return resolved;
}

function assertBaseUrl(baseUrl) {
  if (baseUrl === undefined) return "";
  if (typeof baseUrl !== "string") throw new TypeError("baseUrl must be a string");
  if (baseUrl === "" || baseUrl === ".") return "";
  if (SCHEME.test(baseUrl) || baseUrl.startsWith("/")) throw new TypeError("baseUrl must be a relative path inside the root");
  const normal = posix.normalize(baseUrl);
  if (normal === ".." || normal.startsWith("../")) throw new TypeError("baseUrl resolves outside the root");
  return normal;
}

/**
 * Clone the spec with every `url` resolved against the file map, returning the clone and the files it needs.
 * `data` is either an array of rows (inline, used when the spec has no top-level data) or a map of
 * root-relative path -> file text (or a JSON value, serialized).
 */
export function bindSpecData(spec, data, baseUrl) {
  const base = assertBaseUrl(baseUrl);
  const bound = structuredClone(spec);
  const files = new Map();
  if (Array.isArray(data)) {
    if (bound.data !== undefined) throw new TypeError("data rows were supplied inline, but the spec already declares top-level data");
    bound.data = { values: data };
  } else if (data !== undefined) {
    assertPlainObject(data, "data");
    let total = 0;
    for (const key of Object.keys(data).sort()) {
      const text = typeof data[key] === "string" ? data[key] : JSON.stringify(data[key]);
      if (text === undefined) throw new TypeError(`data[${JSON.stringify(key)}] is not text or a JSON value`);
      total += Buffer.byteLength(text);
      if (total > MAX_FILE_BYTES) throw new RangeError(`data files total more than ${MAX_FILE_BYTES} bytes`);
      files.set(resolveDataPath("", key, `data key ${JSON.stringify(key)}`), text);
    }
  }
  const needed = [];
  const rewrite = (node) => {
    if (Array.isArray(node)) node.forEach(rewrite);
    else if (node !== null && typeof node === "object") {
      for (const key of Object.keys(node)) {
        if (key === "url" && typeof node[key] === "string") {
          const resolved = resolveDataPath(base, node[key], "spec url");
          needed.push(resolved);
          node[key] = resolved;
        } else rewrite(node[key]);
      }
    }
  };
  rewrite(bound);
  const missing = [...new Set(needed)].filter((path) => !files.has(path)).sort();
  if (missing.length > 0) {
    throw new TypeError(`spec reads ${missing.map((path) => JSON.stringify(path)).join(", ")}, which data does not supply`);
  }
  return { spec: bound, files, needed: [...new Set(needed)].sort() };
}

// ---------------------------------------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------------------------------------
function collectingLogger(sink) {
  const logger = {
    level() { return logger; },
    error(...parts) { throw new TypeError(parts.map(String).join(" ")); },
    warn(...parts) { sink.push(parts.map(String).join(" ")); return logger; },
    info() { return logger; },
    debug() { return logger; },
  };
  return logger;
}

function offlineLoader(files) {
  const refuse = (uri) => { throw new TypeError(`${JSON.stringify(String(uri))} is not a supplied file; this service does not read the network or the filesystem`); };
  return {
    async load(uri) {
      if (!files.has(uri)) refuse(uri);
      return files.get(uri);
    },
    async sanitize(uri) { return refuse(uri); },
    async http(uri) { return refuse(uri); },
    async file(uri) { return refuse(uri); },
  };
}

/** Compile a Vega-Lite spec to Vega, collecting compiler warnings and turning errors into TypeErrors. */
export function compileVegaLite(spec, warnings) {
  try {
    return vegaLite.compile(spec, { config: { ...DEFAULT_CONFIG }, logger: collectingLogger(warnings) }).spec;
  } catch (error) {
    throw error instanceof TypeError ? error : new TypeError(`Vega-Lite compile failed: ${error?.message ?? error}`);
  }
}

function titleText(title) {
  const value = title !== null && typeof title === "object" && !Array.isArray(title) ? title.text : title;
  if (Array.isArray(value)) return value.map(String).join(" ");
  return typeof value === "string" ? value : "";
}

function descriptionText(description) {
  return typeof description === "string" ? description : "";
}

const PREFIXED_ID = /^(?:clip\d+|gradient_\d+)$/u;
const PREFIXED_REFERENCE = /url\(#((?:clip\d+|gradient_\d+))\)/gu;
const READ_LIMITS = Object.freeze({ maximumNodes: 2_000_000, maximumAttributes: 8_000_000 });

function hatchPattern(color) {
  return element("pattern", { id: `hatch-${color}`, width: "4", height: "4", patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" }, [
    element("line", { x1: "0", y1: "0", x2: "0", y2: "4", stroke: `#${color}`, "stroke-width": "1.4" }),
  ]);
}

/** Every element below `node`, in document order. */
function* descendants(node) {
  for (const child of node.children ?? []) {
    if (child.kind !== "element") continue;
    yield child;
    yield* descendants(child);
  }
}

/**
 * The deterministic post-process, as edits to the SVG's XML tree (house xml-document-rendering-service):
 * namespace Vega's per-render ids, add <title>/<desc> and the ARIA wiring, and define each
 * `url(#hatch-rrggbb)` fill the chart uses as an SVG <pattern> in a <defs> block.
 */
export function finishSvg(svg, spec, warnings) {
  if (!svg.startsWith("<svg") || svg.indexOf(">") < 0) throw new RangeError("Vega produced no <svg> element");
  const prefix = `vl-${sha256Hex(svg).slice(0, 8)}`;
  const root = readXmlDocument(svg, READ_LIMITS).children.find((node) => node.kind === "element");
  const body = [...descendants(root)];
  const references = [];
  const ids = new Set();
  for (const node of body) {
    for (const [name, value] of Object.entries(node.attributes)) {
      if (name === "id" && PREFIXED_ID.test(value)) node.attributes[name] = `${prefix}-${value}`;
      else node.attributes[name] = value.replace(PREFIXED_REFERENCE, `url(#${prefix}-$1)`);
      if (name === "id") ids.add(node.attributes[name]);
      for (const match of node.attributes[name].matchAll(/url\(#([^)]+)\)/gu)) references.push(match[1]);
    }
  }

  const inserted = [];
  const wiring = {};
  const title = titleText(spec.title);
  const description = descriptionText(spec.description);
  if (description === "") warnings.push("spec has no description: the SVG carries no accessible description");
  if (title !== "") { inserted.push(element("title", { id: `${prefix}-title` }, [title])); wiring["aria-labelledby"] = `${prefix}-title`; }
  if (description !== "") {
    inserted.push(element("desc", { id: `${prefix}-desc` }, [description]));
    wiring[title === "" ? "aria-labelledby" : "aria-describedby"] = `${prefix}-desc`;
  }

  const colors = [...new Set(references.flatMap((reference) => [...`url(#${reference})`.matchAll(HATCH_REFERENCE)].map((match) => match[1])))].sort();
  if (colors.length > 0) inserted.push(element("defs", {}, colors.map(hatchPattern)));

  for (const color of colors) ids.add(`hatch-${color}`);
  for (const reference of references) {
    if (!ids.has(reference)) warnings.push(`fill or clip reference url(#${reference}) is not defined in the SVG; hatch fills must be named url(#hatch-rrggbb)`);
  }

  if (Object.keys(wiring).length > 0 && !Object.hasOwn(root.attributes, "role")) root.attributes.role = "img";
  Object.assign(root.attributes, wiring);
  root.children = [...inserted, ...root.children];
  return serialize(root);
}

// Vega keeps process-wide state (the random source, the time zone its time scales read) and renders from
// it, so renders run one at a time, in arrival order, with the zone pinned to UTC and the random source
// seeded. That makes every render a function of its request alone, however many run concurrently.
let queue = Promise.resolve();
function exclusive(work) {
  const run = queue.then(async () => {
    const zone = process.env.TZ;
    process.env.TZ = "UTC";
    vega.setRandom(vega.randomLCG(561));
    try { return await work(); }
    finally { if (zone === undefined) delete process.env.TZ; else process.env.TZ = zone; }
  });
  queue = run.then(() => undefined, () => undefined);
  return run;
}

/** Render a prepared (bound) Vega-Lite spec to SVG text and its warnings. Deterministic. */
export function renderBoundSpec(spec, files) {
  return exclusive(async () => {
    const warnings = [];
    const vegaSpec = compileVegaLite(spec, warnings);
    const view = new vega.View(vega.parse(vegaSpec), {
      renderer: "none",
      loader: offlineLoader(files),
      logger: collectingLogger(warnings),
    });
    let raw;
    try {
      await view.runAsync();
      raw = await view.toSVG();
    } finally {
      view.finalize();
    }
    const failed = warnings.find((message) => /^(Data ingestion failed|Loading failed)/u.test(message));
    if (failed !== undefined) throw new TypeError(failed);
    if (Buffer.byteLength(raw) > MAX_SVG_BYTES) throw new RangeError(`rendered SVG exceeds ${MAX_SVG_BYTES} bytes`);
    const finished = finishSvg(raw, spec, warnings);
    const svg = finished.endsWith("\n") ? finished : `${finished}\n`;
    return { svg, warnings: [...new Set(warnings)] };
  });
}

/** The SVG text with its house content address: { svg, ni, size, mediaType } (RFC 6920 name of the UTF-8 bytes). */
export function describeSvg(svg) {
  const { ni, size, mediaType } = addressContent(new TextEncoder().encode(svg), { mediaType: "image/svg+xml" });
  return { svg, ni, size, mediaType };
}

export { vegaLite };
