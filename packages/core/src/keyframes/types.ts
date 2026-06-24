/**
 * The transform a clip's frame is painted with at a given moment.
 * Engines that support keyframes apply this via `ctx.setTransform`
 * before `drawImage`. Identity is `{ x: 0, y: 0, scale: 1 }`.
 */
export interface EffectiveTransform {
  x: number;
  y: number;
  scale: number;
}

/** Identity transform — no translation, no scaling. */
export const IDENTITY_TRANSFORM: EffectiveTransform = {
  x: 0,
  y: 0,
  scale: 1,
};

/** True when a transform is effectively identity (within FP slop). */
export function isIdentityTransform(t: EffectiveTransform): boolean {
  return (
    Math.abs(t.x) < 0.001 &&
    Math.abs(t.y) < 0.001 &&
    Math.abs(t.scale - 1) < 0.0001
  );
}
