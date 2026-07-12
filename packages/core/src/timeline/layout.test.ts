import { describe, expect, it } from "vitest";
import {
  RULER_HEIGHT,
  TRACK_HEIGHT,
  contentHeight,
  trackIndexAt,
  trackY,
} from "./layout.js";

describe("array-order track display", () => {
  it("track 0 is on the first row, tracks grow downward", () => {
    expect(trackY(0)).toBe(RULER_HEIGHT);
    expect(trackY(1)).toBe(RULER_HEIGHT + TRACK_HEIGHT);
  });

  it("trackIndexAt is the inverse of trackY", () => {
    for (let i = 0; i < 3; i++) {
      const y = trackY(i) + TRACK_HEIGHT / 2;
      expect(trackIndexAt(y, 3, 0)).toBe(i);
    }
  });

  it("maps the ruler and space below to -1", () => {
    expect(trackIndexAt(RULER_HEIGHT - 1, 3)).toBe(-1);
    expect(trackIndexAt(RULER_HEIGHT + 3 * TRACK_HEIGHT + 1, 3)).toBe(-1);
  });

  it("honours scrollTop", () => {
    // Track 2 in content coords; scrolled down 30px so its visible y is lower.
    const visibleY = trackY(2) + 4 - 30;
    expect(trackIndexAt(visibleY, 3, 30)).toBe(2);
  });

  it("reserves extra row height during drags", () => {
    const tracks = [
      { id: "a", kind: "video" as const, clips: [] },
      { id: "b", kind: "video" as const, clips: [] },
    ];
    expect(contentHeight(tracks, false)).toBe(2 * TRACK_HEIGHT);
    expect(contentHeight(tracks, true)).toBe(3 * TRACK_HEIGHT);
  });
});
