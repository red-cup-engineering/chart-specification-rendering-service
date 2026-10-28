# Spec quickstart

A spec is `{ version: 1, meta: { title, description }, canvas, theme, blocks: [...] }`.

- `canvas.preset`: `landscape-16x9` (1920x1080), `portrait-9x16` (1080x1920), `landscape-4k`, `portrait-4k`, `square`, `poster-2x3`; or `width`/`height`. `safeArea` is the fraction kept clear on every side (0.05 is broadcast title-safe). `background: "transparent"` for overlays.
- Blocks flow on a 12-column grid by `span`; `dock: "bottom"` pins a block (sources) to the bottom edge.
- Block types: `header`, `heroStat`, `stats`, `chart` (`line`, `anomalyBars`, `stripes`, `fan`, `bars`), `comparison` (`columns`, `bars`), `timeline`, `process`, `callout`, `prose`, `locator`, `sources`.
- Every data block should declare `provenance: { kind: "observed" | "derived" | "model" | "fixture" | "illustrative" }`. Anything but `observed` is badged on the graphic.
- Inline markup in text: `**bold**`, `_italic_`.
- Complete examples: `examples/specs/*.json`, built from open data by `examples/build-example-specs.mjs`.

Programmatic use: `import { renderInfographic } from "@red-cup-engineering/chart-specification-rendering-service/infographic"`.
