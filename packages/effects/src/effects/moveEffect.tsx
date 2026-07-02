/**
 * Default `moveClipTo` effect — silky bear-driven choreography.
 *
 * Design rationale — same as splitEffect's rewrite: no pose swaps, no
 * walk-cycle frame flipping (both read as stop-motion at the source),
 * and no parabolic arc (reads as gamey rather than professional-UI
 * smooth). Instead: a single bear-carry image (arms outstretched) is
 * translated in a flat ease-in-out curve from source to destination
 * with an intrinsic wobble driven by CSS keyframes.
 *
 * Choreography (~900ms total):
 *
 *   0ms      bear pops in at source with a spring, arms open
 *   0ms      ghost clip fades in above bear's arms
 *   0ms      source-position ring pulses outward (indicating "grab")
 *   ~160ms   bear + ghost hold for a beat (settled after spring)
 *   160ms→720ms
 *            bear + ghost translate to destination via a smooth
 *            ease-in-out cubic. Bear wobbles a few degrees during
 *            transit (keyframed, independent of translation) — reads
 *            as "carrying weight" without the choppy walk-cycle
 *            pose-flip the old effect used.
 *   ~720ms   destination-position ring pulses outward (indicating
 *            "drop")
 *   ~740ms   ghost drops into the destination row with a slight
 *            squash bounce
 *   ~800ms   bear floats up and fades
 *   900ms    everything cleaned up
 *
 * All motion runs on the compositor thread (transform / opacity only,
 * with `will-change` hints) so it stays 60fps under load.
 */
import {
  useEffect,
  useRef,
  useState,
  type ReactElement,
} from "react";
import type { EffectContext, EffectHandler } from "../types.js";
import { Bear } from "../characters/Bear.js";

const TOTAL_MS = 900;
const CARRY_START_MS = 160;
const CARRY_MS = 560;
const BEAR_SIZE = 100;
const GHOST_LIFT = 34; // px the ghost floats above the row baseline

export const defaultMoveEffect: EffectHandler = (op, ctx, onComplete) => {
  if (op.kind !== "moveClipTo" || !op.result.ok) return null;
  const args = op.args as { clipId: string };
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

/** Reconstruct the source clip's on-screen rect from the pre-mutation
 *  project snapshot. `clipToScreenRect` reads live DOM, which is
 *  post-mutation — we need the *before* position to spawn the bear
 *  where the clip used to live. */
function clipRectFromProject(
  project: import("@aicut/core").Project,
  clipId: string,
  ctx: EffectContext,
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
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  // `carryStarted` toggles the transform on the position-wrapper, which
  // owns the source→dest translation. Kept as state instead of a
  // setTimeout-driven className because React needs a re-render for
  // the transition to fire (initial `transform: translate3d(0,0,0)`,
  // then after mount `transform: translate3d(dx, dy, 0)`).
  const [carryStarted, setCarryStarted] = useState(false);
  useEffect(() => {
    const t1 = setTimeout(() => setCarryStarted(true), CARRY_START_MS);
    const t2 = setTimeout(() => doneRef.current(), TOTAL_MS);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  const srcCenterX = srcRect.left + srcRect.width / 2;
  const destCenterX = destRect.left + destRect.width / 2;
  const dx = destCenterX - srcCenterX;
  const dy = destRect.top - srcRect.top;

  // Base anchor — bear/ghost mounted at srcCenter, translated to dest
  // via CSS transition.
  const anchorX = srcCenterX;
  const anchorY = srcRect.top;

  const carryTranslate = carryStarted
    ? `translate3d(${dx}px, ${dy}px, 0)`
    : "translate3d(0, 0, 0)";
  const carryTransition = carryStarted
    ? `transform ${CARRY_MS}ms cubic-bezier(0.35, 0.05, 0.25, 1)`
    : "none";

  const ghostWidth = srcRect.width;
  const ghostHeight = srcRect.height * 0.55;

  return (
    <>
      {/* Source-position ring pulse — signals "grab". Placed at source
       *  center, animation starts on mount. */}
      <Ring x={srcCenterX} y={srcRect.top + srcRect.height / 2} delay={0} />
      {/* Destination-position ring pulse — signals "drop". Delayed
       *  until just before the bear arrives. */}
      <Ring
        x={destCenterX}
        y={destRect.top + destRect.height / 2}
        delay={CARRY_START_MS + CARRY_MS - 80}
      />
      {/* Position wrapper — owns the translation from source to
       *  destination. Everything inside inherits the translation. */}
      <div
        style={{
          position: "fixed",
          left: anchorX,
          top: anchorY,
          transform: carryTranslate,
          transition: carryTransition,
          pointerEvents: "none",
          willChange: "transform",
        }}
      >
        {/* Ghost clip — floats above the anchor point at GHOST_LIFT
         *  px, follows the wrapper's translation, wobbles via its own
         *  keyframe. */}
        <div
          style={{
            position: "absolute",
            left: -ghostWidth / 2,
            top: -GHOST_LIFT - ghostHeight,
            width: ghostWidth,
            height: ghostHeight,
            background:
              "linear-gradient(135deg, rgba(180,140,255,0.55) 0%, rgba(140,90,240,0.6) 100%)",
            border: "1.5px solid rgba(230, 210, 255, 0.85)",
            borderRadius: 6,
            boxShadow:
              "0 6px 18px rgba(120, 60, 220, 0.35), inset 0 1px 0 rgba(255,255,255,0.35)",
            animation: `aicut-effect-move-ghost ${TOTAL_MS}ms cubic-bezier(0.35, 0.05, 0.25, 1) forwards`,
            willChange: "transform, opacity",
          }}
        />
        {/* Bear character — anchored to the wrapper's origin (source
         *  clip top), transform pulls it up by 100% of its height so
         *  feet touch the row. */}
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            animation: `aicut-effect-move-bear ${TOTAL_MS}ms cubic-bezier(0.3, 0.9, 0.4, 1) forwards`,
            transformOrigin: "50% 100%",
            willChange: "transform, opacity",
          }}
        >
          <Bear pose="carry" size={BEAR_SIZE} />
        </div>
      </div>
    </>
  );
}

function Ring({
  x,
  y,
  delay,
}: {
  x: number;
  y: number;
  delay: number;
}): ReactElement {
  return (
    <div
      style={{
        position: "fixed",
        left: x,
        top: y,
        width: 60,
        height: 60,
        borderRadius: "50%",
        border: "2.5px solid rgba(200, 170, 255, 0.9)",
        boxShadow: "0 0 16px rgba(160, 110, 255, 0.55)",
        animation: `aicut-effect-move-ring 520ms cubic-bezier(0.25, 0.8, 0.35, 1) ${delay}ms forwards`,
        opacity: 0,
        pointerEvents: "none",
        willChange: "transform, opacity",
      }}
    />
  );
}
