import type { Editor } from "../editor.js";
import { getEffectiveTransform } from "../keyframes/index.js";
import type { Clip } from "../types.js";

/**
 * Direct-manipulation overlay on top of the preview area. When
 * keyframes mode is on AND the active engine exposes a frame rect,
 * paints a 1px dashed border around the OUTPUT frame (fixed) + four
 * corner handles attached to the CONTENT (moves with the transform).
 *
 * Pointer gestures all act on the SELECTED clip's three transform
 * properties (`panX`, `panY`, `scale`), routed through
 * `Editor.setValueAtPlayhead` — so a gesture either updates the
 * clip's static base (no animation track yet) or upserts a keyframe
 * at the playhead (when the prop is already animated).
 *
 *   - Drag inside the frame body            → setValueAtPlayhead(panX, panY)
 *   - Drag a corner handle (or pinch wheel) → setValueAtPlayhead(scale)
 *
 * Overlay element has `pointer-events: none` so non-keyframe clicks
 * pass through to whatever lives below; only the body + handles
 * capture clicks. Hidden via display: none when keyframe mode is off.
 */
export class KeyframeOverlay {
  private editor: Editor;
  private host: HTMLElement;
  readonly root: HTMLDivElement;
  private frameBody: HTMLDivElement;
  private handles: Record<"tl" | "tr" | "bl" | "br", HTMLDivElement>;
  private rafHandle: number | null = null;
  private destroyed = false;
  private drag:
    | {
        kind: "translate";
        clipId: string;
        pointerStartX: number;
        pointerStartY: number;
        startPanX: number;
        startPanY: number;
      }
    | {
        kind: "scale";
        clipId: string;
        centerX: number;
        centerY: number;
        startDistance: number;
        startScale: number;
      }
    | null = null;
  private capturedPointerId: number | null = null;

  constructor(host: HTMLElement, editor: Editor) {
    this.host = host;
    this.editor = editor;

    this.root = document.createElement("div");
    this.root.className = "aicut-keyframe-overlay";
    this.root.setAttribute("data-testid", "aicut-keyframe-overlay");
    this.root.style.display = "none";

    this.frameBody = document.createElement("div");
    this.frameBody.className = "aicut-keyframe-overlay__frame";
    this.frameBody.setAttribute("data-testid", "aicut-keyframe-frame");
    this.frameBody.addEventListener("pointerdown", (e) => this.onTransStart(e));
    // Pinch-to-zoom: macOS trackpads fire `wheel` events with
    // ctrlKey: true. We preventDefault the page zoom and reinterpret
    // as a scale change on the selected clip.
    this.frameBody.addEventListener(
      "wheel",
      (e) => this.onPinchScale(e),
      { passive: false },
    );
    this.root.appendChild(this.frameBody);

    this.handles = {
      tl: this.makeHandle("tl"),
      tr: this.makeHandle("tr"),
      bl: this.makeHandle("bl"),
      br: this.makeHandle("br"),
    };

    host.appendChild(this.root);
    this.startTick();
  }

  destroy(): void {
    this.destroyed = true;
    if (this.rafHandle != null) cancelAnimationFrame(this.rafHandle);
    this.root.remove();
  }

  // ---- frame body drag (translate) -------------------------------------

  private onTransStart(e: PointerEvent): void {
    if (e.button !== 0) return;
    const ctx = this.ensureSelectedClip();
    if (!ctx) return;
    e.preventDefault();
    e.stopPropagation();
    this.frameBody.setPointerCapture(e.pointerId);
    this.capturedPointerId = e.pointerId;
    this.drag = {
      kind: "translate",
      clipId: ctx.clip.id,
      pointerStartX: e.clientX,
      pointerStartY: e.clientY,
      startPanX: ctx.transform.panX,
      startPanY: ctx.transform.panY,
    };
    this.frameBody.addEventListener("pointermove", this.onPointerMove);
    this.frameBody.addEventListener("pointerup", this.onPointerUp);
    this.frameBody.addEventListener("pointercancel", this.onPointerUp);
  }

  // ---- pinch-to-scale --------------------------------------------------

  private onPinchScale(e: WheelEvent): void {
    if (!e.ctrlKey) return;
    const ctx = this.ensureSelectedClip();
    if (!ctx) return;
    e.preventDefault();
    e.stopPropagation();
    const step = Math.max(-50, Math.min(50, -e.deltaY));
    const factor = Math.exp(step * 0.01);
    const next = Math.max(
      0.05,
      Math.min(16, ctx.transform.scale * factor),
    );
    this.editor.setValueAtPlayhead(
      ctx.clip.id,
      "scale",
      Math.round(next * 100) / 100,
    );
  }

  // ---- corner-handle drag (scale) --------------------------------------

  private onScaleStart(corner: "tl" | "tr" | "bl" | "br", e: PointerEvent): void {
    if (e.button !== 0) return;
    const ctx = this.ensureSelectedClip();
    if (!ctx) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = this.editor.getActiveOutputFrameRect()
      ?? this.editor.getActiveFrameRect();
    if (!rect) return;
    const hostRect = this.host.getBoundingClientRect();
    const cx = hostRect.left + rect.x + rect.w / 2;
    const cy = hostRect.top + rect.y + rect.h / 2;
    const startDist = Math.hypot(e.clientX - cx, e.clientY - cy);
    if (startDist < 1) return;
    const target = this.handles[corner];
    target.setPointerCapture(e.pointerId);
    this.capturedPointerId = e.pointerId;
    this.drag = {
      kind: "scale",
      clipId: ctx.clip.id,
      centerX: cx,
      centerY: cy,
      startDistance: startDist,
      startScale: ctx.transform.scale,
    };
    target.addEventListener("pointermove", this.onPointerMove);
    target.addEventListener("pointerup", this.onPointerUp);
    target.addEventListener("pointercancel", this.onPointerUp);
  }

  private onPointerMove = (e: PointerEvent): void => {
    if (!this.drag) return;
    if (this.drag.kind === "translate") {
      const dx = e.clientX - this.drag.pointerStartX;
      const dy = e.clientY - this.drag.pointerStartY;
      const newPanX = Math.round(this.drag.startPanX + dx);
      const newPanY = Math.round(this.drag.startPanY + dy);
      this.editor.setValueAtPlayhead(this.drag.clipId, "panX", newPanX);
      this.editor.setValueAtPlayhead(this.drag.clipId, "panY", newPanY);
    } else {
      const dist = Math.hypot(
        e.clientX - this.drag.centerX,
        e.clientY - this.drag.centerY,
      );
      const ratio = dist / this.drag.startDistance;
      const next = Math.max(
        0.05,
        Math.min(16, this.drag.startScale * ratio),
      );
      this.editor.setValueAtPlayhead(
        this.drag.clipId,
        "scale",
        Math.round(next * 100) / 100,
      );
    }
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (!this.drag) return;
    const targetEl = e.currentTarget as HTMLElement | null;
    if (targetEl && this.capturedPointerId === e.pointerId) {
      try {
        targetEl.releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }
    }
    targetEl?.removeEventListener("pointermove", this.onPointerMove);
    targetEl?.removeEventListener("pointerup", this.onPointerUp);
    targetEl?.removeEventListener("pointercancel", this.onPointerUp);
    this.drag = null;
    this.capturedPointerId = null;
  };

  // ---- per-frame layout ------------------------------------------------

  private startTick(): void {
    const tick = () => {
      if (this.destroyed) return;
      this.layout();
      this.rafHandle = requestAnimationFrame(tick);
    };
    this.rafHandle = requestAnimationFrame(tick);
  }

  private layout(): void {
    const enabled = this.editor.isKeyframesEnabled();
    if (!enabled) {
      this.root.style.display = "none";
      return;
    }
    // Output rect = the FIXED stage where the video gets clipped.
    // The dashed border + body drag-target are anchored here.
    const outRect = this.editor.getActiveOutputFrameRect();
    // Content rect = where the video pixels currently land (after
    // transform). Scale handles attach to its corners so they visually
    // grow / shrink WITH the video.
    const contentRect = this.editor.getActiveFrameRect() ?? outRect;
    if (!outRect) {
      this.root.style.display = "none";
      return;
    }
    this.root.style.display = "block";
    Object.assign(this.frameBody.style, {
      left: `${outRect.x}px`,
      top: `${outRect.y}px`,
      width: `${outRect.w}px`,
      height: `${outRect.h}px`,
    });
    const halfHandle = 6;
    const r = contentRect ?? outRect;
    const fbLeft = r.x;
    const fbTop = r.y;
    const fbRight = r.x + r.w;
    const fbBottom = r.y + r.h;
    const place = (
      el: HTMLDivElement,
      cx: number,
      cy: number,
    ): void => {
      el.style.left = `${cx - halfHandle}px`;
      el.style.top = `${cy - halfHandle}px`;
    };
    place(this.handles.tl, fbLeft, fbTop);
    place(this.handles.tr, fbRight, fbTop);
    place(this.handles.bl, fbLeft, fbBottom);
    place(this.handles.br, fbRight, fbBottom);
  }

  // ---- helpers ---------------------------------------------------------

  private makeHandle(name: "tl" | "tr" | "bl" | "br"): HTMLDivElement {
    const el = document.createElement("div");
    el.className = `aicut-keyframe-overlay__handle aicut-keyframe-overlay__handle--${name}`;
    el.setAttribute("data-testid", `aicut-keyframe-handle-${name}`);
    el.addEventListener("pointerdown", (e) => this.onScaleStart(name, e));
    this.root.appendChild(el);
    return el;
  }

  /**
   * Resolve the currently selected clip + its current effective
   * transform (so drag baselines are correct). Returns null when no
   * clip is selected or the playhead isn't over it.
   */
  private ensureSelectedClip():
    | {
        clip: Clip;
        transform: { panX: number; panY: number; scale: number };
      }
    | null {
    const selectedClipId = this.editor.getSelection();
    if (!selectedClipId) return null;
    const project = this.editor.getProject();
    let clip: Clip | null = null;
    for (const t of project.tracks) {
      const c = t.clips.find((cl) => cl.id === selectedClipId);
      if (c) {
        clip = c;
        break;
      }
    }
    if (!clip) return null;
    const playheadLocal = this.editor.getTime() - clip.start;
    if (playheadLocal < 0 || playheadLocal > clip.out - clip.in) {
      return null;
    }
    const transform = getEffectiveTransform(clip, playheadLocal);
    return { clip, transform };
  }
}
