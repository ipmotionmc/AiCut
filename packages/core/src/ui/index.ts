import { clipDuration, findClipContaining, findTrackOfClip } from "../model.js";
import type { Editor } from "../editor.js";
import { Timeline } from "../timeline/index.js";
import type { Clip, Ms } from "../types.js";
import type { Locale } from "../i18n.js";
import { Toolbar, type ToolbarCallbacks } from "./toolbar.js";

/**
 * Callbacks the editor wires into the UI. The toolbar contributes the
 * top-bar buttons; the timeline contributes click/drag intents that
 * the editor turns into model mutations (with overlap → new-track
 * routing centralised in `Editor.moveClip`).
 */
export interface UICallbacks extends ToolbarCallbacks {
  onSeek: (timeMs: Ms) => void;
  onSelectClip: (clipId: string | null) => void;
  onDeleteClip: (clipId: string) => void;
  onMoveClip: (
    clipId: string,
    opts: { start?: Ms; trackId?: string; newTrack?: boolean },
  ) => void;
  onResizeClip: (
    clipId: string,
    edits: Partial<Pick<Clip, "in" | "out" | "start">>,
  ) => void;
}

/**
 * Composes the editor: preview host on top, toolbar middle, canvas
 * Timeline at the bottom. Single source of repaint via `render()`;
 * frequent `onTimeTick()` is the playback-fast path that only nudges
 * the playhead-related surfaces.
 */
export class EditorUI {
  private root: HTMLElement;
  private editor: Editor;
  private preview: HTMLDivElement;
  private fullscreenExitBtn: HTMLButtonElement;
  private toolbar: Toolbar;
  private timelineHost: HTMLDivElement;
  private timeline: Timeline;
  private fullscreen = false;
  private onDocKeydown: ((e: KeyboardEvent) => void) | null = null;

  constructor(root: HTMLElement, editor: Editor, cb: UICallbacks) {
    this.root = root;
    this.editor = editor;
    const locale = editor.getLocale();

    root.classList.add("aicut-root");
    root.innerHTML = "";

    this.preview = document.createElement("div");
    this.preview.className = "aicut-preview-host";
    this.preview.setAttribute("data-testid", "aicut-preview");
    root.appendChild(this.preview);

    this.fullscreenExitBtn = document.createElement("button");
    this.fullscreenExitBtn.type = "button";
    this.fullscreenExitBtn.className = "aicut-fullscreen-exit";
    this.fullscreenExitBtn.title = locale.exitFullscreenTitle;
    this.fullscreenExitBtn.setAttribute("data-testid", "aicut-fullscreen-exit");
    this.fullscreenExitBtn.textContent = locale.exitFullscreen;
    this.fullscreenExitBtn.addEventListener("click", () =>
      this.setFullscreen(false),
    );
    this.preview.appendChild(this.fullscreenExitBtn);

    this.toolbar = new Toolbar(root, cb, locale);

    this.timelineHost = document.createElement("div");
    this.timelineHost.className = "aicut-timeline";
    this.timelineHost.setAttribute("data-testid", "aicut-timeline");
    root.appendChild(this.timelineHost);

    this.timeline = Timeline.create({
      container: this.timelineHost,
      project: editor.getProject(),
      pxPerSec: editor.getScale(),
      time: editor.getTime(),
      selectedClipId: editor.getSelection(),
      snap: editor.getSnap(),
      autoFit: true,
      locale,
      onSeek: cb.onSeek,
      onSelectClip: cb.onSelectClip,
      onMoveClip: cb.onMoveClip,
      onResizeClip: cb.onResizeClip,
      onScaleChange: cb.onScaleChange,
      onDeleteTrack: (trackId) => editor.removeTrack(trackId),
      // Mirror the editor's smart routing into the drag preview so
      // the ghost lands on the same row the commit will pick.
      resolveDrop: (clipId, intent) => {
        const proj = editor.getProject();
        const intendedTrack = proj.tracks[intent.intendedTrackIndex];
        const pred = editor.previewMoveTarget(
          clipId,
          intent.start,
          intendedTrack?.id,
        );
        if (!pred) {
          return {
            trackIndex: intent.intendedTrackIndex,
            wouldCreateNew: false,
          };
        }
        return {
          trackIndex: pred.trackIndex,
          wouldCreateNew: pred.wouldCreateNew,
        };
      },
    });

    this.attachKeyboard(cb);
  }

  // ---- fullscreen -----------------------------------------------------

  isFullscreen(): boolean {
    return this.fullscreen;
  }

  toggleFullscreen(): void {
    this.setFullscreen(!this.fullscreen);
  }

  setFullscreen(on: boolean): void {
    if (on === this.fullscreen) return;
    this.fullscreen = on;
    this.root.classList.toggle("aicut-fullscreen", on);
    if (on) {
      this.onDocKeydown = (e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          this.setFullscreen(false);
        }
      };
      document.addEventListener("keydown", this.onDocKeydown);
    } else if (this.onDocKeydown) {
      document.removeEventListener("keydown", this.onDocKeydown);
      this.onDocKeydown = null;
    }
  }

  get previewHost(): HTMLElement {
    return this.preview;
  }

  /** Host-extensible slot at the very left of the top toolbar. */
  get toolbarLeft(): HTMLElement {
    return this.toolbar.extrasLeft;
  }

  /** Host-extensible slot at the very right of the top toolbar. */
  get toolbarRight(): HTMLElement {
    return this.toolbar.extrasRight;
  }

  /** Public for e2e — read-back of timeline canvas state (no DOM clips). */
  getTimelineDebug(): ReturnType<Timeline["getDebugInfo"]> {
    return this.timeline.getDebugInfo();
  }

  /** Full sync from editor state. Idempotent. */
  render(): void {
    const project = this.editor.getProject();
    const time = this.editor.getTime();
    const duration = this.editor.getDuration();
    const selectedClipId = this.editor.getSelection();
    const pxPerSec = this.editor.getScale();
    const snap = this.editor.getSnap();

    this.toolbar.render({
      playing: this.editor.isPlaying(),
      time,
      duration,
      canUndo: this.editor.canUndo(),
      canRedo: this.editor.canRedo(),
      canSplit: this.canSplitAt(time),
      canTrim: this.canTrimAt(time, selectedClipId),
      snap,
      pxPerSec,
    });

    this.timeline.setProject(project);
    this.timeline.setTime(time);
    this.timeline.setScale(pxPerSec);
    this.timeline.setSelection(selectedClipId);
    this.timeline.setSnap(snap);
  }

  /** Playback-fast path: nudge playhead + toolbar time label only. */
  onTimeTick(timeMs: Ms): void {
    this.timeline.setTime(timeMs);
    this.toolbar.render({
      playing: this.editor.isPlaying(),
      time: timeMs,
      duration: this.editor.getDuration(),
      canUndo: this.editor.canUndo(),
      canRedo: this.editor.canRedo(),
      canSplit: this.canSplitAt(timeMs),
      canTrim: this.canTrimAt(timeMs, this.editor.getSelection()),
      snap: this.editor.getSnap(),
      pxPerSec: this.editor.getScale(),
    });
  }

  /** Explicit re-fit — Editor calls this when a brand-new project replaces the current one. */
  resetAutoFit(): void {
    this.timeline.refit();
  }

  setLocale(locale: Locale): void {
    this.toolbar.setLocale(locale);
    this.fullscreenExitBtn.title = locale.exitFullscreenTitle;
    this.fullscreenExitBtn.textContent = locale.exitFullscreen;
    this.timeline.setLocale(locale);
    this.render();
  }

  destroy(): void {
    if (this.onDocKeydown) {
      document.removeEventListener("keydown", this.onDocKeydown);
      this.onDocKeydown = null;
    }
    this.toolbar.destroy();
    this.timeline.destroy();
    this.root.innerHTML = "";
    this.root.classList.remove("aicut-root", "aicut-fullscreen");
  }

  // ---- helpers --------------------------------------------------------

  private canSplitAt(timeMs: Ms): boolean {
    const project = this.editor.getProject();
    for (const t of project.tracks) {
      for (const c of t.clips) {
        if (timeMs > c.start && timeMs < c.start + clipDuration(c)) return true;
      }
    }
    return false;
  }

  private canTrimAt(timeMs: Ms, selectedClipId: string | null): boolean {
    const project = this.editor.getProject();
    if (selectedClipId) {
      const trk = findTrackOfClip(project, selectedClipId);
      const cl = trk?.clips.find((c: Clip) => c.id === selectedClipId);
      if (cl && timeMs > cl.start && timeMs < cl.start + clipDuration(cl)) {
        return true;
      }
    }
    for (const t of project.tracks) {
      const cl = findClipContaining(t, timeMs);
      if (cl) return true;
    }
    return false;
  }

  private attachKeyboard(cb: UICallbacks): void {
    this.root.tabIndex = 0;
    this.root.addEventListener("keydown", (e) => {
      const target = e.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA"].includes(target.tagName)) return;
      if (e.code === "Space") {
        e.preventDefault();
        cb.onPlayToggle();
      } else if (e.code === "KeyK") {
        e.preventDefault();
        cb.onSplit();
      } else if (e.code === "KeyQ") {
        e.preventDefault();
        cb.onTrimLeft();
      } else if (e.code === "KeyW") {
        e.preventDefault();
        cb.onTrimRight();
      } else if ((e.metaKey || e.ctrlKey) && e.code === "KeyZ") {
        e.preventDefault();
        if (e.shiftKey) cb.onRedo();
        else cb.onUndo();
      } else if (e.code === "Delete" || e.code === "Backspace") {
        const sel = this.editor.getSelection();
        if (sel) {
          e.preventDefault();
          cb.onDeleteClip(sel);
        }
      }
    });
  }
}
