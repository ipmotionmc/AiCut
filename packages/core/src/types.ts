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
