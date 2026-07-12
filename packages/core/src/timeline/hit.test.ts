import { describe, expect, it } from "vitest";
import { hitTest, type HitContext } from "./hit.js";
import { RULER_HEIGHT, contentLeftX } from "./layout.js";
import type { Project } from "../types.js";

function project(): Project {
  return {
    version: 1,
    sources: [{ id: "s1", url: "blob:x", kind: "video" }],
    tracks: [
      {
        id: "t1",
        kind: "video",
        clips: [{ id: "c1", sourceId: "s1", in: 0, out: 1000, start: 0 }],
      },
    ],
  };
}

function ctx(resizable: boolean): HitContext {
  return {
    project: project(),
    pxPerSec: 100,
    scrollLeft: 0,
    scrollTop: 0,
    showHeader: false,
    viewportWidth: 800,
    viewportHeight: 300,
    isDragging: false,
    keyframesEnabled: false,
    resizable,
  };
}

describe("hitTest resizable gating", () => {
  // 1s clip at 100 px/s: left edge at contentLeftX, right edge +100px.
  const leftX = contentLeftX(false);
  const rightX = leftX + 100;
  const rowY = RULER_HEIGHT + 10;

  it("returns trim handles at clip edges when resizable", () => {
    expect(hitTest(leftX, rowY, ctx(true)).kind).toBe("clip-handle-left");
    expect(hitTest(rightX, rowY, ctx(true)).kind).toBe("clip-handle-right");
  });

  it("resolves edge hits to the clip body when not resizable", () => {
    expect(hitTest(leftX + 1, rowY, ctx(false)).kind).toBe("clip");
    expect(hitTest(rightX - 1, rowY, ctx(false)).kind).toBe("clip");
  });

  it("clip body hits are unaffected by the flag", () => {
    const midX = leftX + 50;
    expect(hitTest(midX, rowY, ctx(true)).kind).toBe("clip");
    expect(hitTest(midX, rowY, ctx(false)).kind).toBe("clip");
  });
});
