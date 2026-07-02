/**
 * Minimum-viable stick figure. Pure SVG, no external animation
 * library — poses swap by re-drawing the limbs. Kept intentionally
 * crude so it reads as "intent placeholder" rather than "final art":
 * the point is to prove the effect layer works, and hosts will swap
 * this for a Lottie / Rive / hand-drawn character when they want the
 * "wow" moment.
 *
 * Sizes: ~48×48 CSS px at scale=1. Facing controlled by CSS transform
 * so any pose can flip left/right without duplicating path data.
 *
 * Poses implemented:
 *   idle     — arms down, standing
 *   walking  — one arm forward, one back, legs staggered
 *   cutting  — right arm raised with a "saw" line, small chop mark
 *   lifting  — both arms above head, "carrying" a rectangle overhead
 *   carrying — same overhead pose but static (mid-walk holds it)
 *   dropping — arms coming down, rectangle mid-fall
 *   waving   — one arm raised in a wave
 *
 * Anything not listed falls through to `idle`. Custom character
 * components can implement any subset — pose is a widened string
 * union so unknown values type-check fine.
 */
import type { ReactElement } from "react";
import type { CharacterProps } from "../types.js";

export function StickFigure({
  pose = "idle",
  facing = "right",
  scale = 1,
  color = "currentColor",
}: CharacterProps): ReactElement {
  const size = 48 * scale;
  // The pose functions return arm / accessory paths. Head + torso +
  // legs are shared so the base body is consistent across poses.
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      stroke={color}
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{
        transform: facing === "left" ? "scaleX(-1)" : undefined,
        transformOrigin: "center",
        display: "block",
      }}
    >
      {/* head */}
      <circle cx="24" cy="10" r="5" fill={color} />
      {/* torso */}
      <line x1="24" y1="15" x2="24" y2="30" />
      {/* legs — small idle stance; walking pose overrides via arms */}
      <line x1="24" y1="30" x2="19" y2="42" />
      <line x1="24" y1="30" x2="29" y2="42" />
      {renderArms(pose)}
      {renderAccessory(pose, color)}
    </svg>
  );
}

function renderArms(pose: string): ReactElement {
  switch (pose) {
    case "walking":
      // One arm forward (up 30°), one back (down 30°) — reads as motion.
      return (
        <>
          <line x1="24" y1="18" x2="32" y2="22" />
          <line x1="24" y1="18" x2="16" y2="26" />
        </>
      );
    case "cutting":
      // Right arm raised straight up holding the saw; left arm braces.
      return (
        <>
          <line x1="24" y1="18" x2="32" y2="8" />
          <line x1="24" y1="18" x2="18" y2="24" />
        </>
      );
    case "lifting":
    case "carrying":
      // Both arms overhead, hands together — like holding a box up.
      return (
        <>
          <line x1="24" y1="18" x2="20" y2="6" />
          <line x1="24" y1="18" x2="28" y2="6" />
        </>
      );
    case "dropping":
      // Arms coming down.
      return (
        <>
          <line x1="24" y1="18" x2="22" y2="12" />
          <line x1="24" y1="18" x2="26" y2="12" />
        </>
      );
    case "waving":
      // One arm raised in a wave, hand at top-right.
      return (
        <>
          <line x1="24" y1="18" x2="34" y2="10" />
          <line x1="24" y1="18" x2="18" y2="26" />
        </>
      );
    case "idle":
    default:
      return (
        <>
          <line x1="24" y1="18" x2="19" y2="28" />
          <line x1="24" y1="18" x2="29" y2="28" />
        </>
      );
  }
}

/** Small extras drawn near the figure — the "saw" for cutting, the
 *  "box" being carried, etc. Pure decoration, doesn't reflow the
 *  base body. */
function renderAccessory(pose: string, color: string): ReactElement | null {
  switch (pose) {
    case "cutting":
      return (
        <>
          {/* saw — angled bar with teeth */}
          <line x1="32" y1="8" x2="38" y2="2" strokeWidth={2} />
          <path
            d="M 33 7 L 34 6 M 34.5 5.5 L 35.5 4.5 M 36 4 L 37 3"
            strokeWidth={1.5}
          />
          {/* impact spark */}
          <path
            d="M 36 12 L 38 10 M 39 13 L 40.5 11.5"
            stroke={color}
            strokeWidth={1.5}
          />
        </>
      );
    case "lifting":
    case "carrying":
      // Box overhead.
      return (
        <rect
          x="18"
          y="0"
          width="12"
          height="6"
          rx="1"
          fill={color}
          opacity={0.6}
        />
      );
    case "dropping":
      return (
        <rect
          x="18"
          y="18"
          width="12"
          height="6"
          rx="1"
          fill={color}
          opacity={0.3}
        />
      );
    case "waving": {
      // One tiny motion arc near the raised hand.
      return (
        <path
          d="M 36 8 Q 38 6, 40 8"
          stroke={color}
          strokeWidth={1.5}
          fill="none"
        />
      );
    }
    default:
      return null;
  }
}
