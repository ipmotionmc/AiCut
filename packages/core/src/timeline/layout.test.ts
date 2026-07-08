import { describe, expect, it } from "vitest";
import {
  RULER_HEIGHT,
  TRACK_HEIGHT,
  trackIndexAt,
  trackRow,
  trackY,
} from "./layout.js";

describe("reversed track display order", () => {
  it("puts the top compositing layer (last track) on the top row", () => {
    // 3 tracks: index 2 = top layer = row 0, index 0 = main = bottom row.
    expect(trackRow(2, 3, false)).toBe(0);
    expect(trackRow(1, 3, false)).toBe(1);
    expect(trackRow(0, 3, false)).toBe(2);
    expect(trackY(2, 3)).toBe(RULER_HEIGHT);
    expect(trackY(0, 3)).toBe(RULER_HEIGHT + 2 * TRACK_HEIGHT);
  });

  it("shifts real tracks down one row while the phantom is visible", () => {
    expect(trackRow(2, 3, true)).toBe(1);
    expect(trackRow(0, 3, true)).toBe(3);
    // The phantom itself (index === trackCount) owns row 0.
    expect(trackRow(3, 3, true)).toBe(0);
    expect(trackY(3, 3, true)).toBe(RULER_HEIGHT);
  });

  it("trackIndexAt is the inverse of trackY", () => {
    for (const phantom of [false, true]) {
      for (let i = 0; i < 3; i++) {
        const y = trackY(i, 3, phantom) + TRACK_HEIGHT / 2;
        expect(trackIndexAt(y, 3, 0, phantom)).toBe(i);
      }
    }
  });

  it("maps the ruler, the phantom row, and space below the stack to -1", () => {
    expect(trackIndexAt(RULER_HEIGHT - 1, 3)).toBe(-1);
    // Phantom row (row 0 while dragging) is not a real track.
    expect(trackIndexAt(RULER_HEIGHT + 1, 3, 0, true)).toBe(-1);
    // Below the last row (track 0's row).
    expect(trackIndexAt(RULER_HEIGHT + 3 * TRACK_HEIGHT + 1, 3)).toBe(-1);
  });

  it("honours scrollTop", () => {
    const y = trackY(0, 3) + 4 - 30; // scrolled up by 30px
    expect(trackIndexAt(y, 3, 30)).toBe(0);
  });
});
