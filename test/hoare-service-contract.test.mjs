import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import { operation, renderVegaLiteSpecAsSvg } from "../scripts/render-vega-lite-spec-as-svg.mjs";

const contract = JSON.parse(readFileSync(new URL("../data/hoare-service-contracts/chart-render-vega-lite-svg.json", import.meta.url), "utf8"));

test("the Hoare service contract's schemas are this operation's own", () => {
  assert.deepEqual(contract.pre.input.schema.required, operation.inputSchema.required);
  assert.deepEqual(Object.keys(contract.pre.input.schema.properties), Object.keys(operation.inputSchema.properties));
  assert.deepEqual(contract.post.output.schema.required, operation.outputSchema.required);
  assert.deepEqual(Object.keys(contract.post.output.schema.properties), Object.keys(operation.outputSchema.properties));
});

test("the service reproduces the contract's own example byte for byte, and its digest guarantee holds", async () => {
  const output = await renderVegaLiteSpecAsSvg(structuredClone(contract.pre.input.example));
  assert.deepEqual(output, contract.post.output.example);
  assert.equal(createHash("sha256").update(output.svg, "utf8").digest("hex"), output.sha256);
});

test("the contract states the refusals the service actually has", async () => {
  await assert.rejects(() => renderVegaLiteSpecAsSvg({ spec: { mark: "not-a-mark" } }), TypeError);
  assert.ok(contract.refusals.some((refusal) => refusal.when === "pre:request-shape" && refusal.http === 422));
  assert.equal(contract.pre.capacity.maxConcurrent, 1, "renders are serial: they set process.env.TZ and reseed Vega's random source");
  assert.equal(contract.saleStatus, "held", "an authored contract holds the sale until its owner enables it");
});
