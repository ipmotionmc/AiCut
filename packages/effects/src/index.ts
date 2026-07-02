export { AiCutEffects, useOperationStream } from "./AiCutEffects.js";
export type { AiCutEffectsProps } from "./AiCutEffects.js";
export type {
  EffectContext,
  EffectHandler,
  EffectsMap,
  CharacterProps,
  CharacterPose,
} from "./types.js";
export { StickFigure } from "./characters/StickFigure.js";
export { defaultSplitEffect } from "./effects/splitEffect.js";
export { defaultMoveEffect } from "./effects/moveEffect.js";
export { buildEffectContext } from "./geometry.js";
// Inject the small CSS keyframes the shipped effects reference. Kept
// as an idempotent side-effect module so hosts can also opt out
// (e.g. `import { AiCutEffects } from "@aicut/effects/no-css"` in a
// future release) — for now importing anything from the package
// installs the keyframes on first import.
import "./effects.css";
