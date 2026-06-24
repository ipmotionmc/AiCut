import { getEffectiveTransform } from "../keyframes/index.js";
import type { Clip, Ms, Project } from "../types.js";
import type {
  PlaybackEngine,
  PlaybackEngineFactory,
  PlaybackEngineOptions,
} from "./types.js";

/**
 * Default preview engine — one hidden `<video>` per `MediaSource`,
 * "active" video shown for the current playhead. Tick loop drives a
 * single video track's playhead, advancing through clips end-to-end.
 * When the playhead crosses a clip boundary we pause the outgoing
 * video and resume the next at `clip.in`.
 *
 * Strengths: zero deps, browser-native decode (GPU when available),
 * works in every browser today.
 *
 * Limits: no multi-track compositing (one video visible at a time),
 * seek snaps to keyframes (browser controls the decode pipeline), no
 * transitions / shaders / filters. See `WebCodecsEngine` for the
 * frame-accurate path.
 */
export class HtmlVideoEngine implements PlaybackEngine {
  private host: HTMLElement;
  private mount: HTMLDivElement;
  private videos = new Map<string, HTMLVideoElement>();
  private project: Project;
  private currentClipId: string | null = null;
  private playing = false;
  private timeMs: Ms = 0;
  private rafHandle: number | null = null;
  private lastFrameTs = 0;
  /** Permanent low-rate rAF that pushes keyframe transform onto the
   *  active <video> element via CSS `transform`. One style write per
   *  frame on at most one element — negligible cost. */
  private transformRaf: number | null = null;

  /** Public event hooks — set by Editor. */
  onTimeUpdate?: (ms: Ms) => void;
  onEnded?: () => void;
  onError?: (err: Error) => void;
  onReady?: () => void;
  onSourceMetadata?: (sourceId: string, durationMs: Ms) => void;

  constructor(opts: PlaybackEngineOptions) {
    this.host = opts.host;
    this.project = opts.project;
    this.mount = document.createElement("div");
    this.mount.className = "aicut-preview";
    this.host.appendChild(this.mount);
    this.syncSources();
    this.startTransformLoop();
  }

  setProject(next: Project): void {
    this.project = next;
    this.syncSources();
    // Re-resolve the active clip for the current playhead across ALL
    // video tracks. If the clip we were on was removed, snap back to 0.
    const clip = this.clipAtTime(this.timeMs);
    if (!clip) {
      this.timeMs = 0;
      this.activate(null);
      this.onTimeUpdate?.(0);
    } else {
      this.activate(clip);
      this.seekVideoToClipOffset(clip, this.timeMs - clip.start);
    }
  }

  play(): void {
    if (this.playing) return;
    if (this.totalDuration() <= 0) return;
    let clip = this.clipAtTime(this.timeMs) ?? this.nextClipAfterTime(this.timeMs);
    if (!clip) return;
    if (this.timeMs < clip.start) this.timeMs = clip.start;
    this.activate(clip);
    this.seekVideoToClipOffset(clip, this.timeMs - clip.start);
    const v = this.videos.get(clip.sourceId);
    if (!v) return;
    void v.play().catch((err) => this.onError?.(err as Error));
    this.playing = true;
    this.startTickLoop();
  }

  pause(): void {
    if (!this.playing) return;
    this.playing = false;
    this.stopTickLoop();
    if (this.currentClipId) {
      const clip = this.clipById(this.currentClipId);
      if (clip) {
        const v = this.videos.get(clip.sourceId);
        v?.pause();
      }
    }
  }

  isPlaying(): boolean {
    return this.playing;
  }

  getTime(): Ms {
    return this.timeMs;
  }

  seek(timeMs: Ms): void {
    const total = this.totalDuration();
    if (total <= 0) {
      this.timeMs = 0;
      return;
    }
    const clamped = Math.max(0, Math.min(timeMs, total));
    this.timeMs = clamped;
    const clip = this.clipAtTime(clamped);
    if (clip) {
      this.activate(clip);
      this.seekVideoToClipOffset(clip, clamped - clip.start);
    } else {
      this.activate(null);
    }
    this.onTimeUpdate?.(clamped);
  }

  /**
   * Screen-space rect of the actually-rendered frame, in CSS pixels,
   * relative to the host element. Includes the active keyframe
   * transform (translate + scale) that the rAF loop applies to the
   * `<video>` element via CSS — so the overlay's frame border tracks
   * the video as the user drags it. Returns null when no clip is
   * active or the active video has no metadata yet.
   */
  getFrameRect(): { x: number; y: number; w: number; h: number } | null {
    const base = this.baseFrameRect();
    if (!base) return null;
    const clip = this.clipById(this.currentClipId!);
    if (!clip) return base;
    const t = getEffectiveTransform(clip, this.timeMs - clip.start);
    // Apply the same transform we put on the video element so the
    // overlay border / handles line up with the pixels the user sees.
    const cx = base.x + base.w / 2 + t.x;
    const cy = base.y + base.h / 2 + t.y;
    const w = base.w * t.scale;
    const h = base.h * t.scale;
    return { x: cx - w / 2, y: cy - h / 2, w, h };
  }

  /** Untransformed contain-letterbox rect. */
  private baseFrameRect():
    | { x: number; y: number; w: number; h: number }
    | null {
    if (!this.currentClipId) return null;
    const clip = this.clipById(this.currentClipId);
    if (!clip) return null;
    const v = this.videos.get(clip.sourceId);
    if (!v || v.videoWidth === 0 || v.videoHeight === 0) return null;
    const hostRect = this.host.getBoundingClientRect();
    const cw = hostRect.width;
    const ch = hostRect.height;
    if (cw === 0 || ch === 0) return null;
    const scale = Math.min(cw / v.videoWidth, ch / v.videoHeight);
    const w = v.videoWidth * scale;
    const h = v.videoHeight * scale;
    return { x: (cw - w) / 2, y: (ch - h) / 2, w, h };
  }

  /**
   * Push the active clip's keyframe transform onto the visible <video>
   * via CSS. Inactive videos get the identity transform so they stay
   * pristine. Cheap — one style write per visible video per rAF.
   */
  private startTransformLoop(): void {
    const tick = (): void => {
      this.applyTransforms();
      this.transformRaf = requestAnimationFrame(tick);
    };
    this.transformRaf = requestAnimationFrame(tick);
  }

  private applyTransforms(): void {
    const clip = this.currentClipId
      ? this.clipById(this.currentClipId)
      : null;
    if (clip) {
      const v = this.videos.get(clip.sourceId);
      if (v) {
        const t = getEffectiveTransform(clip, this.timeMs - clip.start);
        // Translate first, then scale (around the element's center
        // because of `transform-origin: 50% 50%` which is the CSS
        // default).
        v.style.transform = `translate(${t.x.toFixed(2)}px, ${t.y.toFixed(2)}px) scale(${t.scale.toFixed(4)})`;
      }
    }
    // Inactive videos: keep them at identity so an old transform from
    // a previous clip doesn't ghost through when we swap back to them.
    for (const [id, v] of this.videos) {
      if (clip && id === clip.sourceId) continue;
      if (v.style.transform) v.style.transform = "";
    }
  }

  destroy(): void {
    this.stopTickLoop();
    if (this.transformRaf != null) {
      cancelAnimationFrame(this.transformRaf);
      this.transformRaf = null;
    }
    for (const v of this.videos.values()) {
      v.pause();
      v.removeAttribute("src");
      v.load();
      v.remove();
    }
    this.videos.clear();
    this.mount.remove();
  }

  // --- internals -------------------------------------------------------

  private syncSources(): void {
    const wanted = new Set(this.project.sources.map((s) => s.id));
    for (const [id, v] of this.videos) {
      if (!wanted.has(id)) {
        v.pause();
        v.remove();
        this.videos.delete(id);
      }
    }
    for (const src of this.project.sources) {
      if (src.kind !== "video") continue;
      if (this.videos.has(src.id)) continue;
      const v = document.createElement("video");
      v.preload = "auto";
      // Intentionally no `crossOrigin` here. Setting it forces the
      // browser to require CORS headers on the source, which most
      // pre-existing video CDNs do not serve. Pure <video> playback
      // works fine cross-origin without it — we'll only need it once
      // the preview moves to a Canvas/WebGL compositor that has to
      // read pixels back. Hosts that need it can override post-mount.
      v.playsInline = true;
      v.muted = false;
      v.src = src.url;
      v.style.position = "absolute";
      v.style.inset = "0";
      v.style.width = "100%";
      v.style.height = "100%";
      v.style.objectFit = "contain";
      v.style.visibility = "hidden";
      const sourceId = src.id;
      v.addEventListener("error", () =>
        this.onError?.(new Error(`Failed to load ${src.url}`)),
      );
      v.addEventListener("loadedmetadata", () => {
        this.onReady?.();
        const durMs = Math.round(v.duration * 1000);
        if (Number.isFinite(durMs) && durMs > 0) {
          this.onSourceMetadata?.(sourceId, durMs);
        }
      });
      this.mount.appendChild(v);
      this.videos.set(src.id, v);
    }
  }

  private activate(clip: Clip | null): void {
    if (clip?.id === this.currentClipId) return;
    if (this.currentClipId) {
      const prev = this.clipById(this.currentClipId);
      if (prev) {
        const v = this.videos.get(prev.sourceId);
        if (v) {
          v.pause();
          v.style.visibility = "hidden";
        }
      }
    }
    this.currentClipId = clip ? clip.id : null;
    if (clip) {
      const v = this.videos.get(clip.sourceId);
      if (v) v.style.visibility = "visible";
    }
  }

  private seekVideoToClipOffset(clip: Clip, offsetMs: Ms): void {
    const v = this.videos.get(clip.sourceId);
    if (!v) return;
    const target = (clip.in + Math.max(0, offsetMs)) / 1000;
    if (Math.abs(v.currentTime - target) > 0.05) {
      v.currentTime = target;
    }
  }

  private clipById(id: string): Clip | null {
    for (const t of this.project.tracks) {
      for (const c of t.clips) if (c.id === id) return c;
    }
    return null;
  }

  /**
   * Find the clip whose timeline range contains `timeMs`, searching
   * across ALL video tracks. If multiple tracks have a clip at this
   * moment, the lowest-index track wins (matches the "Track 1 is
   * background" convention used in the auto-split UX — overlapping
   * placements would have created a new track on top, but here we
   * fall back to the underlying clip).
   */
  private clipAtTime(timeMs: Ms): Clip | null {
    for (const t of this.project.tracks) {
      if (t.kind !== "video") continue;
      for (const c of t.clips) {
        if (timeMs >= c.start && timeMs < c.start + (c.out - c.in)) return c;
      }
    }
    return null;
  }

  /** Earliest clip starting at-or-after `timeMs` across all video tracks. */
  private nextClipAfterTime(timeMs: Ms): Clip | null {
    let best: Clip | null = null;
    for (const t of this.project.tracks) {
      if (t.kind !== "video") continue;
      for (const c of t.clips) {
        if (c.start >= timeMs && (!best || c.start < best.start)) best = c;
      }
    }
    return best;
  }

  /** Max clip end across all video tracks. */
  private totalDuration(): Ms {
    let max = 0;
    for (const t of this.project.tracks) {
      if (t.kind !== "video") continue;
      for (const c of t.clips) {
        const e = c.start + (c.out - c.in);
        if (e > max) max = e;
      }
    }
    return max;
  }

  private startTickLoop(): void {
    this.lastFrameTs = performance.now();
    const tick = (now: number) => {
      if (!this.playing) return;
      const dtMs = now - this.lastFrameTs;
      this.lastFrameTs = now;
      this.advance(dtMs);
      this.rafHandle = requestAnimationFrame(tick);
    };
    this.rafHandle = requestAnimationFrame(tick);
  }

  private stopTickLoop(): void {
    if (this.rafHandle != null) {
      cancelAnimationFrame(this.rafHandle);
      this.rafHandle = null;
    }
  }

  private advance(dtMs: number): void {
    if (this.project.tracks.length === 0) return;
    this.timeMs += dtMs;
    const totalDur = this.totalDuration();
    if (this.timeMs >= totalDur) {
      this.timeMs = totalDur;
      this.onTimeUpdate?.(this.timeMs);
      this.pause();
      this.onEnded?.();
      return;
    }
    const clip = this.clipAtTime(this.timeMs);
    if (!clip) {
      // Gap — jump forward to the next clip on any track.
      const next = this.nextClipAfterTime(this.timeMs);
      if (next) {
        this.timeMs = next.start;
        this.activate(next);
        this.seekVideoToClipOffset(next, 0);
        const v = this.videos.get(next.sourceId);
        if (v) void v.play().catch((err) => this.onError?.(err as Error));
      } else {
        this.pause();
        this.onEnded?.();
        return;
      }
    } else if (clip.id !== this.currentClipId) {
      this.activate(clip);
      this.seekVideoToClipOffset(clip, this.timeMs - clip.start);
      const v = this.videos.get(clip.sourceId);
      if (v) void v.play().catch((err) => this.onError?.(err as Error));
    }
    this.onTimeUpdate?.(this.timeMs);
  }
}

/** Factory shorthand for `Editor.create({ playbackEngine })`. */
export const htmlVideoEngineFactory: PlaybackEngineFactory = (opts) =>
  new HtmlVideoEngine(opts);
