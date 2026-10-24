# @red-cup-engineering/chart-specification-rendering-service

<!-- 561-group-standards:badges:start -->
[![Red Cup Engineering](https://img.shields.io/badge/561%20Group-Red%20Cup%20Engineering-c0392b)](https://github.com/red-cup-engineering)
[![License: MIT](https://img.shields.io/badge/license-MIT-c0392b)](LICENSE)
[![Indigenous data: CARE](https://img.shields.io/badge/Indigenous%20data-CARE-4b6f44)](https://github.com/red-cup-engineering/.github/blob/main/GOVERNANCE.md)
[![Tips welcome](https://img.shields.io/badge/tips-welcome-d4a017)](https://github.com/561-group/.github/blob/main/TIPS.md)
<!-- 561-group-standards:badges:end -->

Renders [Vega-Lite](https://vega.github.io/vega-lite/) (v5) chart specifications to
**byte-reproducible SVG**, headless and offline. A research paper keeps its figures as
*data* (a Vega-Lite JSON file beside the CSVs it plots) in its Science repository; this
generic Engineering service is the devDependency that turns them into pictures. The house
rule `science-engineering-operations-parameterize-in-order` keeps executable code out of
Science repositories; a figure that is a `.vl.json` file is not code.

Intended seat in the Group tree: `computer-media-engineering-services-section`, beside the
other content services. The pinned engines are `vega` 5.33.1 and `vega-lite` 5.23.0 (exact
pins; no canvas, no browser, no network).

Three operations. Each is an effect-bounded command that reads one JSON value per input
line and writes one JSON value per output line (the house NDJSON face,
`runJavascriptNodeOperation`); a refusal is a thrown `TypeError` or `RangeError`, rendered
as `{"ok":false,"refusal":{"reason":"TypeError","message":"..."}}` with exit 2. The third
is the repository CLI.

## Operations

### renderVegaLiteSpecAsSvg

~~~js
export async function renderVegaLiteSpecAsSvg({ spec, data, baseUrl }) // -> { svg, sha256, bytes, warnings }
~~~

- Refusals: `TypeError` for a malformed request, an unknown key, a spec that does not compile (Vega-Lite's own message), a `url` that has a scheme (`https:`, `file:`, `data:`), is absolute, contains a backslash, or resolves above the root; a `data` key that is not a relative path; `data` rows supplied inline for a spec that already has top-level `data`; a `url` the file map does not supply (every missing path is named); or a data file that cannot be parsed (never rendered as an empty chart). `RangeError` for a spec over 1 MiB, a numeric `width` or `height` outside 0..20000, data files totalling over 16 MiB, or an SVG over 16 MiB.
- Precondition: `spec` is a Vega-Lite v5 object. `data` is either an array of rows (inline data for a spec with no top-level `data`) or a map of root-relative path to file text (or a JSON value, serialized with `JSON.stringify`); `baseUrl` is the root-relative directory the spec's relative `url`s resolve against (the directory the spec file lives in; default: the root).
- Postcondition: `svg` is a complete SVG document ending in one newline; `sha256` and `bytes` are those of its UTF-8 text; the same request always gives the same bytes. Text stays `<text>`; the root carries `role="img"`, a `<title>` (from `spec.title`) and `<desc>` (from `spec.description`) wired by `aria-labelledby`/`aria-describedby`; `url(#hatch-rrggbb)` fills are defined as `<pattern>`s (see Hatching). `warnings` holds Vega-Lite compiler and renderer warnings in emission order, plus one when the spec has no `description`.
- Preserved frame: the spec and data are not modified (the spec is cloned before its urls are resolved); nothing outside the request is read.
- Effect class: deterministic compute, no I/O. Renders run one at a time in one process and, while rendering, set `process.env.TZ` to `UTC` and seed Vega's random source (both restored or reseeded each time), because Vega's time scales and `jitter`/`sample` transforms read process-wide state.
- Witness: byte-identical renders in one process, concurrently, and across processes under different `TZ`, `LANG` and `LC_ALL`; a golden hash for each paper figure; refusal tests for every network, absolute, scheme and escaping url, with `fetch` mocked to prove nothing is fetched.

Command: `render-vega-lite-spec-as-svg`.

~~~sh
echo '{"spec":{"description":"Two bars.","width":100,"height":60,"data":{"values":[{"k":"a","v":3},{"k":"b","v":5}]},"mark":"bar","encoding":{"x":{"field":"k","type":"nominal","axis":null},"y":{"field":"v","type":"quantitative","axis":null}}}}' | npx render-vega-lite-spec-as-svg
~~~

### validateVegaLiteSpec

~~~js
export function validateVegaLiteSpec({ spec }) // -> { valid, issues: [{ kind, path, message }], warnings }
~~~

- Refusals: `TypeError` for a malformed request or unknown key; `RangeError` for a spec over 1 MiB or a numeric `width`/`height` outside 0..20000. An invalid spec is *not* a refusal: it is `valid: false` with its issues.
- Precondition: `spec` is a JSON object.
- Postcondition: `issues` holds the violations of the `vega-lite` JSON schema that ships with the pinned `vega-lite` (`kind: "schema"`; de-duplicated, at most 50) and the compile error if the spec does not compile (`kind: "compile"`); `valid` is true exactly when there are none. `warnings` are the compiler's. No data is read, so a spec whose `url`s are not yet supplied still validates.
- Preserved frame: the spec.
- Effect class: pure. Witness: the vega-lite schema accepts both paper figures and rejects a mistyped mark; a compile-only failure is reported.

Command: `validate-vega-lite-spec`.

### render-chart-specifications (CLI)

~~~sh
render-chart-specifications --root <repo> [--out <dir>] [--check] [--png] <spec.vl.json>...
~~~

- Refusals (exit 2, message on stderr, nothing written for that spec): no `--root` or no spec; a spec outside the root; a spec or data file that does not exist, or whose real path (after symlinks) is outside the root; anything `renderVegaLiteSpecAsSvg` refuses. Exit 3 under `--check` when any SVG is stale or missing.
- Precondition: spec paths are relative to `--root` (or absolute inside it); each spec's relative `url`s resolve against the spec's own directory and stay inside the root.
- Postcondition: for each spec `<name>.vl.json` it writes `<name>.svg` beside it (or into `--out`, relative to the root), exactly the `svg` the operation returns, and prints one JSON line per spec: `{spec, svg, sha256, bytes, status, warnings}` with `status` `written`, `unchanged` or (`--check`) `stale`. `--png` also writes `<name>.png` at 2x through `rsvg-convert`; PNG bytes depend on that host tool and are not a determinism guarantee.
- Preserved frame: spec and data files are read, never written; an SVG whose content already equals the render is not rewritten.
- Effect class: filesystem read (spec and referenced data, confined to the root) and write (the SVG); `--png` also spawns `rsvg-convert`.
- Witness: idempotent re-run, `--check` drift test, root and symlink confinement tests, equality with the operation.

A paper's build is then `render-chart-specifications --root . figures/*.vl.json`, and CI's
is the same with `--check`.

## Hatching

Vega-Lite has no hatch fill. A spec asks for one by using the fill value
`"url(#hatch-rrggbb)"` (six lowercase hex digits), for example
`{"condition": {"test": "datum.denominator_type === 'assumed'", "value": "url(#hatch-2a78d6)"}, "value": "#2a78d6"}`.
After Vega renders, the service scans the SVG for those references and, in a fixed order
(sorted by color), injects one

~~~xml
<defs><pattern id="hatch-2a78d6" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="4" stroke="#2a78d6" stroke-width="1.4"/></pattern></defs>
~~~

per color after `<title>`/`<desc>`. The pattern is transparent between its 45-degree lines,
so the bar's background shows through; give the bar a `stroke` of the same color for a
defined outline. Why a named `url(#...)` fill and a post-process, rather than a gradient
or an image: it is plain SVG every renderer (browsers, `rsvg-convert`, Inkscape, Pandoc's
SVG-to-PDF) supports, it keeps the spec pure data, and the output stays a pure function of
the request. A `url(#name)` that is neither a hatch nor defined in the SVG is a warning.
Hatch fills are SVG-only: Vega's canvas renderer does not understand them (this service
never uses it).

## Determinism

Output bytes are a function of the request alone:

- **Fonts.** The default config's `font` is the stack string `Helvetica, Arial, sans-serif`;
  no font is resolved or embedded, so the viewer picks one. Text measurement for layout
  (axis label widths, title extents) uses a fixed Helvetica-metrics table instead of a
  canvas, so layout does not depend on the host's installed fonts, and installing
  `node-canvas` cannot change the output.
- **No clock, no randomness, no host zone.** No timestamp is written. Vega's random source
  is seeded (561) per render and `TZ` is pinned to `UTC` during it.
- **Ids.** Vega's `clipN`/`gradient_N` ids are prefixed with `vl-<first 8 hex of the SVG's sha256>`
  so several figures inlined into one HTML page cannot clip each other; `<title>`/`<desc>`
  ids carry the same prefix.
- **Ordering.** Data files are read in sorted order; hatch patterns are sorted; warnings are
  de-duplicated in emission order.
- **Defaults under the spec.** `DEFAULT_CONFIG` (`font`, white `background`) is merged
  under the spec's own `config`, so any spec can override it.

Upgrading `vega` or `vega-lite` can change bytes; the golden hashes in
`test/paper-figures.test.mjs` are updated deliberately, after looking at the figures.

## Held market offers

`package.json#x-market` declares the offers (the schema of
[x402-services-section#18](https://github.com/red-cup-engineering/x402-services-section),
copied to `test/fixtures/package-market.schema.json`); `data/records/offers/<operation>.json`
are the offers derived from it (`deriveOffersFromPackage`), one per operation, all
`saleStatus: "held"` and sold by the `engineering` enterprise (record sha256
`6af4ed9d1e4612b0383267e7ffe0ad028c52164ee3c5136110d434384a29c39f`), gateway
`chart-specification-rendering`, ledger account `Income:Sales:X402:Chart-specification-rendering`,
on the four House markets. Prices: `render-vega-lite-spec-as-svg` $0.005, `validate-vega-lite-spec`
$0.002. `test/fixtures/offer.schema.json` is a copy of the x402 package's `schemas/offer.schema.json`;
the offer records omit the `derivedFrom` marker that PR #18's schema adds, because the schema
on the House tree does not admit it yet. Set `X402_OFFER_MODULE=/path/to/x402-services-section/src/offer.mjs`
to also run the package's own `declareOffer` over each offer.

## Limitations

- Vega-Lite v5 only. Vega-Lite 6 and raw Vega specs are not accepted by the operations.
- Text measurement is an estimate (Helvetica metrics), so a chart set in a much wider or narrower font than the stack resolves to can have slightly loose or tight axis padding, and `labelOverlap` decisions use the estimate.
- Because renders are serialized and briefly set `process.env.TZ`, other code in the same process that formats dates during a render sees UTC. Run the service in its own process if that matters.
- `data` is a file map; there is no remote or glob loading by design. Images in image marks cannot be loaded (any URL is refused); use inline paths or shapes.
- PNG is a CLI convenience over a host `rsvg-convert`, not a service guarantee.
- Hatching is SVG-only and has one pattern geometry (4px, 45 degrees); only its color is parameterized.
- The edge/`node` runtime in the offers is declared `node`: the dependency chain is Vega's.
