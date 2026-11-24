// Text shaping for the infographic engine: inline markup, break opportunities (spaces, hyphens, soft hyphens and a
// conservative English hyphenator), and minimum-raggedness line breaking (a total-fit dynamic program, not greedy fill).
import { measureText } from "./font.mjs";

const SOFT = "­";
const VOWELS = /[aeiouyAEIOUYà-æè-ïò-öù-ü]/u;
const DIGRAPHS = new Set(["th", "sh", "ch", "ph", "gh", "wh", "ck", "qu", "ng", "ll", "ss", "tt", "ff", "pp", "rr", "nn", "mm", "dd", "gg", "bb", "cc", "zz"]);
const PREFIXES = ["inter", "trans", "super", "under", "over", "counter", "micro", "macro", "multi", "hyper", "semi", "anti", "non", "un", "re", "de", "dis", "pre", "mis", "sub", "out"];
const SUFFIXES = ["ization", "isation", "ational", "tion", "sion", "ment", "ness", "able", "ible", "ical", "ally", "ities", "ity", "ing", "ings", "ers", "est", "ful", "less", "ous", "ive", "ism", "ist", "ize", "ise", "ate", "ure", "ence", "ance", "ology", "ography"];

/** Candidate hyphenation offsets (characters from the word start) for a plain alphabetic word. */
export function hyphenationPoints(word) {
  if (word.length < 7 || !/^[A-Za-zÀ-ÿ]+$/u.test(word)) return [];
  const lower = word.toLowerCase();
  const points = new Set();
  for (const prefix of PREFIXES) if (lower.startsWith(prefix) && lower.length - prefix.length >= 3 && prefix.length >= 2) points.add(prefix.length);
  for (const suffix of SUFFIXES) {
    const at = lower.length - suffix.length;
    if (lower.endsWith(suffix) && at >= 3) {
      // keep a doubled consonant with the stem: "run|ning" not "runn|ing"
      points.add(at);
    }
  }
  for (let i = 2; i <= lower.length - 3; i += 1) {
    const left = lower[i - 1], right = lower[i];
    const pair = left + right;
    if (VOWELS.test(left) && !VOWELS.test(right) && i + 1 < lower.length && VOWELS.test(lower[i + 1]) && !DIGRAPHS.has(pair)) points.add(i);
    else if (!VOWELS.test(left) && !VOWELS.test(right) && !DIGRAPHS.has(pair) && i >= 3 && VOWELS.test(lower[i - 2]) && i + 1 < lower.length && VOWELS.test(lower[i + 1])) points.add(i);
  }
  return [...points].filter((p) => p >= 3 && lower.length - p >= 3).sort((a, b) => a - b);
}

/** Splits `**bold**` and `_italic_` (word-bounded) into runs: [{text, face}]. Anything else is literal. */
export function parseInline(source, baseFace) {
  const runs = [];
  const pattern = /\*\*([^*]+)\*\*|(?<![A-Za-z0-9])_([^_]+)_(?![A-Za-z0-9])/gu;
  let last = 0;
  for (let match = pattern.exec(source); match; match = pattern.exec(source)) {
    if (match.index > last) runs.push({ text: source.slice(last, match.index), face: baseFace });
    runs.push(match[1] !== undefined ? { text: match[1], face: baseFace === "serifBold" ? "serifBold" : "sansBold" } : { text: match[2], face: baseFace === "sansBold" ? "sansBold" : "sansItalic" });
    last = match.index + match[0].length;
  }
  if (last < source.length) runs.push({ text: source.slice(last), face: baseFace });
  return runs;
}

/** Plain text of inline markup (what a screen reader and the transcript see). */
export function plainText(source) {
  return parseInline(String(source), "sans").map((run) => run.text).join("");
}

// A "piece" is an unbreakable run of glyphs. `after` says what may follow it on the same line.
function pieces(runs, size, tracking, hyphenate) {
  const out = [];
  for (const run of runs) {
    const parts = run.text.split(/([ \t\n]+)/u);
    for (const part of parts) {
      if (part === "") continue;
      if (/^[ \t\n]+$/u.test(part)) { out.push({ kind: "space", face: run.face, text: " ", width: measureText(run.face, " ", size, tracking).width }); continue; }
      // break after hyphen-like characters and at soft hyphens
      const chunks = part.split(new RegExp(`(?<=[-‐—/${SOFT}]|(?<![0-9])–)`, "u")).filter((c) => c !== "");
      chunks.forEach((chunk, index) => {
        const soft = chunk.endsWith(SOFT);
        const text = soft ? chunk.slice(0, -1) : chunk;
        const m = measureText(run.face, text, size, tracking);
        const hard = /([-‐—/]|(?<![0-9])–)$/u.test(text);
        const joined = index < chunks.length - 1 && !soft && !hard ? false : false;
        out.push({ kind: "word", face: run.face, text, width: m.width, missing: m.missing, soft, hardBreak: hard && index < chunks.length - 1, joined, wordEnd: index === chunks.length - 1, hyphenate });
      });
    }
  }
  return out;
}

function expandHyphenation(list, size, tracking) {
  // Replace long words by fragments that carry a `soft`-like break between them.
  const out = [];
  for (const piece of list) {
    if (piece.kind !== "word" || !piece.hyphenate || piece.soft || piece.hardBreak) { out.push(piece); continue; }
    const points = hyphenationPoints(piece.text);
    if (points.length === 0) { out.push(piece); continue; }
    let from = 0;
    for (const point of [...points, piece.text.length]) {
      const text = piece.text.slice(from, point);
      const m = measureText(piece.face, text, size, tracking);
      out.push({ ...piece, text, width: m.width, soft: point !== piece.text.length, hyphenated: point !== piece.text.length, wordEnd: point === piece.text.length ? piece.wordEnd : false });
      from = point;
    }
  }
  return out;
}

/**
 * Breaks inline-marked text into lines no wider than `width`, minimizing total raggedness.
 * Returns { lines: [{ runs: [{text, face}], width }], truncated, missing, hyphens }.
 */
export function wrapText(source, { face = "sans", size, width, tracking = 0, maxLines = Infinity, hyphenate = true }) {
  const runs = parseInline(String(source), face);
  const hyphen = measureText(face, "-", size, tracking).width;
  const list = expandHyphenation(pieces(runs, size, tracking, hyphenate), size, tracking);
  // Build break candidates between pieces.
  const n = list.length;
  const missing = list.reduce((sum, p) => sum + (p.missing ?? 0), 0);
  if (n === 0) return { lines: [], truncated: false, missing, hyphens: 0 };
  // prefix widths where spaces count only inside a line
  const lineWidth = (from, to, hyphenAtEnd) => {
    let w = 0;
    for (let i = from; i < to; i += 1) w += list[i].width;
    // trim trailing space
    if (to > from && list[to - 1].kind === "space") w -= list[to - 1].width;
    return w + (hyphenAtEnd ? hyphen : 0);
  };
  const canBreakAfter = (i) => {
    const p = list[i];
    if (i === n - 1) return true;
    if (p.kind === "space") return true;
    if (p.soft || p.hardBreak) return true;
    return false;
  };
  const INF = 1e18;
  const best = new Array(n + 1).fill(INF);
  const from = new Array(n + 1).fill(-1);
  best[0] = 0;
  for (let end = 1; end <= n; end += 1) {
    if (!canBreakAfter(end - 1)) continue;
    for (let start = end - 1; start >= 0; start -= 1) {
      if (best[start] >= INF) continue;
      if (start > 0 && list[start].kind === "space") continue; // lines never start with a space
      const hyphenAtEnd = list[end - 1].soft && !/[-‐–—/]$/u.test(list[end - 1].text) && end !== n;
      const w = lineWidth(start, end, hyphenAtEnd);
      if (w > width + 0.01) { if (end - start > 1) break; }
      const slack = Math.max(0, width - w);
      const last = end === n;
      const over = w > width + 0.01;
      let cost = over ? 1e9 + (w - width) * 1000 : last ? 0 : Math.pow(slack / width, 3) * 100;
      if (hyphenAtEnd) cost += 14;
      if (last && !over && w < width * 0.18 && start > 0) cost += 6; // avoid a one-word widow
      const total = best[start] + cost + 0.5; // 0.5 per line: prefer fewer lines when slack is equal
      if (total < best[end]) { best[end] = total; from[end] = start; }
    }
  }
  const spans = [];
  for (let end = n; end > 0; end = from[end]) {
    if (from[end] < 0) break;
    spans.unshift([from[end], end]);
  }
  let truncated = false;
  let use = spans;
  if (spans.length > maxLines) { use = spans.slice(0, maxLines); truncated = true; }
  let hyphens = 0;
  const lines = use.map(([a, b], index) => {
    const hyphenAtEnd = list[b - 1].soft && !/[-‐–—/]$/u.test(list[b - 1].text) && b !== n;
    if (hyphenAtEnd) hyphens += 1;
    const lineRuns = [];
    for (let i = a; i < b; i += 1) {
      if (i === b - 1 && list[i].kind === "space") continue;
      const prior = lineRuns[lineRuns.length - 1];
      if (prior && prior.face === list[i].face) prior.text += list[i].text;
      else lineRuns.push({ text: list[i].text, face: list[i].face });
    }
    let text = lineRuns;
    if (hyphenAtEnd) text = [...lineRuns.slice(0, -1), { text: `${lineRuns[lineRuns.length - 1].text}-`, face: lineRuns[lineRuns.length - 1].face }];
    if (truncated && index === use.length - 1) {
      const lastRun = text[text.length - 1];
      const others = text.slice(0, -1).reduce((sum, run) => sum + measureText(run.face, run.text, size, tracking).width, 0);
      let t = lastRun.text.replace(/[\s,.;:]+$/u, "");
      while (t.length > 1 && others + measureText(lastRun.face, `${t}\u2026`, size, tracking).width > width) t = t.slice(0, -1);
      text = [...text.slice(0, -1), { text: `${t}\u2026`, face: lastRun.face }];
    }
    const w = text.reduce((sum, run) => sum + measureText(run.face, run.text, size, tracking).width, 0);
    return { runs: text, width: w };
  });
  return { lines, truncated, missing, hyphens };
}

/** Width of the widest unbreakable chunk, for minimum-width constraints. */
export function longestPiece(source, { face = "sans", size, tracking = 0 }) {
  const runs = parseInline(String(source), face);
  return Math.max(0, ...pieces(runs, size, tracking, false).filter((p) => p.kind === "word").map((p) => p.width));
}
