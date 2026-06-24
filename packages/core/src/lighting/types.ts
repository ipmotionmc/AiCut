import type { Theme } from "../types.js";
import type { Locale } from "../i18n.js";
import type { LightingLocale } from "./i18n.js";

/** One of the six canonical key-light directions plus a sentinel for free-drag. */
export type KeyPreset =
  | "left"
  | "right"
  | "top"
  | "bottom"
  | "front"
  | "back"
  | "custom";

/** Snapshot of every adjustable lighting parameter — what `onChange` emits. */
export interface LightingConfig {
  /** 0–1 multiplier. Snapped to 5 UI levels (0 / 0.25 / 0.5 / 0.75 / 1). */
  brightness: number;
  /** Hex RGB string, e.g. "#ffffff". */
  color: string;
  /**
   * Unit vector from the subject toward the light. `(0,0,1)` = light in
   * front of the subject, `(0,1,0)` = light directly overhead, etc.
   * Always renormalised on write.
   */
  keyDirection: { x: number; y: number; z: number };
  /** Which canonical direction the dot is closest to, or `"custom"`. */
  keyPreset: KeyPreset;
  /** Rim / contour light toggle. */
  rim: boolean;
}

export type LightingView = "perspective" | "front";

export interface LightingEditorOptions {
  /** Host element. Will be wiped on init. */
  container: HTMLElement;
  /**
   * Image URL or data URI shown on the in-sphere plane (the "subject"
   * being lit). Can be swapped at runtime via `setSubjectImage`.
   */
  subjectImageUrl?: string;
  /** Initial config — merges over the safe defaults below. */
  config?: Partial<LightingConfig>;
  /** Initial camera view. Default `"perspective"`. */
  view?: LightingView;
  /** Theme tokens — same shape as the video Editor's theme. */
  theme?: Theme;
  /** Locale overrides on top of English defaults (`localeEn` + `lightingLocaleEn`). */
  locale?: Partial<Locale & LightingLocale>;

  /** Fires on any config mutation (drag, slider, preset click, toggle). */
  onChange?: (cfg: LightingConfig) => void;
}

/** Safe, conservative defaults for first mount. */
export const DEFAULT_LIGHTING_CONFIG: LightingConfig = {
  brightness: 0.5,
  color: "#ffffff",
  keyDirection: { x: 0, y: 0, z: 1 },
  keyPreset: "front",
  rim: false,
};
