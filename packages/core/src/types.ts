/**
 * Milliseconds. All timing in the project is expressed as integer ms to
 * keep JSON serialization unambiguous (no frame-rate coupling in the
 * data model — the renderer can present time as frames if it wants).
 */
export type Ms = number;

export interface MediaSource {
  id: string;
  url: string;
  kind: "video" | "audio";
  /** Optional — probed lazily from the <video> element if absent. */
  duration?: Ms;
  name?: string;
}

export interface Clip {
  id: string;
  sourceId: string;
  /** Window into the source — `in` inclusive, `out` exclusive. */
  in: Ms;
  out: Ms;
  /** Position on the timeline. */
  start: Ms;
  /**
   * Playback rate. 1 = normal, 2 = 2× speed. Default 1.
   * Persisted in the project JSON so a host can restore exactly.
   */
  speed?: number;
  /**
   * Optional per-clip transform animation. Each keyframe pins x / y / scale
   * at a clip-local time (0 = clip's `in`); the canvas-based playback
   * engines linearly interpolate between adjacent keyframes when keyframe
   * mode is enabled on the Editor.
   *
   * Clip-local times mean keyframes follow when the clip is moved or
   * trimmed — no rewrite needed.
   *
   * Absent / empty array = identity transform; legacy projects behave
   * exactly as before. `normalizeProject` keeps the array sorted by `time`.
   */
  keyframes?: Keyframe[];
}

/**
 * One pinned state of a clip's transform at a moment in clip-local time.
 * Missing axis fields default to identity (x = 0, y = 0, scale = 1) when
 * interpolating — host code can persist sparse keyframes.
 */
export interface Keyframe {
  id: string;
  /** Clip-local time in ms. 0 = clip's `in`. Bounds: [0, clip.out - clip.in]. */
  time: Ms;
  /** Pixel translate along the preview's local X axis. Default 0. */
  x?: number;
  /** Pixel translate along the preview's local Y axis. Default 0. */
  y?: number;
  /** Multiplier on intrinsic frame size. Default 1. */
  scale?: number;
}

export interface Track {
  id: string;
  kind: "video" | "audio";
  /** Clips on this track. Must be kept sorted by `start` and non-overlapping. */
  clips: Clip[];
}

export interface Project {
  /** Schema version — bump when breaking the JSON shape. */
  version: 1;
  sources: MediaSource[];
  tracks: Track[];
}

/**
 * Subset of CSS variables the editor honors. Pass any custom values
 * via `Editor` options; everything is forwarded as `--aicut-*` on the
 * editor's root container, so a host can also override via plain CSS.
 */
export interface Theme {
  brand?: string;
  secondary?: string;
  surface?: string;
  dark?: string;
  muted?: string;
  card?: string;
  success?: string;
  warning?: string;
  info?: string;
  error?: string;
  /** Toolbar / ruler chrome. Background of the editor frame. */
  controlsBg?: string;
  controlsBorder?: string;
  controlsText?: string;
  controlsHover?: string;
  controlsActive?: string;
  /** Letterbox color around the preview video. Defaults to black. */
  previewBg?: string;
  radiusSm?: string;
  radiusMd?: string;
  radiusLg?: string;
}

/** Range on the timeline, used for visible-range / selection math. */
export interface TimeRange {
  start: Ms;
  end: Ms;
}
