---
name: render-infographic-from-spec
description: Render one infographic spec (JSON) to a byte-reproducible SVG plus its layout report. Use when a spec exists and an SVG or video frame is wanted. Not for charts expressed as Vega-Lite (use render-vega-lite-spec-as-svg).
---

# render-infographic-from-spec

Office: senior-engineer (proposed seat: computer-media-engineering-services-section). Duty: producing-deterministic-infographics.

Deterministic skill: no judgment is involved. The script is the skill.

## Input protocol

`<spec>.json`, valid against `src/infographic/infographic-spec.schema.json` (`version` 1). Data blocks should carry `provenance`.

## Script

`scripts/render.mjs <spec.json>... --out <dir> [--png 1080p-16x9,1080x1920-9x16] [--strict] [--live]`

## Output protocol (what the next skill reads)

- `<id>.svg` - the infographic; its `<metadata>` holds the spec digest, scale, theme, fonts and any non-observed data.
- `<id>.report.json` - the layout report (text boxes, marks, block boxes, fit status). `score-infographic` reads this and the spec.
- `<id>.<size>.png` - only for sizes of the spec canvas's own aspect.

## Refusals (exit 2, nothing written)

- the spec fails the schema or a cross-field rule (duplicate ids, series without points);
- `--strict` and the render has warnings (content needs more room than the canvas has at the minimum scale; a truncated or overflowing text; a character with no glyph);
- an unknown `--png` size; `rsvg-convert` missing when `--png` is asked for.

`check` (exit 3) is the CI form: it re-renders and compares with the committed SVG.

## Checks before handing on

Warnings list is empty; the SVG digest equals a second render's; `score-infographic` passes.

## References

`references/spec-quickstart.md`.
