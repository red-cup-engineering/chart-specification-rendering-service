---
name: score-infographic
description: Score a rendered infographic against the 11-criterion measurable quality rubric (text fit, collisions, alignment, grid, type hierarchy, legibility, WCAG contrast, density, accessibility, determinism, provenance). Use after render-infographic-from-spec and before accepting or comparing an infographic.
---

# score-infographic

Office: senior-engineer. Duty: producing-deterministic-infographics. Deterministic skill: no judgment.

## Input protocol

A valid infographic spec (the script renders it itself, twice, so the determinism criterion is real).

## Script

`scripts/score.mjs <spec.json>... --out <dir>`

## Output protocol

`<id>.score.json`: `{ id, svgSha256, spec, score (0-100), metrics: { <criterion>: { value 0-1, detail } }, failing: [criteria below their pass line], rubric }`. `benchmark-against-ai-infographics` reads it.

The criteria, weights, measures and pass lines are in `src/infographic/score.mjs` `RUBRIC`; `references/rubric.md` explains each one.

## Refusals (exit 2)

Invalid spec. The scorer never scores an SVG it cannot trace to a spec (no raw-SVG mode: the layout report is the evidence).

## Checks

`failing` is empty for an infographic that is to be accepted. A score is not an acceptance: the receiver still opens the file.
