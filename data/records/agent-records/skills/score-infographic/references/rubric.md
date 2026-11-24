# Infographic quality rubric v1

What "quality" means here, as measures a script can compute. Weights sum to 100.

| Criterion | Weight | Measure | Pass line |
|---|---|---|---|
| textFit | 10 | no overflowing, truncated or glyph-less text | 1.0 |
| collisionFree | 12 | text ink boxes that overlap no other text | 1.0 |
| alignment | 8 | left edges shared by at least 3 texts | 0.85 |
| gridConformance | 5 | blocks start on 12-column lines | 1.0 |
| typeHierarchy | 8 | 3 to 7 size steps, adjacent steps at least 1.14x | 0.9 |
| legibility | 12 | text area at or above 1.6% of the short side (body 2%) | 0.95 |
| contrast | 14 | WCAG 2.x AA for text on its real background; 3:1 for marks | 1.0 |
| density | 6 | 40 to 200 words per megapixel (heuristic band) | 0.8 |
| accessibility | 10 | title, description with full text, lang, headings, role, reading order | 1.0 |
| determinism | 8 | two renders are byte-identical | 1.0 |
| provenance | 7 | data blocks declare provenance | 1.0 |

Not measured (and not claimed): baseline-grid rhythm, data-ink ratio, colour-vision-deficiency simulation, illustration quality, aesthetic judgement. Those need either a new measure or a human; a human judgment is labelled as such wherever it appears (see benchmark-against-ai-infographics).

Density and the 1.6% legibility line are calibrated heuristics for video and poster use, not standards; WCAG contrast thresholds are the standard's.
