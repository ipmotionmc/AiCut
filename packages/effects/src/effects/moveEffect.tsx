/**
 * Default `moveClipTo` effect. A stick figure hurries to the source
 * clip, lifts it overhead (a ghost rectangle follows the figure so
 * the "carrying" reads visually), walks along the timeline to the
 * destination, drops the ghost onto the new position, exits.
 *
 * Uses before/after project snapshots to work out the source rect
 * (already gone from `afterProject`) and the destination rect (only
 * present in `afterProject`).
 */
import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import type { EffectHandler } from "../types.js";
import { StickFigure } from "../characters/StickFigure.js";

const ENTER_MS = 400;
const LIFT_MS = 300;
const CARRY_MS = 700;
const DROP_MS = 300;
const EXIT_MS = 400;
const TOTAL_MS = ENTER_MS + LIFT_MS + CARRY_MS + DROP_MS + EXIT_MS;
const FIGURE_HALF = 24;

export const defaultMoveEffect: EffectHandler = (op, ctx, onComplete) => {
  if (op.kind !== "moveClipTo" || !op.result.ok) return null;
  const args = op.args as { clipId: string };

  // After move: destination rect. Before move: source rect (which
  // no longer exists in afterProject → look it up on the timeline
  // BEFORE the animation starts by using the pre-mutation project's
  // clip coords.
  const destRect = ctx.clipToScreenRect(args.clipId);
  const srcRect = clipRectFromProject(op.beforeProject, args.clipId, ctx);
  if (!destRect || !srcRect) return null;

  return (
    <MoveAnimation
      key={op.timestamp}
      srcRect={srcRect}
      destRect={destRect}
      onDone={onComplete}
    />
  );
};

/**
 * Compute a clip rect from an ARBITRARY project snapshot (not the
 * editor's live one). Used to look up where the clip WAS before the
 * mutation.
 *
 * Approach: reuse the geometry helpers' pxPerSec + header + track
 * height by measuring the current timeline root, but plug in the
 * clip's OLD start/duration/trackIndex from the pre-mutation project.
 */
function clipRectFromProject(
  project: import("@aicut/core").Project,
  clipId: string,
  ctx: import("../types.js").EffectContext,
): DOMRect | null {
  let found: { trackIndex: number; start: number; end: number } | null = null;
  project.tracks.forEach((t, ti) => {
    const c = t.clips.find((cc) => cc.id === clipId);
    if (c) found = { trackIndex: ti, start: c.start, end: c.start + (c.out - c.in) };
  });
  if (!found) return null;
  const timelineRect = ctx.timelineRect;
  if (!timelineRect) return null;
  const foundRow: { trackIndex: number; start: number; end: number } = found;
  // Derive x from timelineToScreenX; y from a proportional slice of
  // the current timeline rect. Track height is best-effort (matches
  // the geometry helper's fallback).
  const x0 = ctx.timelineToScreenX(foundRow.start) ?? timelineRect.left;
  const x1 = ctx.timelineToScreenX(foundRow.end) ?? timelineRect.left;
  const rulerH = 24;
  const trackH = 56;
  const y0 = timelineRect.top + rulerH + foundRow.trackIndex * trackH;
  return new DOMRect(x0, y0, x1 - x0, trackH);
}

function MoveAnimation({
  srcRect,
  destRect,
  onDone,
}: {
  srcRect: DOMRect;
  destRect: DOMRect;
  onDone: () => void;
}): ReactElement {
  const [phase, setPhase] = useState<
    "enter" | "lift" | "carry" | "drop" | "exit"
  >("enter");
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("lift"), ENTER_MS);
    const t2 = setTimeout(() => setPhase("carry"), ENTER_MS + LIFT_MS);
    const t3 = setTimeout(
      () => setPhase("drop"),
      ENTER_MS + LIFT_MS + CARRY_MS,
    );
    const t4 = setTimeout(
      () => setPhase("exit"),
      ENTER_MS + LIFT_MS + CARRY_MS + DROP_MS,
    );
    const t5 = setTimeout(() => doneRef.current(), TOTAL_MS);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
      clearTimeout(t5);
    };
  }, []);

  const srcCenter = srcRect.left + srcRect.width / 2;
  const destCenter = destRect.left + destRect.width / 2;

  const figureX = useMemo(() => {
    switch (phase) {
      case "enter":
        return srcCenter - 200; // start off to the left of source
      case "lift":
      case "carry":
        return phase === "lift" ? srcCenter : destCenter;
      case "drop":
        return destCenter;
      case "exit":
        return destCenter + 200; // walk right off
    }
  }, [phase, srcCenter, destCenter]);

  const figureY = phase === "carry" ? destRect.top : srcRect.top;

  const transition =
    phase === "carry"
      ? `left ${CARRY_MS}ms ease-in-out, top ${CARRY_MS}ms ease-in-out`
      : phase === "enter"
        ? `left ${ENTER_MS}ms ease-out`
        : phase === "exit"
          ? `left ${EXIT_MS}ms ease-in`
          : `left 200ms ease-out, top 200ms ease-out`;

  // Ghost clip rectangle — follows the figure during lift/carry/drop.
  const ghostVisible =
    phase === "lift" || phase === "carry" || phase === "drop";
  const ghostX = figureX - srcRect.width / 2;
  const ghostY = phase === "drop" ? destRect.top : figureY - 30;

  const pose =
    phase === "enter"
      ? "walking"
      : phase === "lift"
        ? "lifting"
        : phase === "carry"
          ? "carrying"
          : phase === "drop"
            ? "dropping"
            : "walking";

  return (
    <>
      {ghostVisible ? (
        <div
          style={{
            position: "fixed",
            left: ghostX,
            top: ghostY,
            width: srcRect.width,
            height: srcRect.height * 0.6,
            background: "rgba(154, 49, 244, 0.35)",
            border: "1.5px dashed rgba(255, 255, 255, 0.7)",
            borderRadius: 4,
            transition,
            pointerEvents: "none",
          }}
        />
      ) : null}
      <div
        style={{
          position: "fixed",
          left: figureX - FIGURE_HALF,
          top: figureY - 56,
          transition,
          pointerEvents: "none",
          color: "rgba(180, 140, 255, 0.95)",
          filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.4))",
        }}
      >
        <StickFigure
          pose={pose}
          facing={destCenter > srcCenter ? "right" : "left"}
        />
      </div>
    </>
  );
}
