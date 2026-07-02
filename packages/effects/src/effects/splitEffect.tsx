/**
 * Default `splitClip` effect. A stick figure walks in from the right,
 * pauses at the cut point, "saws" for a beat, then walks off the
 * left. Timeline data has already mutated — this animation just
 * explains what happened. Runs entirely on CSS keyframes so we can
 * ship without a heavier animation library.
 *
 * Skipped (returns null) when:
 *   - result.ok !== true (nothing was actually split)
 *   - geometry couldn't be measured (headless, no timeline mounted)
 */
import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import type { EffectHandler } from "../types.js";
import { StickFigure } from "../characters/StickFigure.js";

const ENTER_MS = 600;
const CUT_MS = 500;
const EXIT_MS = 600;
const TOTAL_MS = ENTER_MS + CUT_MS + EXIT_MS;
const FIGURE_HALF = 24; // half of the 48px SVG

export const defaultSplitEffect: EffectHandler = (op, ctx, onComplete) => {
  if (op.kind !== "splitClip" || !op.result.ok) return null;
  const args = op.args as { clipId: string; timeMs: number };
  const cutX = ctx.timelineToScreenX(args.timeMs);
  const clipRect = ctx.clipToScreenRect(args.clipId);
  // clipRect will be for one of the two new clips post-mutation (same
  // id vanished). Fall back to the timeline's own vertical band.
  const timelineTop = clipRect?.top ?? ctx.timelineRect?.top ?? 0;
  const rowHeight = clipRect?.height ?? 56;
  if (cutX == null) return null;
  return (
    <SplitAnimation
      key={op.timestamp}
      x={cutX}
      top={timelineTop}
      height={rowHeight}
      onDone={onComplete}
    />
  );
};

function SplitAnimation({
  x,
  top,
  height,
  onDone,
}: {
  x: number;
  top: number;
  height: number;
  onDone: () => void;
}): ReactElement {
  // Vertical band spanning the timeline row — the cut line.
  const [phase, setPhase] = useState<"enter" | "cut" | "exit">("enter");
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("cut"), ENTER_MS);
    const t2 = setTimeout(() => setPhase("exit"), ENTER_MS + CUT_MS);
    const t3 = setTimeout(() => doneRef.current(), TOTAL_MS);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, []);

  // Figure animation: enter walks from right → x; cut phase static
  // over x; exit walks from x → left off-screen.
  const figureX = useMemo(() => {
    switch (phase) {
      case "enter":
        return x + 120; // start off to the right
      case "cut":
        return x; // parked at cut point
      case "exit":
        return x - 200; // walk left away
    }
  }, [phase, x]);

  const figureTransition =
    phase === "cut" ? "none" : `left ${ENTER_MS}ms ease-out`;
  const figureExitTransition =
    phase === "exit" ? `left ${EXIT_MS}ms ease-in` : figureTransition;
  const currentTransition =
    phase === "exit" ? figureExitTransition : figureTransition;

  return (
    <>
      {/* The saw line — appears during 'cut' phase */}
      {phase === "cut" ? (
        <div
          style={{
            position: "fixed",
            left: x,
            top,
            width: 2,
            height,
            background: "rgba(255, 220, 100, 0.9)",
            boxShadow: "0 0 12px 2px rgba(255, 220, 100, 0.7)",
            pointerEvents: "none",
            animation: "aicut-effect-saw-flash 500ms ease-out",
          }}
        />
      ) : null}
      {/* Stick figure — positioned so hands hover over the cut column */}
      <div
        style={{
          position: "fixed",
          // Anchor the figure by its horizontal center on the cut X.
          left: figureX - FIGURE_HALF,
          top: top - 56, // hover above the row
          transition: currentTransition,
          pointerEvents: "none",
          color: "rgba(255, 220, 100, 0.95)",
          filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.4))",
        }}
      >
        <StickFigure
          pose={phase === "cut" ? "cutting" : "walking"}
          facing={phase === "exit" ? "left" : "left"}
        />
      </div>
    </>
  );
}
