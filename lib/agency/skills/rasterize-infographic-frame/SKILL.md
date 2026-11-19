---
name: rasterize-infographic-frame
description: Produce PNG frames at video resolutions (1920x1080, 3840x2160, 1080x1920) from an infographic SVG. Use when a video thread needs a shot asset or overlay.
---

# rasterize-infographic-frame

Office: senior-engineer. Duty: producing-deterministic-infographics. Deterministic skill.

## Input protocol

A spec (rendered through `render-infographic-from-spec`). For an overlay, `canvas.background: "transparent"` and a `safeArea` of 0.05.

## Script

`scripts/rasterize.mjs <spec.json> --out <dir> --png 1080p-16x9,4k-16x9,1080x1920-9x16`

Sizes available: `1080p-16x9`, `1440p-16x9`, `4k-16x9`, `1080x1920-9x16`, `2160x3840-9x16`. A size is written only when its aspect equals the canvas's.

## Output protocol

`<id>.<size>.png` beside the SVG. PNG bytes come from `rsvg-convert` and are stable on one host and version; the SVG is the determinism guarantee, the PNG is a derived frame. Record the SVG digest, not the PNG digest, as the identity.

## Refusals

Unknown size; `rsvg-convert` missing; canvas aspect matches no requested size (nothing is stretched or letterboxed).
