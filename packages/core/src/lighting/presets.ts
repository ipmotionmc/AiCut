import type { KeyPreset } from "./types.js";

/**
 * Canonical key-light direction unit vectors. Coordinate space matches
 * three.js's defaults — +X right, +Y up, +Z toward the camera. So
 * `front: (0, 0, 1)` means "light positioned between the camera and
 * the subject," which is the most flattering portrait default.
 */
export const PRESET_DIRECTIONS: Record<
  Exclude<KeyPreset, "custom">,
  { x: number; y: number; z: number }
> = {
  left:   { x: -1, y: 0,  z: 0 },
  right:  { x: 1,  y: 0,  z: 0 },
  top:    { x: 0,  y: 1,  z: 0 },
  bottom: { x: 0,  y: -1, z: 0 },
  front:  { x: 0,  y: 0,  z: 1 },
  back:   { x: 0,  y: 0,  z: -1 },
};

/** Snap angle (radians). Drag end-points within this of a preset snap. */
export const PRESET_SNAP_RADIANS = (12 / 180) * Math.PI;

export function normalize(v: { x: number; y: number; z: number }) {
  const len = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

/**
 * Decide which preset (if any) a given unit-vector direction snaps to.
 * Returns `"custom"` when no preset is within `PRESET_SNAP_RADIANS`.
 */
export function snapToPreset(d: {
  x: number;
  y: number;
  z: number;
}): KeyPreset {
  let best: KeyPreset = "custom";
  let bestDot = Math.cos(PRESET_SNAP_RADIANS);
  for (const [name, p] of Object.entries(PRESET_DIRECTIONS)) {
    // dot product on unit vectors == cos(angle between them).
    const dot = d.x * p.x + d.y * p.y + d.z * p.z;
    if (dot > bestDot) {
      bestDot = dot;
      best = name as KeyPreset;
    }
  }
  return best;
}
