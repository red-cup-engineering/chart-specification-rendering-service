---
name: benchmark-against-ai-infographics
description: Compare our rendered infographics with AI-generated ones (NotebookLM / Gemini PNGs) on the shared criteria, with automated pixel descriptors and a clearly separated reviewer audit. Use when re-benchmarking after an engine change or when a new AI-infographic sample is available.
---

# benchmark-against-ai-infographics

Office: senior-engineer; the audit step is a reviewer step. Duty: producing-deterministic-infographics. Meet-then-beat comparator for the Group's meet-then-beat method.

## Steps

1. **Collect benchmark samples (judgment-free).** Read-only copy of NotebookLM/Gemini infographic PNGs from `gdrive:561 Group/Media/gemini-notebook/*/infographic/` or `gdrive:media/notebooklm/` with `rclone copy` (never move or delete). Record each file's sha256 and Drive id in the manifest.
2. **Audit (LLM or human judgment, says so).** A reviewer opens each PNG and records in the manifest `audit`: approximate words, garbled or misspelled words, numbers that carry a claim, whether any source is shown, and a one-line note. The host had no OCR, so this count is a reading, not a measurement; the manifest field `judgment` states who made it and when. This is the only judgment step.
3. **Score ours (script).** `score-infographic` for each of our specs.
4. **Compare (script).** `scripts/compare.mjs --manifest <benchmark.json> --scores a.score.json,b.score.json --out <dir>` writes `comparison.json`: our rubric scores and metrics, pixel descriptors for both sides (colour economy, flat share, edge density, whitespace, contrast spread, alignment peaks), and the audit values.

## Manifest protocol (`benchmark.json`)

`{ "judgment": { "by": "...", "on": "YYYY-MM-DD", "method": "visual reading" }, "items": [ { "id", "title", "provider", "file": "relative/path.png", "size": [w, h], "sha256", "audit": { "words", "garbled", "claimNumbers", "sourcesShown", "note" } } ] }`

## Refusals

Manifest file missing; a listed PNG missing; a PNG the decoder cannot read (8-bit, non-interlaced only); no `--scores`.

## Honesty rule

The comparison reports where AI infographics win (illustration, atmosphere, density of imagery) as plainly as where we win (reproducibility, text fidelity, accessibility, traceability). Do not publish a composite that mixes audited and measured values.
