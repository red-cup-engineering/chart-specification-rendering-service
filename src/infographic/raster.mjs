// Raster side: SVG -> PNG at video resolutions through rsvg-convert (a host tool, like the repository CLI's --png; PNG bytes
// are reproducible on one host/version but are not the determinism guarantee, the SVG is), a dependency-free PNG decoder,
// and pixel descriptors that apply equally to our renders and to AI-generated PNGs.
import { spawnSync } from "node:child_process";
import { inflateSync } from "node:zlib";

export const VIDEO_SIZES = Object.freeze({ "1080p-16x9": [1920, 1080], "1440p-16x9": [2560, 1440], "4k-16x9": [3840, 2160], "1080x1920-9x16": [1080, 1920], "2160x3840-9x16": [2160, 3840] });

/** Rasterizes SVG text at an exact pixel size. Returns a Buffer. Throws if rsvg-convert is missing. */
export function rasterizeSvg(svg, { width, height, background } = {}) {
  const args = ["--format", "png", "--dpi-x", "96", "--dpi-y", "96"];
  if (width) args.push("--width", String(width));
  if (height) args.push("--height", String(height));
  if (background) args.push("--background-color", background);
  const done = spawnSync("rsvg-convert", args, { input: svg, maxBuffer: 256 * 1024 * 1024, env: { PATH: process.env.PATH, LANG: "C", LC_ALL: "C", TZ: "UTC" } });
  if (done.error) throw new Error(`rsvg-convert is required for PNG output: ${done.error.message}`);
  if (done.status !== 0) throw new Error(`rsvg-convert failed: ${done.stderr.toString()}`);
  return done.stdout;
}

/** Minimal PNG decoder: 8-bit gray/RGB/RGBA/gray+alpha, non-interlaced. Returns { width, height, channels, data }. */
export function decodePng(buffer) {
  if (buffer.readUInt32BE(0) !== 0x89504e47) throw new TypeError("not a PNG");
  let at = 8, width = 0, height = 0, depth = 0, color = 0, interlace = 0;
  const idat = [];
  while (at < buffer.length) {
    const length = buffer.readUInt32BE(at), type = buffer.toString("latin1", at + 4, at + 8);
    const body = buffer.subarray(at + 8, at + 8 + length);
    if (type === "IHDR") { width = body.readUInt32BE(0); height = body.readUInt32BE(4); depth = body[8]; color = body[9]; interlace = body[12]; }
    else if (type === "IDAT") idat.push(body);
    else if (type === "IEND") break;
    at += 12 + length;
  }
  if (depth !== 8 || interlace !== 0 || ![0, 2, 4, 6].includes(color)) throw new RangeError(`unsupported PNG (depth ${depth}, colour ${color}, interlace ${interlace})`);
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[color];
  const stride = width * channels;
  const raw = inflateSync(Buffer.concat(idat));
  const out = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x += 1) {
      const a = x >= channels ? out[y * stride + x - channels] : 0;
      const b = y > 0 ? out[(y - 1) * stride + x] : 0;
      const c = x >= channels && y > 0 ? out[(y - 1) * stride + x - channels] : 0;
      let v = row[x];
      if (filter === 1) v += a; else if (filter === 2) v += b; else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      out[y * stride + x] = v & 255;
    }
  }
  return { width, height, channels, data: out };
}

/** Box-filters to `targetShort` on the short side and returns luminance (0..255 floats) and RGB planes. */
function downscale(img, targetShort) {
  const f = Math.max(1, Math.floor(Math.min(img.width, img.height) / targetShort));
  const w = Math.floor(img.width / f), h = Math.floor(img.height / f);
  const rgb = new Float32Array(w * h * 3);
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
    let r = 0, g = 0, b = 0;
    for (let dy = 0; dy < f; dy += 1) for (let dx = 0; dx < f; dx += 1) {
      const i = ((y * f + dy) * img.width + (x * f + dx)) * img.channels;
      if (img.channels >= 3) { r += img.data[i]; g += img.data[i + 1]; b += img.data[i + 2]; } else { r += img.data[i]; g += img.data[i]; b += img.data[i]; }
    }
    const k = f * f;
    rgb[(y * w + x) * 3] = r / k; rgb[(y * w + x) * 3 + 1] = g / k; rgb[(y * w + x) * 3 + 2] = b / k;
  }
  return { w, h, rgb };
}

/**
 * Pixel descriptors comparable across an SVG render and an AI PNG (both decoded to <= 540 px short side):
 *   colorEconomy   colours (4 bits/channel) needed to cover 90% of pixels; fewer = more systematic palette
 *   flatShare      share of pixels in locally flat (gradient < 6/255) regions; high = clean fields, low = texture
 *   edgeDensity    mean gradient magnitude / 255; a proxy for visual detail load
 *   whitespace     share of 12 px tiles that are blank-ish (variance < 4)
 *   contrastSpread luminance 5th..95th percentile spread / 255
 *   alignPeaks     sharpness of vertical edge lines: share of edge energy in the top 4% of columns (text and cards align)
 */
export function pixelDescriptors(img) {
  const { w, h, rgb } = downscale(img, 540);
  const lum = new Float32Array(w * h);
  const hist = new Map();
  for (let i = 0; i < w * h; i += 1) {
    const r = rgb[i * 3], g = rgb[i * 3 + 1], b = rgb[i * 3 + 2];
    lum[i] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    hist.set(key, (hist.get(key) ?? 0) + 1);
  }
  const counts = [...hist.values()].sort((a, b) => b - a);
  let acc = 0, colors = 0;
  for (const c of counts) { acc += c; colors += 1; if (acc >= 0.9 * w * h) break; }
  let flat = 0, edge = 0;
  const colEnergy = new Float64Array(w);
  for (let y = 1; y < h - 1; y += 1) for (let x = 1; x < w - 1; x += 1) {
    const gx = lum[y * w + x + 1] - lum[y * w + x - 1], gy = lum[(y + 1) * w + x] - lum[(y - 1) * w + x];
    const mag = Math.hypot(gx, gy) / 2;
    edge += mag; if (mag < 6) flat += 1;
    if (Math.abs(gx) > 24 && Math.abs(gy) < Math.abs(gx) * 0.4) colEnergy[x] += Math.abs(gx);
  }
  const inner = (w - 2) * (h - 2);
  let blank = 0, tiles = 0;
  for (let ty = 0; ty + 12 <= h; ty += 12) for (let tx = 0; tx + 12 <= w; tx += 12) {
    let s = 0, s2 = 0;
    for (let y = 0; y < 12; y += 1) for (let x = 0; x < 12; x += 1) { const v = lum[(ty + y) * w + tx + x]; s += v; s2 += v * v; }
    const variance = s2 / 144 - (s / 144) ** 2;
    tiles += 1; if (variance < 4) blank += 1;
  }
  const sorted = [...lum].sort((a, b) => a - b);
  const total = colEnergy.reduce((a, b) => a + b, 0) || 1;
  const topCols = [...colEnergy].sort((a, b) => b - a).slice(0, Math.max(1, Math.floor(w * 0.04))).reduce((a, b) => a + b, 0);
  const round = (v, p = 3) => Math.round(v * 10 ** p) / 10 ** p;
  return { decodedAt: [w, h], colorEconomy: colors, flatShare: round(flat / inner), edgeDensity: round(edge / inner / 255, 4), whitespace: round(blank / tiles), contrastSpread: round((sorted[Math.floor(sorted.length * 0.95)] - sorted[Math.floor(sorted.length * 0.05)]) / 255), alignPeaks: round(topCols / total) };
}
