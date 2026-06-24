import type { Clip, Keyframe, Ms } from "../types.js";
import {
  IDENTITY_TRANSFORM,
  type EffectiveTransform,
} from "./types.js";

/**
 * Resolve the clip's effective transform at the given clip-local time.
 *
 * Rules:
 *   - No keyframes              → identity
 *   - One keyframe              → that keyframe's values, constant
 *   - Time before first keyframe → first keyframe's values (held)
 *   - Time after last keyframe   → last keyframe's values (held)
 *   - Between two keyframes      → linear interpolation per axis
 *
 * Per-axis fallback: if a keyframe omits `x`, `y`, or `scale`, the
 * missing axis is treated as identity for that keyframe (x = 0, y = 0,
 * scale = 1). This matches the "sparse keyframes" contract.
 *
 * `normalizeProject` guarantees `clip.keyframes` is sorted by `time`,
 * so a small array makes a linear scan cheap. Most clips will have
 * very few keyframes; if a project ever has clips with hundreds of
 * keyframes, this becomes a candidate for binary search.
 */
export function getEffectiveTransform(
  clip: Clip,
  localMs: Ms,
): EffectiveTransform {
  const kfs = clip.keyframes;
  if (!kfs || kfs.length === 0) return IDENTITY_TRANSFORM;

  // Single keyframe — constant. Could fall through the loop below but
  // it's worth special-casing for clarity + a small perf win.
  if (kfs.length === 1) {
    const only = kfs[0];
    if (!only) return IDENTITY_TRANSFORM;
    return resolveKeyframe(only);
  }

  // Held before first / after last.
  const first = kfs[0];
  const last = kfs[kfs.length - 1];
  if (!first || !last) return IDENTITY_TRANSFORM;
  if (localMs <= first.time) return resolveKeyframe(first);
  if (localMs >= last.time) return resolveKeyframe(last);

  // Find the bracketing pair.
  for (let i = 0; i < kfs.length - 1; i += 1) {
    const a = kfs[i];
    const b = kfs[i + 1];
    if (!a || !b) continue;
    if (localMs >= a.time && localMs <= b.time) {
      // Same-time pair shouldn't happen after normalize, but guard
      // against div-by-zero defensively.
      if (b.time === a.time) return resolveKeyframe(a);
      const t = (localMs - a.time) / (b.time - a.time);
      return lerpKeyframe(a, b, t);
    }
  }

  // Fallback — unreachable for a sorted, well-formed array but keeps
  // the type checker happy without a non-null assertion.
  return resolveKeyframe(last);
}

/** Pin a keyframe's missing axes to identity. */
function resolveKeyframe(kf: Keyframe): EffectiveTransform {
  return {
    x: kf.x ?? 0,
    y: kf.y ?? 0,
    scale: kf.scale ?? 1,
  };
}

/** Linear interpolation between two keyframes' resolved values. */
function lerpKeyframe(
  a: Keyframe,
  b: Keyframe,
  t: number,
): EffectiveTransform {
  const ra = resolveKeyframe(a);
  const rb = resolveKeyframe(b);
  return {
    x: ra.x + (rb.x - ra.x) * t,
    y: ra.y + (rb.y - ra.y) * t,
    scale: ra.scale + (rb.scale - ra.scale) * t,
  };
}

/**
 * Convenience — pull the effective transform at a *timeline-absolute*
 * time (rather than clip-local). Used by engines + UI panels that
 * track the playhead.
 */
export function getTransformAtTimelineTime(
  clip: Clip,
  timelineMs: Ms,
): EffectiveTransform {
  return getEffectiveTransform(clip, timelineMs - clip.start);
}
