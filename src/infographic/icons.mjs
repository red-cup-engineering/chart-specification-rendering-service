// A small original icon set on a 24 x 24 grid, drawn as 2-unit round-capped strokes. Authored for this engine
// (no third-party icon licence to carry). Names are the vocabulary of the spec's `icon` fields.
export const ICONS = Object.freeze({
  thermometer: "M14 14.76V5a2 2 0 0 0-4 0v9.76a4 4 0 1 0 4 0z",
  snowflake: "M12 2v20M4.9 7l14.2 10M4.9 17L19.1 7M9 3.8l3 2.4 3-2.4M9 20.2l3-2.4 3 2.4M2.8 10.4l3.6 1.1-1 3.6M21.2 10.4l-3.6 1.1 1 3.6",
  sun: "M8 12a4 4 0 1 0 8 0 4 4 0 1 0-8 0M12 2v2.5M12 19.5V22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M2 12h2.5M19.5 12H22M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8",
  drop: "M12 2.5s6 6.2 6 10.5a6 6 0 0 1-12 0C6 8.7 12 2.5 12 2.5z",
  rain: "M7 15a4.5 4.5 0 1 1 1.2-8.8A6 6 0 0 1 19 9.5 3.7 3.7 0 0 1 18 15M8 18l-1 3M12 18l-1 3M16 18l-1 3",
  wind: "M3 8h10a3 3 0 1 0-3-3M3 12h15a3 3 0 1 1-3 3M3 16h7",
  flame: "M12 22c4 0 7-2.7 7-6.8 0-3-1.8-5-3.2-6.5-.3 1.5-1.1 2.6-2.3 3 .4-3-.8-6.3-3.5-8.7C9.5 6.6 5 10 5 15.2 5 19.3 8 22 12 22z",
  leaf: "M20 4C9 4 4 9 4 16c0 1.5.3 2.8.8 4C6 17 9 14 14 12c-4 3-6 5.5-7 8 8 0 13-5 13-16z",
  tree: "M12 22v-5M12 17c-3.5 0-6-2.2-6-5 0-1.5.8-2.8 2-3.6C8 7 9.8 5 12 2c2.2 3 4 5 4 6.4 1.2.8 2 2.1 2 3.6 0 2.8-2.5 5-6 5z",
  wave: "M2 8c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2M2 14c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2M2 20c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2",
  ice: "M4 7l8-4 8 4v10l-8 4-8-4zM4 7l8 4 8-4M12 11v10",
  building: "M5 21V4h9v17M14 9h5v12M3 21h18M8 8h2M8 12h2M8 16h2M16.5 13h.01M16.5 17h.01",
  factory: "M3 21V10l6 3.5V10l6 3.5V5h4v16zM3 21h18M17 9h.01",
  clock: "M3 12a9 9 0 1 0 18 0 9 9 0 1 0-18 0M12 7v5l3 2",
  calendar: "M4 6h16v15H4zM4 10.5h16M8 3v4M16 3v4",
  pin: "M12 21s7-6.2 7-11.5a7 7 0 1 0-14 0C5 14.8 12 21 12 21zM9.5 9.5a2.5 2.5 0 1 0 5 0 2.5 2.5 0 1 0-5 0",
  "arrow-up": "M12 20V5M5 12l7-7 7 7",
  "arrow-down": "M12 4v15M5 12l7 7 7-7",
  "arrow-right": "M4 12h16M13 5l7 7-7 7",
  check: "M4 12.5l5 5L20 6.5",
  cross: "M6 6l12 12M18 6L6 18",
  warning: "M12 3L2 20h20zM12 10v5M12 17.5v.5",
  info: "M3 12a9 9 0 1 0 18 0 9 9 0 1 0-18 0M12 11v6M12 7.5v.5",
  chart: "M4 20V4M4 20h16M8 16v-4M12 16V8M16 16v-6",
  bolt: "M13 2L4 14h7l-1 8 9-12h-7z",
  house: "M3 11l9-8 9 8M5 10v11h14V10M10 21v-6h4v6",
  people: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2 21c0-4 3-6 7-6s7 2 7 6M17 5a3 3 0 0 1 0 6M19 15c2 .8 3 2.6 3 6",
  shield: "M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z",
  book: "M4 4h6a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H4zM20 4h-6a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h6z",
  globe: "M3 12a9 9 0 1 0 18 0 9 9 0 1 0-18 0M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18",
  database: "M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3",
  gear: "M9 12a3 3 0 1 0 6 0 3 3 0 1 0-6 0M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2",
});

/** Draws icon `name` with its top-left at (x, y) in a `size` px square. */
export function iconMarkup(name, x, y, size, color, strokeWidth = 2) {
  const d = ICONS[name];
  if (!d) throw new RangeError(`unknown icon ${JSON.stringify(name)}; known: ${Object.keys(ICONS).join(", ")}`);
  const k = size / 24;
  const r = (v) => Math.round(v * 100) / 100;
  return `<path transform="translate(${r(x)} ${r(y)}) scale(${r(k * 1000) / 1000})" d="${d}" fill="none" stroke="${color}" stroke-width="${r(strokeWidth)}" stroke-linecap="round" stroke-linejoin="round"/>`;
}
