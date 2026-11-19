// A small JSON Schema (2020-12 subset) validator, enough for infographic-spec.schema.json and dependency-free:
// type, enum, const, required, properties, additionalProperties, items, min/max(Items|Length|imum), exclusiveMinimum,
// pattern, oneOf, if/then, allOf and local $ref. `x-discriminator` on a oneOf selects the branch by its `const`.
import { readFileSync } from "node:fs";

export const SPEC_SCHEMA = JSON.parse(readFileSync(new URL("./infographic-spec.schema.json", import.meta.url), "utf8"));

const typeOf = (v) => (v === null ? "null" : Array.isArray(v) ? "array" : Number.isInteger(v) ? "integer" : typeof v);
const isType = (v, t) => (t === "number" ? typeof v === "number" && Number.isFinite(v) : t === "integer" ? Number.isInteger(v) : typeOf(v) === t || (t === "object" && typeOf(v) === "object"));

function resolve(root, ref) {
  if (!ref.startsWith("#/")) throw new Error(`unsupported $ref ${ref}`);
  return ref.slice(2).split("/").reduce((node, key) => node[key.replace(/~1/gu, "/").replace(/~0/gu, "~")], root);
}

export function validateAgainst(root, schema, value, path, issues, depth = 0) {
  if (depth > 40) return;
  if (schema.$ref) { validateAgainst(root, resolve(root, schema.$ref), value, path, issues, depth + 1); return; }
  const here = path;
  if (schema.const !== undefined && JSON.stringify(schema.const) !== JSON.stringify(value)) issues.push({ path: here, message: `must be ${JSON.stringify(schema.const)}` });
  if (schema.enum && !schema.enum.some((e) => JSON.stringify(e) === JSON.stringify(value))) issues.push({ path: here, message: `must be one of ${schema.enum.map((e) => JSON.stringify(e)).join(", ")}` });
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((t) => isType(value, t))) { issues.push({ path: here, message: `must be ${types.join(" or ")}` }); return; }
  }
  if (typeof value === "string") {
    if (schema.minLength !== undefined && [...value].length < schema.minLength) issues.push({ path: here, message: `is shorter than ${schema.minLength}` });
    if (schema.maxLength !== undefined && [...value].length > schema.maxLength) issues.push({ path: here, message: `is longer than ${schema.maxLength}` });
    if (schema.pattern && !new RegExp(schema.pattern, "u").test(value)) issues.push({ path: here, message: `does not match ${schema.pattern}` });
  }
  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) issues.push({ path: here, message: `is below ${schema.minimum}` });
    if (schema.maximum !== undefined && value > schema.maximum) issues.push({ path: here, message: `is above ${schema.maximum}` });
    if (schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum) issues.push({ path: here, message: `must exceed ${schema.exclusiveMinimum}` });
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) issues.push({ path: here, message: `needs at least ${schema.minItems} items` });
    if (schema.maxItems !== undefined && value.length > schema.maxItems) issues.push({ path: here, message: `has more than ${schema.maxItems} items` });
    if (schema.items) value.forEach((item, i) => validateAgainst(root, schema.items, item, `${here}/${i}`, issues, depth + 1));
  }
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    for (const key of schema.required ?? []) if (!(key in value)) issues.push({ path: here, message: `is missing required ${key}` });
    const props = schema.properties ?? {};
    for (const [key, v] of Object.entries(value)) {
      if (props[key]) validateAgainst(root, props[key], v, `${here}/${key}`, issues, depth + 1);
      else if (schema.additionalProperties === false) issues.push({ path: `${here}/${key}`, message: "is not allowed" });
      else if (schema.additionalProperties && typeof schema.additionalProperties === "object") validateAgainst(root, schema.additionalProperties, v, `${here}/${key}`, issues, depth + 1);
    }
  }
  if (schema.allOf) for (const sub of schema.allOf) validateAgainst(root, sub, value, here, issues, depth + 1);
  if (schema.if) {
    const probe = [];
    validateAgainst(root, schema.if, value, here, probe, depth + 1);
    if (probe.length === 0 && schema.then) validateAgainst(root, schema.then, value, here, issues, depth + 1);
  }
  if (schema.oneOf) {
    const key = schema["x-discriminator"];
    if (key && value && typeof value === "object") {
      const branch = schema.oneOf.find((b) => resolve(root, b.$ref).properties?.[key]?.const === value[key]);
      if (!branch) issues.push({ path: `${here}/${key}`, message: `must be one of ${schema.oneOf.map((b) => resolve(root, b.$ref).properties?.[key]?.const).join(", ")}` });
      else validateAgainst(root, branch, value, here, issues, depth + 1);
    } else {
      const passing = schema.oneOf.filter((b) => { const probe = []; validateAgainst(root, b, value, here, probe, depth + 1); return probe.length === 0; });
      if (passing.length !== 1) issues.push({ path: here, message: `must match exactly one alternative (matched ${passing.length})` });
    }
  }
}

/** Returns [{ path, message }]; empty when the spec conforms to the schema and the cross-field rules below. */
export function validateSpec(spec) {
  const issues = [];
  validateAgainst(SPEC_SCHEMA, SPEC_SCHEMA, spec, "", issues);
  if (issues.length) return issues;
  const ids = new Set();
  spec.blocks.forEach((b, i) => {
    if (b.id) { if (ids.has(b.id)) issues.push({ path: `/blocks/${i}/id`, message: `duplicates ${b.id}` }); ids.add(b.id); }
    if (b.type === "chart" && (b.kind === "line" || b.kind === "anomalyBars" || b.kind === "stripes")) {
      b.series.forEach((s, k) => {
        const hasPoints = Array.isArray(s.points), hasXY = Array.isArray(s.x) && Array.isArray(s.y);
        if (!hasPoints && !hasXY) issues.push({ path: `/blocks/${i}/series/${k}`, message: "needs points or x and y" });
        if (hasXY && s.x.length !== s.y.length) issues.push({ path: `/blocks/${i}/series/${k}`, message: "x and y differ in length" });
      });
    }
    if (b.type === "comparison") {
      if ((b.mode ?? "columns") === "columns" && !b.columns) issues.push({ path: `/blocks/${i}`, message: "columns mode needs columns" });
      if (b.mode === "bars" && !(b.rows && b.series)) issues.push({ path: `/blocks/${i}`, message: "bars mode needs series and rows" });
    }
  });
  if (!(spec.canvas?.preset || (spec.canvas?.width && spec.canvas?.height))) { /* default 1920x1080 */ }
  return issues;
}
