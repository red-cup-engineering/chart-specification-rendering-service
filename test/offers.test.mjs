// Held x402 offers: schema-valid against the vendored offer.schema.json, derived from package.json#x-market
// (validated against the vendored package-market.schema.json), bound to real exports that produce the
// output the offer declares, and (when X402_OFFER_MODULE points at the x402 package's src/offer.mjs)
// admitted by the x402 package's own declareOffer.
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { validateJsonSchema } from "@red-cup-engineering/json-schema-services-section/validation";
import { fixture, json, root } from "./helpers.mjs";

const offerSchema = JSON.parse(fixture("offer.schema.json"));
const marketSchema = JSON.parse(fixture("package-market.schema.json"));
const files = readdirSync(join(root, "data/records/offers")).filter((name) => name.endsWith(".json")).sort();
const PRICES = { "render-vega-lite-spec-as-svg": "$0.005", "validate-vega-lite-spec": "$0.002" };
const pkg = json("package.json");

test("package.json#x-market is valid against the package market schema", () => {
  assert.deepEqual(validateJsonSchema(pkg["x-market"], marketSchema).issues, []);
  assert.deepEqual(pkg["x-market"].offers.map((offer) => offer.operation).sort(), Object.keys(PRICES).sort());
});

test("package is publishable MIT with node >=24.2.0, exports and bins for every operation", () => {
  assert.equal(pkg.private, false);
  assert.equal(pkg.license, "MIT");
  assert.equal(pkg.version, "0.1.0");
  assert.equal(pkg.engines.node, ">=24.2.0");
  for (const name of ["render-vega-lite-spec-as-svg", "validate-vega-lite-spec", "render-chart-specifications"]) {
    assert.ok(pkg.exports[`./${name}`], name);
    assert.ok(pkg.bin[name], name);
  }
  for (const dependency of ["vega", "vega-lite"]) assert.match(pkg.dependencies[dependency], /^\d+\.\d+\.\d+$/u, `${dependency} is pinned exactly`);
});

test("one offer per operation, priced", () => {
  assert.deepEqual(files.map((name) => name.replace(/\.json$/u, "")), Object.keys(PRICES).sort());
});

for (const file of files) {
  const operation = file.replace(/\.json$/u, "");
  const offer = json(`data/records/offers/${file}`);

  test(`${operation}: offer is schema-valid, held, and sold by the engineering enterprise`, () => {
    assert.deepEqual(validateJsonSchema(offer, offerSchema).issues, []);
    assert.equal(offer.operation, operation);
    assert.equal(offer.saleStatus, "held");
    assert.equal(offer.price, PRICES[operation]);
    assert.deepEqual(offer.markets, ["x402-bazaar", "402index", "house-capability-market", "house-seller-catalog"]);
    assert.equal(offer.seller.enterprise, "engineering");
    assert.equal(offer.seller.record.sha256, "6af4ed9d1e4612b0383267e7ffe0ad028c52164ee3c5136110d434384a29c39f");
    assert.equal(offer.gatewayPackageName, "@red-cup-engineering/chart-specification-rendering-service");
    assert.equal(offer.ledgerAccount, "Income:Sales:X402:Chart-specification-rendering");
    assert.equal(offer.route, `/v1/${operation}`);
  });

  test(`${operation}: offer matches the package's x-market declaration`, () => {
    const declared = pkg["x-market"].offers.find((entry) => entry.operation === operation);
    assert.equal(offer.price, declared.price.amount);
    assert.deepEqual(offer.framings, declared.framings);
    assert.deepEqual(offer.markets, declared.markets);
    assert.equal(offer.compute.subpath, declared.subpath);
    assert.equal(offer.compute.export, declared.export);
  });

  test(`${operation}: compute binding resolves to an export whose output satisfies the offer's output schema`, async () => {
    const module = await import(`@red-cup-engineering/chart-specification-rendering-service${offer.compute.subpath.slice(1)}`);
    assert.equal(typeof module[offer.compute.export], "function");
    const output = await module[offer.compute.export](offer.bodyExample);
    assert.deepEqual(validateJsonSchema(output, offer.output.schema).issues, []);
    assert.deepEqual(JSON.parse(JSON.stringify(output)), offer.output.example);
    assert.deepEqual(validateJsonSchema(offer.bodyExample, module.operation.inputSchema).issues, []);
  });

  test(`${operation}: x402's own declareOffer admits the offer`, { skip: process.env.X402_OFFER_MODULE ? false : "set X402_OFFER_MODULE to the x402 package's src/offer.mjs to run declareOffer" }, async () => {
    const { declareOffer } = await import(pathToFileURL(process.env.X402_OFFER_MODULE).href);
    assert.equal(declareOffer(offer).declaration.saleStatus, "held");
  });
}
