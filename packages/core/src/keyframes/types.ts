/**
 * The transform a clip's content is rendered with at a given moment.
 * Engines apply this INSIDE a fixed output frame: `panX` / `panY`
 * translate the content (in CSS px), `scale` resizes it around the
 * output frame's center. Anything pushed outside the frame is
 * clipped. Identity = `{ panX: 0, panY: 0, scale: 1 }`.
 */
export interface EffectiveTransform {
  panX: number;
  panY: number;
  scale: number;
}

/** Identity transform — no pan, no scaling (content fills the output frame). */
export const IDENTITY_TRANSFORM: EffectiveTransform = {
  panX: 0,
  panY: 0,
  scale: 1,
};

/** True when a transform is effectively identity (within FP slop). */
export function isIdentityTransform(t: EffectiveTransform): boolean {
  return (
    Math.abs(t.panX) < 0.001 &&
    Math.abs(t.panY) < 0.001 &&
    Math.abs(t.scale - 1) < 0.0001
  );
}
