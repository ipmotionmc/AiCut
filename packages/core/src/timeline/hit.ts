import type { Project } from "../types.js";
import {
  HANDLE_PX,
  HEADER_WIDTH,
  RULER_HEIGHT,
  trackIndexAt,
  trackY,
  xToMs,
} from "./layout.js";

export type HitTarget =
  | { kind: "ruler" }
  | { kind: "header"; trackIndex: number }
  | { kind: "header-delete"; trackIndex: number }
  | { kind: "track-empty"; trackIndex: number }
  | { kind: "clip"; trackIndex: number; clipId: string }
  | { kind: "clip-handle-left"; trackIndex: number; clipId: string }
  | { kind: "clip-handle-right"; trackIndex: number; clipId: string }
  | { kind: "phantom-new-track" }
  | { kind: "outside" };

export interface HitContext {
  project: Project;
  pxPerSec: number;
  scrollLeft: number;
  showHeader: boolean;
  viewportWidth: number;
}

/**
 * Pixel → semantic target. Branches in roughly this order:
 *   1. Ruler band (top RULER_HEIGHT px) → scrub
 *   2. Header column (left HEADER_WIDTH px, when visible) → track header
 *   3. Track row contents → clip body / edge handle / empty space
 *
 * The handle-edge check is generous (HANDLE_PX) so users can grab a
 * trim handle even on a clip that's only a few px wide at low zoom.
 */
export function hitTest(x: number, y: number, ctx: HitContext): HitTarget {
  if (y < 0 || x < 0) return { kind: "outside" };

  if (ctx.showHeader && x < HEADER_WIDTH && y >= RULER_HEIGHT) {
    const ti = trackIndexAt(y, ctx.project.tracks.length);
    if (ti >= 0) {
      // Delete-track button — only active when the track is empty.
      // Non-empty tracks must be cleared (clip-by-clip) first; this
      // prevents the one-click "I just lost an hour of editing" foot-
      // gun while still letting users tidy up stray empty rows.
      const track = ctx.project.tracks[ti]!;
      if (track.clips.length === 0) {
        const btnSize = 18;
        const btnLeft = HEADER_WIDTH - btnSize - 6;
        const btnTop = RULER_HEIGHT + ti * 56 + (56 - btnSize) / 2;
        if (
          x >= btnLeft &&
          x <= btnLeft + btnSize &&
          y >= btnTop &&
          y <= btnTop + btnSize
        ) {
          return { kind: "header-delete", trackIndex: ti };
        }
      }
      return { kind: "header", trackIndex: ti };
    }
    return { kind: "outside" };
  }

  if (y < RULER_HEIGHT) return { kind: "ruler" };

  const ti = trackIndexAt(y, ctx.project.tracks.length);
  if (ti < 0) return { kind: "outside" };
  const track = ctx.project.tracks[ti]!;
  const ms = xToMs(x, ctx.pxPerSec, ctx.scrollLeft, ctx.showHeader);

  // Closest clip whose timeline range contains `ms`, or whose edge is
  // within HANDLE_PX of the cursor (so resize handles are grabbable
  // even slightly outside the clip body).
  for (const clip of track.clips) {
    const start = clip.start;
    const end = clip.start + (clip.out - clip.in);
    const startX = msToXLocal(start, ctx);
    const endX = msToXLocal(end, ctx);

    if (x >= startX - HANDLE_PX && x <= startX + HANDLE_PX) {
      return { kind: "clip-handle-left", trackIndex: ti, clipId: clip.id };
    }
    if (x >= endX - HANDLE_PX && x <= endX + HANDLE_PX) {
      return { kind: "clip-handle-right", trackIndex: ti, clipId: clip.id };
    }
    if (ms >= start && ms < end) {
      return { kind: "clip", trackIndex: ti, clipId: clip.id };
    }
  }
  return { kind: "track-empty", trackIndex: ti };
}

function msToXLocal(ms: number, ctx: HitContext): number {
  const base = ctx.showHeader ? HEADER_WIDTH : 0;
  return base + (ms / 1000) * ctx.pxPerSec - ctx.scrollLeft;
}
