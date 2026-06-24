import type { Ms, Project } from "../types.js";

/**
 * Construction context the Editor hands to a playback engine. The
 * engine mounts itself into `host` (typically the editor's preview
 * element) and owns whatever DOM / canvas / video elements it needs.
 */
export interface PlaybackEngineOptions {
  /** Mount point. Engine appends its preview surface here. */
  host: HTMLElement;
  /** Initial project — engine pre-warms sources, etc. */
  project: Project;
}

/**
 * The contract every preview engine satisfies. Editor talks ONLY
 * through this surface — implementations are interchangeable.
 *
 * Built-in implementations:
 *   - `HtmlVideoEngine`  default; one HTMLVideoElement per source,
 *                        swap on clip boundaries. Zero deps,
 *                        GPU-accelerated decode by the browser, but
 *                        seek snaps to keyframes (browser controls
 *                        the decode pipeline).
 *   - `WebCodecsEngine`  opt-in (v0.6+); manual VideoDecoder loop +
 *                        canvas blit. Frame-accurate seek; will
 *                        underpin multi-track compositing, transitions,
 *                        and shaders in later versions.
 *
 * Hosts can ship their own implementation (e.g., a WebGL compositor,
 * a WebRTC stream consumer, a desktop-wrapper IPC bridge) and inject
 * it via `Editor.create({ playbackEngine: myFactory })`.
 */
export interface PlaybackEngine {
  /** Replace the project. Engine re-warms sources + re-resolves the
   *  active clip for the current playhead. Idempotent. */
  setProject(next: Project): void;

  play(): void;
  pause(): void;
  isPlaying(): boolean;

  /** Current playhead (ms from project start). */
  getTime(): Ms;
  /** Move the playhead. Engine clamps to [0, totalDuration]. */
  seek(timeMs: Ms): void;

  /** Free all resources (DOM nodes, decoders, AudioContexts, rAF). */
  destroy(): void;

  /**
   * Optional. Return the screen-space CSS-pixel rectangle of the
   * actually-rendered frame within the engine's mount element. Used by
   * the keyframe editing overlay to draw the frame border + position
   * scale handles + translate pointer deltas to keyframe X / Y.
   *
   * Coords are relative to `opts.host` (top-left of the mount). The
   * returned rect already reflects the active keyframe transform — so
   * the overlay draws around the moved/scaled frame.
   *
   * Engines that can't compute this (or where it's meaningless — e.g.
   * an audio-only engine) return null. The editor falls back to a
   * no-op overlay; keyframe values can still be edited via the panel.
   */
  getFrameRect?(): { x: number; y: number; w: number; h: number } | null;

  // ---- Event hooks — set by the Editor after construction. Engines
  // call these when state changes. All optional; engines that can't
  // emit a particular event (e.g. no audio metadata) just never call
  // the corresponding hook. ----

  /** Fired on each rAF / decoded frame with the current playhead. */
  onTimeUpdate?: (ms: Ms) => void;
  /** Fired once when the project's end is reached during playback. */
  onEnded?: () => void;
  /** Decode / network / capability failures. */
  onError?: (err: Error) => void;
  /**
   * Fired the first time a fresh playback target is "ready to play"
   * — analogue of HTMLMediaElement's `loadedmetadata`. Editor uses
   * it to gate scaling / auto-fit work.
   */
  onReady?: () => void;
  /**
   * Fired when an individual source's duration becomes known. Editor
   * folds this into the project model so the timeline can size clips
   * correctly even when the host didn't ship a `duration` upfront.
   */
  onSourceMetadata?: (sourceId: string, durationMs: Ms) => void;
}

/**
 * A factory that builds an engine for a given mount/project. Hosts
 * pass one of these to `Editor.create({ playbackEngine })` to swap
 * implementations. The factory shape — rather than a class reference
 * — keeps Editor decoupled from constructor signatures and lets
 * factories close over host-side configuration (auth tokens, render
 * backend URL, custom shaders, etc.) without polluting the interface.
 */
export type PlaybackEngineFactory = (
  opts: PlaybackEngineOptions,
) => PlaybackEngine;
