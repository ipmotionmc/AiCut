import { normalizeProject, projectDuration } from "../model.js";
import type { Clip, Ms, Project } from "../types.js";
import { ThumbnailRibbon } from "../ui/thumbnails.js";
import {
  drawAll,
  type DrawState,
  type DrawStyle,
} from "./draw.js";
import { hitTest, type HitTarget } from "./hit.js";
import {
  HEADER_WIDTH,
  RULER_HEIGHT,
  TRACK_HEIGHT,
  clampScale,
  findClip,
  snapTargets,
  totalHeight,
  wouldOverlap,
  xToMs,
} from "./layout.js";

/**
 * Public options for the standalone `Timeline` component. The class
 * is framework-agnostic — `@aicut/react` and `@aicut/vue` wrap it,
 * and the built-in `Editor` composes one internally for its timeline
 * panel. Reuse the same instance for a "frame-picker" use case by
 * loading a project with a single video clip and `readOnly: true`.
 */
export interface TimelineOptions {
  /** Host element. Will be wiped on init. */
  container: HTMLElement;
  project: Project;
  /** Pixels per second. Defaults to 80; auto-fits on mount when possible. */
  pxPerSec?: number;
  /** Initial playhead position. */
  time?: Ms;
  /** Initially selected clip. */
  selectedClipId?: string | null;
  /** Show the track-name header column (left). Default true. */
  showHeader?: boolean;
  /** Disable interactions — useful for read-only preview / frame picker. */
  readOnly?: boolean;
  /** Snap to clip edges + playhead when dragging. Default true. */
  snap?: boolean;
  /** Compute and apply fit-to-window on first project change. Default true. */
  autoFit?: boolean;

  onSeek?: (timeMs: Ms) => void;
  onSelectClip?: (clipId: string | null) => void;
  onScaleChange?: (pxPerSec: number) => void;
  onDeleteTrack?: (trackId: string) => void;
  onMoveClip?: (
    clipId: string,
    opts: { start?: Ms; trackId?: string; newTrack?: boolean },
  ) => void;
  onResizeClip?: (
    clipId: string,
    edits: Partial<Pick<Clip, "in" | "out" | "start">>,
  ) => void;
  onChange?: (project: Project) => void;

  /**
   * Lets the host predict where a drop will actually land — used to
   * keep the drag-ghost visual honest. The Editor wires this to its
   * smart routing (intended → source → other → new track), so the
   * ghost shows the real outcome rather than just the user's hover.
   *
   * Return `{ trackIndex }` for an existing track, or
   * `{ wouldCreateNew: true }` for the auto-split case.
   */
  resolveDrop?: (
    clipId: string,
    intent: { start: Ms; intendedTrackIndex: number },
  ) => { trackIndex: number; wouldCreateNew: boolean };
}

interface DragMove {
  kind: "move";
  clipId: string;
  trackIndex: number;
  pointerStartX: number;
  pointerStartY: number;
  originalStart: Ms;
}
interface DragTrim {
  kind: "trim-left" | "trim-right";
  clipId: string;
  trackIndex: number;
  pointerStartX: number;
  originalStart: Ms;
  originalIn: Ms;
  originalOut: Ms;
}
interface DragScrub {
  kind: "scrub";
}
type DragCtx = DragMove | DragTrim | DragScrub;

const SNAP_PX = 8;
const DEFAULT_SCALE = 80;
const WHEEL_ZOOM_RATE = 0.012;

/**
 * Canvas-rendered, framework-free timeline. Owns ruler, multi-track
 * layout, headers, frame-thumbnails, playhead, snap, and all pointer
 * gestures. No DOM children for clips/ticks/etc — every pixel is
 * painted via 2D canvas, so even hundreds of clips render in <2ms.
 */
export class Timeline {
  private root: HTMLElement;
  private opts: TimelineOptions;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private thumbs: ThumbnailRibbon;
  private hiddenHost: HTMLDivElement;

  private project: Project;
  private pxPerSec: number;
  private timeMs: Ms;
  private selectedClipId: string | null;
  private snapEnabled: boolean;
  private showHeader: boolean;
  private readOnly: boolean;
  private autoFitEnabled: boolean;

  private scrollLeft = 0;
  private viewportWidth = 0;
  private viewportHeight = 0;
  private hoveredClipId: string | null = null;
  private hoveredTrackIndex: number | null = null;
  private hoverCursor: string = "default";
  private dropTargetTrackIndex: number | null = null;
  private snapX: number | null = null;
  private drag: DragCtx | null = null;
  /**
   * In-flight ghost of the clip being dragged. Decoupled from the
   * project data so the data stays clean and undo-able only commits
   * on release. Has both the proposed `start` (X) and `trackIndex`
   * (Y), so the rendered ghost follows the cursor across tracks.
   */
  private dragGhost: {
    clipId: string;
    ghostStart: Ms;
    ghostTrackIndex: number;
    wouldOverlap: boolean;
  } | null = null;
  private rafPending = false;
  private hasAutoFitted = false;
  private resizeObs: ResizeObserver | null = null;
  private destroyed = false;

  static create(opts: TimelineOptions): Timeline {
    return new Timeline(opts);
  }

  constructor(opts: TimelineOptions) {
    this.opts = opts;
    this.root = opts.container;
    this.project = normalizeProject(opts.project);
    this.pxPerSec = clampScale(opts.pxPerSec ?? DEFAULT_SCALE);
    this.timeMs = opts.time ?? 0;
    this.selectedClipId = opts.selectedClipId ?? null;
    this.snapEnabled = opts.snap !== false;
    this.showHeader = opts.showHeader !== false;
    this.readOnly = opts.readOnly === true;
    this.autoFitEnabled = opts.autoFit !== false;

    this.root.classList.add("aicut-timeline-canvas");
    this.root.innerHTML = "";
    this.root.style.position = this.root.style.position || "relative";

    this.canvas = document.createElement("canvas");
    this.canvas.style.display = "block";
    this.canvas.style.width = "100%";
    this.canvas.style.height = "100%";
    this.canvas.style.touchAction = "none";
    // No data-testid on the canvas itself — both the editor's and a
    // standalone frame-picker timeline would collide. Tests select via
    // the host element instead (e.g. `[data-testid="aicut-timeline"] canvas`).
    this.root.appendChild(this.canvas);

    const ctx = this.canvas.getContext("2d");
    if (!ctx) throw new Error("2d context unavailable");
    this.ctx = ctx;

    // Off-screen <video> elements for thumbnail extraction live here.
    this.hiddenHost = document.createElement("div");
    this.hiddenHost.style.position = "absolute";
    this.hiddenHost.style.overflow = "hidden";
    this.hiddenHost.style.width = "0";
    this.hiddenHost.style.height = "0";
    this.hiddenHost.style.pointerEvents = "none";
    this.root.appendChild(this.hiddenHost);

    this.thumbs = new ThumbnailRibbon(this.hiddenHost, () =>
      this.scheduleRender(),
    );
    this.thumbs.syncSources(this.project.sources);

    this.attachPointer();
    this.attachWheel();
    this.attachResize();
    this.resizeCanvas();
    this.scheduleRender();
  }

  // ---- public API -----------------------------------------------------

  /**
   * Sync the project data. Does NOT reset the auto-fit latch — that's
   * what caused the editor-side zoom feedback loop: every Editor
   * mutation called `ui.render() → timeline.setProject()` which used
   * to reset auto-fit, refit on the next frame, emit a new scale,
   * which re-rendered… and round we went. Callers that genuinely
   * want a re-fit (e.g. when the host swaps to a brand-new project)
   * should call `refit()` explicitly.
   */
  setProject(p: Project): void {
    this.project = normalizeProject(p);
    this.thumbs.syncSources(this.project.sources);
    this.scheduleRender();
  }

  /** Force a re-fit on the next render. */
  refit(): void {
    if (!this.autoFitEnabled) return;
    this.hasAutoFitted = false;
    this.scheduleRender();
  }

  getProject(): Project {
    return JSON.parse(JSON.stringify(this.project)) as Project;
  }

  setTime(timeMs: Ms): void {
    this.timeMs = Math.max(0, timeMs);
    this.scheduleRender();
  }

  getTime(): Ms {
    return this.timeMs;
  }

  setScale(pxPerSec: number): void {
    const next = clampScale(pxPerSec);
    if (next === this.pxPerSec) return;
    this.pxPerSec = next;
    this.hasAutoFitted = true;
    this.scheduleRender();
  }

  getScale(): number {
    return this.pxPerSec;
  }

  setSelection(id: string | null): void {
    if (id === this.selectedClipId) return;
    this.selectedClipId = id;
    this.scheduleRender();
  }

  getSelection(): string | null {
    return this.selectedClipId;
  }

  setSnap(snap: boolean): void {
    this.snapEnabled = snap;
  }

  getSnap(): boolean {
    return this.snapEnabled;
  }

  /** Fit the project's full duration into the current viewport width. */
  fitToWindow(): void {
    const fit = this.computeFitScale();
    if (fit == null) return;
    this.pxPerSec = fit;
    this.hasAutoFitted = true;
    this.scrollLeft = 0;
    this.opts.onScaleChange?.(this.pxPerSec);
    this.scheduleRender();
  }

  /**
   * Test/debug introspection — pixel coordinates of every visible clip,
   * the playhead, and the headers. Because clips are canvas-painted
   * there are no DOM nodes to query in e2e; tests use this instead.
   * Exposed publicly so React/Vue wrappers can forward it to a ref.
   */
  getDebugInfo(): {
    pxPerSec: number;
    scrollLeft: number;
    viewportWidth: number;
    viewportHeight: number;
    playheadX: number;
    clips: Array<{
      id: string;
      trackIndex: number;
      x: number;
      width: number;
      y: number;
      height: number;
    }>;
  } {
    const baseX = this.showHeader ? HEADER_WIDTH : 0;
    const clips: Array<{
      id: string;
      trackIndex: number;
      x: number;
      width: number;
      y: number;
      height: number;
    }> = [];
    for (let ti = 0; ti < this.project.tracks.length; ti++) {
      const t = this.project.tracks[ti]!;
      for (const c of t.clips) {
        const x = baseX + (c.start / 1000) * this.pxPerSec - this.scrollLeft;
        const width = ((c.out - c.in) / 1000) * this.pxPerSec;
        const y = RULER_HEIGHT + ti * TRACK_HEIGHT + 6;
        clips.push({
          id: c.id,
          trackIndex: ti,
          x,
          width,
          y,
          height: TRACK_HEIGHT - 12,
        });
      }
    }
    return {
      pxPerSec: this.pxPerSec,
      scrollLeft: this.scrollLeft,
      viewportWidth: this.viewportWidth,
      viewportHeight: this.viewportHeight,
      playheadX:
        baseX + (this.timeMs / 1000) * this.pxPerSec - this.scrollLeft,
      clips,
    };
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.resizeObs?.disconnect();
    this.thumbs.destroy();
    this.root.innerHTML = "";
    this.root.classList.remove("aicut-timeline-canvas");
  }

  // ---- size / layout --------------------------------------------------

  private resizeCanvas(): void {
    const rect = this.root.getBoundingClientRect();
    this.viewportWidth = Math.max(1, Math.floor(rect.width));
    // Content-driven height: ruler + N tracks + one extra row reserved
    // for the "+ new track" phantom that appears during drag. Always
    // sized for it so the canvas doesn't grow/shrink mid-drag (which
    // would invalidate hit-test coords).
    const desired = totalHeight(this.project.tracks) + TRACK_HEIGHT;
    this.viewportHeight = Math.max(
      Math.floor(rect.height) || RULER_HEIGHT + TRACK_HEIGHT,
      desired,
    );
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.floor(this.viewportWidth * dpr);
    this.canvas.height = Math.floor(this.viewportHeight * dpr);
    this.canvas.style.height = `${this.viewportHeight}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  private computeFitScale(): number | null {
    const baseX = this.showHeader ? HEADER_WIDTH : 0;
    const w = this.viewportWidth - baseX - 24;
    const dur = projectDuration(this.project);
    if (w <= 0 || dur <= 0) return null;
    return clampScale(w / (dur / 1000));
  }

  private maxScrollLeft(): number {
    const dur = projectDuration(this.project);
    const baseX = this.showHeader ? HEADER_WIDTH : 0;
    const contentW = (dur / 1000) * this.pxPerSec;
    return Math.max(0, contentW - (this.viewportWidth - baseX) + 24);
  }

  private clampScroll(): void {
    this.scrollLeft = Math.max(0, Math.min(this.scrollLeft, this.maxScrollLeft()));
  }

  // ---- rendering ------------------------------------------------------

  private scheduleRender(): void {
    if (this.rafPending) return;
    this.rafPending = true;
    requestAnimationFrame(() => {
      this.rafPending = false;
      if (this.destroyed) return;
      this.maybeAutoFit();
      this.resizeCanvas();
      this.clampScroll();
      drawAll(
        this.ctx,
        this.buildDrawState(),
        this.readStyle(),
        this.thumbs,
      );
      this.canvas.style.cursor = this.hoverCursor;
    });
  }

  private maybeAutoFit(): void {
    if (!this.autoFitEnabled || this.hasAutoFitted) return;
    if (projectDuration(this.project) <= 0) return;
    const fit = this.computeFitScale();
    if (fit == null) return;
    this.hasAutoFitted = true;
    if (Math.abs(fit - this.pxPerSec) > 0.5) {
      this.pxPerSec = fit;
      this.opts.onScaleChange?.(fit);
    }
  }

  private buildDrawState(): DrawState {
    return {
      project: this.project,
      pxPerSec: this.pxPerSec,
      scrollLeft: this.scrollLeft,
      timeMs: this.timeMs,
      selectedClipId: this.selectedClipId,
      hoveredClipId: this.hoveredClipId,
      hoveredTrackIndex: this.hoveredTrackIndex,
      dropTargetTrackIndex: this.dropTargetTrackIndex,
      isDragging: this.drag?.kind === "move",
      snapX: this.snapX,
      showHeader: this.showHeader,
      viewportWidth: this.viewportWidth,
      viewportHeight: this.viewportHeight,
      dragGhost: this.dragGhost,
    };
  }

  private readStyle(): DrawStyle {
    const cs = getComputedStyle(this.root);
    const v = (name: string, fallback: string) =>
      cs.getPropertyValue(name).trim() || fallback;
    return {
      bg: v("--aicut-controls-bg", "#1f1f22"),
      border: v("--aicut-controls-border", "rgba(255,255,255,0.08)"),
      // Pass the resolved text color straight through — draw.ts'
      // withAlpha can adjust it for tick / muted variants.
      text: v("--aicut-controls-text", "rgba(255,255,255,0.85)"),
      textMuted: v("--color-muted", "#999999"),
      trackBg: "rgba(255,255,255,0.06)",
      brand: v("--color-brand", "#ff3386"),
      brandTo: v("--color-secondary", "#9a31f4"),
      info: v("--color-info", "#1077ff"),
      clipText: "#fff",
      selectedRing: v("--color-info", "#1077ff"),
      playhead: v("--color-brand", "#ff3386"),
    };
  }

  // ---- pointer / wheel ------------------------------------------------

  private attachPointer(): void {
    this.canvas.addEventListener("pointerdown", (e) => this.onPointerDown(e));
    this.canvas.addEventListener("pointermove", (e) => this.onPointerMove(e));
    this.canvas.addEventListener("pointerup", (e) => this.onPointerUp(e));
    this.canvas.addEventListener("pointercancel", (e) => this.onPointerUp(e));
    this.canvas.addEventListener("pointerleave", () => {
      if (!this.drag) {
        this.hoveredClipId = null;
        this.hoverCursor = "default";
        this.scheduleRender();
      }
    });
  }

  private onPointerDown(e: PointerEvent): void {
    const { x, y } = this.localCoords(e);
    const target = this.hitTarget(x, y);
    this.canvas.setPointerCapture(e.pointerId);

    // Read-only mode (e.g. frame-picker) — every click in the track
    // area becomes a seek. Drag = scrub. No selection / move / trim.
    if (this.readOnly) {
      if (
        target.kind === "ruler" ||
        target.kind === "clip" ||
        target.kind === "clip-handle-left" ||
        target.kind === "clip-handle-right" ||
        target.kind === "track-empty"
      ) {
        this.drag = { kind: "scrub" };
        const ms = this.applySnap(
          xToMs(x, this.pxPerSec, this.scrollLeft, this.showHeader),
          null,
        );
        this.timeMs = ms;
        this.opts.onSeek?.(ms);
        this.scheduleRender();
      }
      return;
    }

    if (target.kind === "header-delete") {
      const t = this.project.tracks[target.trackIndex];
      if (t) this.opts.onDeleteTrack?.(t.id);
      return;
    }

    if (target.kind === "header") return;

    if (target.kind === "ruler") {
      this.drag = { kind: "scrub" };
      const ms = this.applySnap(
        xToMs(x, this.pxPerSec, this.scrollLeft, this.showHeader),
        null,
      );
      this.timeMs = ms;
      this.opts.onSeek?.(ms);
      this.scheduleRender();
      return;
    }

    if (target.kind === "clip") {
      const found = findClip(this.project, target.clipId);
      if (!found) return;
      this.selectedClipId = target.clipId;
      this.opts.onSelectClip?.(target.clipId);
      this.drag = {
        kind: "move",
        clipId: target.clipId,
        trackIndex: target.trackIndex,
        pointerStartX: x,
        pointerStartY: y,
        originalStart: found.clip.start,
      };
      this.scheduleRender();
      return;
    }

    if (
      target.kind === "clip-handle-left" ||
      target.kind === "clip-handle-right"
    ) {
      const found = findClip(this.project, target.clipId);
      if (!found) return;
      this.selectedClipId = target.clipId;
      this.opts.onSelectClip?.(target.clipId);
      this.drag = {
        kind: target.kind === "clip-handle-left" ? "trim-left" : "trim-right",
        clipId: target.clipId,
        trackIndex: target.trackIndex,
        pointerStartX: x,
        originalStart: found.clip.start,
        originalIn: found.clip.in,
        originalOut: found.clip.out,
      };
      this.scheduleRender();
      return;
    }

    if (target.kind === "track-empty") {
      // Bare-track click = deselect + seek to clicked time.
      this.selectedClipId = null;
      this.opts.onSelectClip?.(null);
      const ms = this.applySnap(
        xToMs(x, this.pxPerSec, this.scrollLeft, this.showHeader),
        null,
      );
      this.timeMs = ms;
      this.opts.onSeek?.(ms);
      this.drag = { kind: "scrub" };
      this.scheduleRender();
      return;
    }
  }

  private onPointerMove(e: PointerEvent): void {
    const { x, y } = this.localCoords(e);

    if (!this.drag) {
      // Hover-only — update cursor + hoveredClipId + hoveredTrackIndex.
      const target = this.hitTarget(x, y);
      let nextHover: string | null = null;
      let nextHoverTrack: number | null = null;
      let cursor = "default";
      if (target.kind === "clip") {
        nextHover = target.clipId;
        nextHoverTrack = target.trackIndex;
        cursor = this.readOnly ? "pointer" : "grab";
      } else if (
        target.kind === "clip-handle-left" ||
        target.kind === "clip-handle-right"
      ) {
        nextHover = target.clipId;
        nextHoverTrack = target.trackIndex;
        cursor = "ew-resize";
      } else if (target.kind === "ruler") {
        cursor = "ew-resize";
      } else if (target.kind === "track-empty") {
        nextHoverTrack = target.trackIndex;
        cursor = "crosshair";
      } else if (target.kind === "header") {
        nextHoverTrack = target.trackIndex;
        cursor = "default";
      } else if (target.kind === "header-delete") {
        nextHoverTrack = target.trackIndex;
        cursor = "pointer";
      }
      if (
        nextHover !== this.hoveredClipId ||
        nextHoverTrack !== this.hoveredTrackIndex ||
        cursor !== this.hoverCursor
      ) {
        this.hoveredClipId = nextHover;
        this.hoveredTrackIndex = nextHoverTrack;
        this.hoverCursor = cursor;
        this.scheduleRender();
      }
      return;
    }

    if (this.drag.kind === "scrub") {
      const ms = this.applySnap(
        xToMs(x, this.pxPerSec, this.scrollLeft, this.showHeader),
        null,
      );
      this.timeMs = ms;
      this.opts.onSeek?.(ms);
      this.scheduleRender();
      return;
    }

    if (this.drag.kind === "move") {
      const dxPx = x - this.drag.pointerStartX;
      const dxMs = (dxPx / this.pxPerSec) * 1000;
      let nextStart = Math.max(0, this.drag.originalStart + dxMs);
      nextStart = this.applySnap(nextStart, this.drag.clipId);
      // Row under cursor — Y maps to existing track index, or to the
      // phantom "+ new track" row sitting one slot below the last
      // track (so users can intentionally drop into it).
      const tiRaw = this.trackIndexAtY(y);
      const phantomIdx = this.project.tracks.length;
      const phantomY = RULER_HEIGHT + phantomIdx * TRACK_HEIGHT;
      const onPhantom = y >= phantomY && y < phantomY + TRACK_HEIGHT;
      const intendedTrackIndex = onPhantom
        ? phantomIdx
        : tiRaw >= 0
          ? tiRaw
          : this.drag.trackIndex;

      // Defer to host's smart routing when not on phantom row.
      let ghostTrackIndex = intendedTrackIndex;
      let overlap = false;
      if (onPhantom) {
        ghostTrackIndex = phantomIdx;
        overlap = true; // visually treat as "new track" via warning ghost
      } else if (this.opts.resolveDrop) {
        const r = this.opts.resolveDrop(this.drag.clipId, {
          start: nextStart,
          intendedTrackIndex,
        });
        ghostTrackIndex = r.trackIndex;
        overlap = r.wouldCreateNew;
      } else {
        const found = findClip(this.project, this.drag.clipId);
        const dur = found ? found.clip.out - found.clip.in : 0;
        const targetTrack = this.project.tracks[intendedTrackIndex];
        overlap = targetTrack
          ? wouldOverlap(targetTrack, this.drag.clipId, nextStart, nextStart + dur)
          : false;
      }

      this.dragGhost = {
        clipId: this.drag.clipId,
        ghostStart: nextStart,
        ghostTrackIndex,
        wouldOverlap: overlap,
      };
      this.dropTargetTrackIndex =
        ghostTrackIndex !== this.drag.trackIndex ? ghostTrackIndex : null;
      this.scheduleRender();
      return;
    }

    if (this.drag.kind === "trim-left" || this.drag.kind === "trim-right") {
      const dxPx = x - this.drag.pointerStartX;
      const dxMs = (dxPx / this.pxPerSec) * 1000;
      const found = findClip(this.project, this.drag.clipId);
      if (!found) return;
      const c = found.clip;
      if (this.drag.kind === "trim-left") {
        // Move start + in by the same delta; clip's right edge stays put.
        let nextStart = Math.max(0, this.drag.originalStart + dxMs);
        nextStart = this.applySnap(nextStart, this.drag.clipId);
        const delta = nextStart - this.drag.originalStart;
        const nextIn = Math.max(
          0,
          Math.min(this.drag.originalIn + delta, this.drag.originalOut - 50),
        );
        const adjStart = this.drag.originalStart + (nextIn - this.drag.originalIn);
        c.in = nextIn;
        c.start = adjStart;
      } else {
        // trim-right — move out only.
        const nextOut = Math.max(
          this.drag.originalIn + 50,
          this.drag.originalOut + dxMs,
        );
        c.out = nextOut;
      }
      this.scheduleRender();
      return;
    }
  }

  private onPointerUp(_e: PointerEvent): void {
    if (!this.drag) return;
    const drag = this.drag;
    const ghost = this.dragGhost;
    this.drag = null;
    this.dragGhost = null;
    this.dropTargetTrackIndex = null;
    this.snapX = null;

    if (drag.kind === "move") {
      if (ghost) {
        const isPhantom = ghost.ghostTrackIndex >= this.project.tracks.length;
        const finalTrackId = isPhantom
          ? undefined
          : ghost.ghostTrackIndex !== drag.trackIndex
            ? this.project.tracks[ghost.ghostTrackIndex]?.id
            : undefined;
        this.opts.onMoveClip?.(drag.clipId, {
          start: ghost.ghostStart,
          trackId: finalTrackId,
          // Phantom row drop is the user explicitly asking for a new
          // track — bypass the editor's smart routing in that case
          // (which would otherwise route back to the source track and
          // make the gesture a no-op).
          newTrack: isPhantom,
        });
        this.opts.onChange?.(this.getProject());
      }
    } else if (drag.kind === "trim-left" || drag.kind === "trim-right") {
      const found = findClip(this.project, drag.clipId);
      if (found) {
        this.opts.onResizeClip?.(drag.clipId, {
          in: found.clip.in,
          out: found.clip.out,
          start: found.clip.start,
        });
        this.opts.onChange?.(this.getProject());
      }
    }
    this.scheduleRender();
  }

  private attachWheel(): void {
    this.canvas.addEventListener(
      "wheel",
      (e) => {
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          const rect = this.canvas.getBoundingClientRect();
          const cursorX = e.clientX - rect.left;
          const anchorMs = xToMs(
            cursorX,
            this.pxPerSec,
            this.scrollLeft,
            this.showHeader,
          );
          const dy = Math.max(-50, Math.min(50, e.deltaY));
          const factor = Math.exp(-dy * WHEEL_ZOOM_RATE);
          const next = clampScale(this.pxPerSec * factor);
          if (Math.abs(next - this.pxPerSec) < 0.01) return;
          this.pxPerSec = next;
          this.hasAutoFitted = true;
          // Re-anchor: keep the time under the cursor visually pinned.
          const baseX = this.showHeader ? HEADER_WIDTH : 0;
          this.scrollLeft =
            (anchorMs / 1000) * this.pxPerSec - (cursorX - baseX);
          this.clampScroll();
          this.opts.onScaleChange?.(this.pxPerSec);
          this.scheduleRender();
          return;
        }
        // Pan — trackpad horizontal swipe (deltaX) and regular wheel
        // (deltaY) both move the timeline horizontally. Vertical
        // scrolling is intentionally suppressed; tracks fit vertically.
        const dx = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
        if (dx === 0) return;
        e.preventDefault();
        this.scrollLeft += dx;
        this.clampScroll();
        this.scheduleRender();
      },
      { passive: false },
    );
  }

  private attachResize(): void {
    if (typeof ResizeObserver === "undefined") return;
    this.resizeObs = new ResizeObserver(() => {
      this.resizeCanvas();
      if (!this.hasAutoFitted && this.autoFitEnabled) {
        const fit = this.computeFitScale();
        if (fit != null) {
          this.pxPerSec = fit;
          this.opts.onScaleChange?.(fit);
        }
      }
      this.scheduleRender();
    });
    this.resizeObs.observe(this.root);
  }

  // ---- helpers --------------------------------------------------------

  private localCoords(e: PointerEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  private hitTarget(x: number, y: number): HitTarget {
    return hitTest(x, y, {
      project: this.project,
      pxPerSec: this.pxPerSec,
      scrollLeft: this.scrollLeft,
      showHeader: this.showHeader,
      viewportWidth: this.viewportWidth,
    });
  }

  private trackIndexAtY(y: number): number {
    if (y < RULER_HEIGHT) return -1;
    const idx = Math.floor((y - RULER_HEIGHT) / TRACK_HEIGHT);
    if (idx < 0 || idx >= this.project.tracks.length) return -1;
    return idx;
  }

  private applySnap(ms: Ms, ignoreClipId: string | null): Ms {
    if (!this.snapEnabled) {
      this.snapX = null;
      return ms;
    }
    const tolMs = Math.max(20, (SNAP_PX / this.pxPerSec) * 1000);
    const targets = snapTargets(this.project, this.timeMs, ignoreClipId);
    let best = ms;
    let bestDist = tolMs;
    for (const t of targets) {
      const d = Math.abs(t - ms);
      if (d < bestDist) {
        bestDist = d;
        best = t;
      }
    }
    if (best !== ms) {
      const baseX = this.showHeader ? HEADER_WIDTH : 0;
      this.snapX = baseX + (best / 1000) * this.pxPerSec - this.scrollLeft;
    } else {
      this.snapX = null;
    }
    return best;
  }
}

// Expose helpers from layout.ts via a deep import for consumers who
// want the px math without instantiating Timeline.
export { TRACK_HEIGHT, RULER_HEIGHT, HEADER_WIDTH } from "./layout.js";
