import { describe, expect, it } from "vitest";
import type { Clip } from "../types.js";
import { getEffectiveTransform } from "./interpolate.js";
import { IDENTITY_TRANSFORM } from "./types.js";

function clip(overrides?: Partial<Clip>): Clip {
  return {
    id: "c1",
    sourceId: "s1",
    in: 0,
    out: 5000,
    start: 0,
    ...overrides,
  };
}

describe("getEffectiveTransform", () => {
  it("returns identity when keyframes is absent", () => {
    expect(getEffectiveTransform(clip(), 1000)).toEqual(IDENTITY_TRANSFORM);
  });

  it("returns identity when keyframes is an empty array", () => {
    expect(
      getEffectiveTransform(clip({ keyframes: [] }), 1000),
    ).toEqual(IDENTITY_TRANSFORM);
  });

  it("with a single keyframe, returns its values constantly", () => {
    const c = clip({
      keyframes: [{ id: "kf1", time: 2000, x: 100, y: 50, scale: 1.5 }],
    });
    expect(getEffectiveTransform(c, 0)).toEqual({ x: 100, y: 50, scale: 1.5 });
    expect(getEffectiveTransform(c, 2000)).toEqual({ x: 100, y: 50, scale: 1.5 });
    expect(getEffectiveTransform(c, 4999)).toEqual({ x: 100, y: 50, scale: 1.5 });
  });

  it("before the first keyframe, holds the first's values", () => {
    const c = clip({
      keyframes: [
        { id: "kf1", time: 1000, x: 50, y: 0, scale: 1 },
        { id: "kf2", time: 3000, x: 200, y: 0, scale: 2 },
      ],
    });
    expect(getEffectiveTransform(c, 0)).toEqual({ x: 50, y: 0, scale: 1 });
    expect(getEffectiveTransform(c, 999)).toEqual({ x: 50, y: 0, scale: 1 });
  });

  it("after the last keyframe, holds the last's values", () => {
    const c = clip({
      keyframes: [
        { id: "kf1", time: 1000, x: 50, scale: 1 },
        { id: "kf2", time: 3000, x: 200, scale: 2 },
      ],
    });
    expect(getEffectiveTransform(c, 3000)).toEqual({ x: 200, y: 0, scale: 2 });
    expect(getEffectiveTransform(c, 4999)).toEqual({ x: 200, y: 0, scale: 2 });
  });

  it("interpolates linearly between two keyframes (midpoint)", () => {
    const c = clip({
      keyframes: [
        { id: "kf1", time: 1000, x: 0, y: 0, scale: 1 },
        { id: "kf2", time: 3000, x: 200, y: 100, scale: 2 },
      ],
    });
    // midpoint = 2000ms
    expect(getEffectiveTransform(c, 2000)).toEqual({ x: 100, y: 50, scale: 1.5 });
  });

  it("interpolates linearly at arbitrary fractions", () => {
    const c = clip({
      keyframes: [
        { id: "kf1", time: 0, x: 0, scale: 1 },
        { id: "kf2", time: 1000, x: 100, scale: 2 },
      ],
    });
    expect(getEffectiveTransform(c, 250)).toEqual({ x: 25, y: 0, scale: 1.25 });
    expect(getEffectiveTransform(c, 750)).toEqual({ x: 75, y: 0, scale: 1.75 });
  });

  it("treats omitted axes as identity for that keyframe", () => {
    // First keyframe pins only x; y and scale should be identity (0, 1)
    // and interpolate to the second's values.
    const c = clip({
      keyframes: [
        { id: "kf1", time: 0, x: 100 },
        { id: "kf2", time: 1000, x: 200, y: 50, scale: 1.5 },
      ],
    });
    expect(getEffectiveTransform(c, 0)).toEqual({ x: 100, y: 0, scale: 1 });
    expect(getEffectiveTransform(c, 1000)).toEqual({ x: 200, y: 50, scale: 1.5 });
    expect(getEffectiveTransform(c, 500)).toEqual({ x: 150, y: 25, scale: 1.25 });
  });

  it("at an exact keyframe time, returns that keyframe's values", () => {
    const c = clip({
      keyframes: [
        { id: "kf1", time: 1000, x: 50, scale: 1 },
        { id: "kf2", time: 3000, x: 200, scale: 2 },
        { id: "kf3", time: 5000, x: 300, scale: 3 },
      ],
    });
    expect(getEffectiveTransform(c, 3000)).toEqual({ x: 200, y: 0, scale: 2 });
  });

  it("handles three keyframes, picking the right bracketing pair", () => {
    const c = clip({
      keyframes: [
        { id: "kf1", time: 0, scale: 1 },
        { id: "kf2", time: 1000, scale: 2 },
        { id: "kf3", time: 2000, scale: 1 },
      ],
    });
    // Mid of pair (0, 1000) = scale 1.5
    expect(getEffectiveTransform(c, 500).scale).toBeCloseTo(1.5);
    // Mid of pair (1000, 2000) = scale 1.5
    expect(getEffectiveTransform(c, 1500).scale).toBeCloseTo(1.5);
    // Right at the middle keyframe
    expect(getEffectiveTransform(c, 1000).scale).toBe(2);
  });
});
