import { describe, expect, it } from "vitest";
import {
  RULER_HEIGHT,
  TRACK_HEIGHT,
  contentHeight,
  trackIndexAt,
  trackRow,
  trackY,
} from "./layout.js";

describe("reversed track display order", () => {
  it("puts the top compositing layer (last track) on the top row", () => {
    // 3 tracks: index 2 = top layer = row 0, index 0 = main = bottom row.
    expect(trackRow(2, 3)).toBe(0);
    expect(trackRow(1, 3)).toBe(1);
    expect(trackRow(0, 3)).toBe(2);
    expect(trackY(2, 3)).toBe(RULER_HEIGHT);
    expect(trackY(0, 3)).toBe(RULER_HEIGHT + 2 * TRACK_HEIGHT);
  });

  it("trackIndexAt is the inverse of trackY", () => {
    for (let i = 0; i < 3; i++) {
      const y = trackY(i, 3) + TRACK_HEIGHT / 2;
      expect(trackIndexAt(y, 3, 0)).toBe(i);
    }
  });

  it("maps the ruler and the space below the stack to -1", () => {
    expect(trackIndexAt(RULER_HEIGHT - 1, 3)).toBe(-1);
    expect(trackIndexAt(RULER_HEIGHT + 3 * TRACK_HEIGHT + 1, 3)).toBe(-1);
  });

  it("honours scrollTop", () => {
    const y = trackY(0, 3) + 4 - 30; // scrolled down by 30px
    expect(trackIndexAt(y, 3, 30)).toBe(0);
  });

  it("reserves no extra row height during drags (strip is an overlay)", () => {
    const tracks = [
      { id: "a", kind: "video" as const, clips: [] },
      { id: "b", kind: "video" as const, clips: [] },
    ];
    expect(contentHeight(tracks)).toBe(2 * TRACK_HEIGHT);
  });
});
