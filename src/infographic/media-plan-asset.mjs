// Fits an infographic to the shot-asset slot of the shared media plan (computer-media-engineering-services-section,
// data/schema/media-plan.schema.json, `visual.assets[]`): { id, role: "frame" | "overlay", mediaType: "image/svg+xml",
// svg (inline, <= 400000 chars, self-contained) or identity (sha-256 NI), producer: { service, spec } }.
// The renderer (media-engineering-services-section) embeds each asset as a data-URI <image> on a scene with
// preserveAspectRatio="xMidYMid meet", so the asset's aspect must equal the plan's and its text must be outlined (an
// SVG inside <image> loads no fonts): this module checks both and refuses rather than letterboxing silently.
import { createHash } from "node:crypto";
import { renderInfographic, ENGINE_VERSION } from "./render.mjs";

export const MAX_INLINE_SVG_CHARS = 400000;
const ASPECTS = Object.freeze({ "16:9": 16 / 9, "9:16": 9 / 16 });

/** The media plan's own rule (media-plan.mjs svgIsSelfContained), restated; keep in step until that module exports a shared one. */
export function svgIsSelfContained(svg) {
  if (typeof svg !== "string" || !/^\s*(?:<\?xml[^>]*\?>\s*)?<svg[\s>]/u.test(svg)) return false;
  if (/<\s*(?:script|foreignObject|iframe|object|embed)\b/iu.test(svg)) return false;
  if (/\son[a-z]+\s*=/iu.test(svg)) return false;
  if (/(?:xlink:)?href\s*=\s*["'](?!#|data:image\/)/iu.test(svg)) return false;
  if (/url\(\s*["']?(?!#|data:)/iu.test(svg)) return false;
  if (/<!ENTITY|<!DOCTYPE/iu.test(svg)) return false;
  return true;
}

export const niOf = (text) => `ni:///sha-256;${createHash("sha256").update(text).digest("base64url")}`;

/**
 * @param spec an infographic spec
 * @param opts { id: slug, role: "overlay" | "frame", planAspect: "16:9" | "9:16", renderWidth?: px width the plan renders at }
 * @returns { asset, report } where `asset` can be placed in a shot's visual.assets unchanged.
 * Refusals (thrown): TypeError for a bad id/role/aspect; RangeError `ASPECT_MISMATCH`, `SVG_TOO_LARGE`, `SVG_NOT_SELF_CONTAINED`,
 * `LIVE_TEXT` (an inline asset must use outlined text), `DOES_NOT_FIT` (the layout reports it needs more room).
 */
export function mediaPlanAsset(spec, { id, role = "overlay", planAspect, renderWidth } = {}) {
  if (typeof id !== "string" || !/^[a-z0-9][a-z0-9-]{0,79}$/u.test(id)) throw new TypeError("asset id must be a slug ([a-z0-9-], at most 80)");
  if (role !== "overlay" && role !== "frame") throw new TypeError("role must be overlay or frame");
  if (!ASPECTS[planAspect]) throw new TypeError("planAspect must be 16:9 or 9:16");
  const next = structuredClone(spec);
  next.canvas = { ...(next.canvas ?? {}), background: role === "overlay" ? "transparent" : "solid", textMode: "outline" };
  const result = renderInfographic(next);
  const { width, height } = result.report.canvas;
  if (Math.abs(width / height - ASPECTS[planAspect]) > 0.01) throw new RangeError(`ASPECT_MISMATCH: the infographic is ${width}x${height} but the plan is ${planAspect}; the renderer would letterbox it`);
  if (result.warnings.length) throw new RangeError(`DOES_NOT_FIT: ${result.warnings.join("; ")}`);
  if (result.svg.length > MAX_INLINE_SVG_CHARS) throw new RangeError(`SVG_TOO_LARGE: ${result.svg.length} characters; the slot admits ${MAX_INLINE_SVG_CHARS}`);
  if (!svgIsSelfContained(result.svg)) throw new RangeError("SVG_NOT_SELF_CONTAINED: the media plan would refuse this SVG");
  const short = Math.min(width, height);
  const smallest = Math.min(...result.report.texts.map((t) => t.size));
  const widthPx = renderWidth ?? 540; // the deterministic renderer's scene is 540 px wide
  const shortAtRender = planAspect === "9:16" ? widthPx : (widthPx * 9) / 16;
  const minTextPxAtRender = Math.round(((smallest / short) * shortAtRender) * 10) / 10;
  const warnings = [];
  if (minTextPxAtRender < 10) warnings.push(`smallest text will be ${minTextPxAtRender} px at ${widthPx} px wide; author a sparser spec for this render width`);
  return {
    asset: {
      id, role, mediaType: "image/svg+xml", svg: result.svg, identity: niOf(result.svg),
      producer: { service: `chart-specification-rendering-service/infographic@${ENGINE_VERSION}`, spec: result.specDigest },
    },
    report: { bytes: result.bytes, chars: result.svg.length, sha256: result.sha256, canvas: [width, height], minTextPxAtRender, renderWidth: widthPx, warnings },
  };
}
