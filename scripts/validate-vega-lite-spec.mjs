#!/usr/bin/env node
import { validateJsonSchema } from "@red-cup-engineering/json-schema-services-section/validation";
import vegaLiteSchema from "vega-lite/vega-lite-schema.json" with { type: "json" };
import { assertKeys, assertPlainObject, assertSpec, compileVegaLite } from "./vega-render.mjs";
import { runCommand } from "./chart-face.mjs";

const MAX_ISSUES = 50;

/** The operation definition the command runner and the market-offer deriver bind: schemas plus the function. */
export const operation = {
  name: "validateVegaLiteSpec",
  description: "Validates a Vega-Lite v5 or v6 specification against the vega-lite JSON schema shipped with the pinned vega-lite, then compiles it, reporting schema issues, compile errors and compiler warnings as data.",
  inputSchema: {
    type: "object",
    required: ["spec"],
    additionalProperties: false,
    properties: { spec: { type: "object", description: "A Vega-Lite v5 or v6 specification (JSON)." } },
  },
  outputSchema: {
    type: "object",
    required: ["valid", "issues", "warnings"],
    additionalProperties: false,
    properties: {
      valid: { type: "boolean" },
      issues: {
        type: "array",
        items: {
          type: "object",
          required: ["kind", "path", "message"],
          additionalProperties: false,
          properties: { kind: { enum: ["schema", "compile"] }, path: { type: "string" }, message: { type: "string" } },
        },
      },
      warnings: { type: "array", items: { type: "string" } },
    },
  },
  operation: validateVegaLiteSpec,
};

/**
 * Validates a Vega-Lite spec against the vega-lite JSON schema and by compiling it. Does not read data.
 * @param {{spec: object}} request
 * @returns {{valid: boolean, issues: {kind: string, path: string, message: string}[], warnings: string[]}}
 * @throws {TypeError} When the request is malformed.
 * @throws {RangeError} When the spec exceeds 1 MiB or a dimension is outside 0..20000.
 */
export function validateVegaLiteSpec(request) {
  assertPlainObject(request, "request");
  assertKeys(request, ["spec"]);
  assertSpec(request.spec);
  const seen = new Set();
  const issues = [];
  const schemaResult = validateJsonSchema(request.spec, vegaLiteSchema);
  for (const issue of schemaResult.issues ?? []) {
    const entry = { kind: "schema", path: issue.path ?? "", message: `${issue.keyword ?? "schema"}: ${issue.message}` };
    const key = `${entry.path}\0${entry.message}`;
    if (!seen.has(key) && issues.length < MAX_ISSUES) { seen.add(key); issues.push(entry); }
  }
  const warnings = [];
  try { compileVegaLite(request.spec, warnings); }
  catch (error) { issues.push({ kind: "compile", path: "", message: String(error.message) }); }
  return { valid: issues.length === 0, issues, warnings: [...new Set(warnings)] };
}

if (import.meta.main) await runCommand(operation);
