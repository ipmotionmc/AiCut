import { bigFrameStepMs, frameStepMs } from "../model.js";
import type { Ms, Project } from "../types.js";

/**
 * Structural subset of `EditorApi` the shared hotkey map drives. Kept
 * as its own interface so the built-in `EditorUI` can bind through its
 * callback layer while headless hosts (React primitives, custom
 * shells) bind an `Editor` instance directly — both satisfy this shape.
 */
export interface HotkeyEditor {
  togglePlay(): void;
  split(): void;
  trimLeft(): void;
  trimRight(): void;
  undo(): void;
  redo(): void;
  seek(timeMs: Ms): void;
  removeClip(clipId: string): void;
  seekToSelectedClipEdge(edge: "start" | "end"): void;
  isClipEdgeNavEnabled(): boolean;
  getSelection(): string | null;
  getProject(): Project;
  getTime(): Ms;
  getDuration(): Ms;
}

/** Anything with keydown add/removeEventListener — `Document`,
 *  `HTMLElement`, `Window` all qualify. */
export interface HotkeyTarget {
  addEventListener(
    type: "keydown",
    listener: (e: KeyboardEvent) => void,
  ): void;
  removeEventListener(
    type: "keydown",
    listener: (e: KeyboardEvent) => void,
  ): void;
}

/**
 * THE editor keyboard map — one definition shared by the built-in
 * `EditorUI` (bound to its root element) and headless compositions
 * (bound to `document` via the React primitives' `hotkeys` option or a
 * host's own `bindEditorHotkeys(document, editor)` call):
 *
 *   Space          play / pause
 *   K              split at playhead
 *   Q / W          trim left / right edge to playhead
 *   I / O          jump to selected clip's start / end (when enabled)
 *   ← / →          step one frame (Shift = 10 frames)
 *   ⌘Z / Ctrl+Z    undo   (+Shift = redo)
 *   Delete / ⌫     remove the selected clip
 *
 * Keystrokes originating in text-entry elements (inputs, textareas,
 * selects, contenteditable) are ignored so typing never triggers
 * editing commands. Returns an unbind function.
 */
export function bindEditorHotkeys(
  target: HotkeyTarget,
  editor: HotkeyEditor,
): () => void {
  const onKeydown = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null;
    if (
      t &&
      (["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName) ||
        t.isContentEditable)
    ) {
      return;
    }
    if (e.code === "Space") {
      e.preventDefault();
      editor.togglePlay();
    } else if (e.code === "KeyK") {
      e.preventDefault();
      editor.split();
    } else if (e.code === "KeyQ") {
      e.preventDefault();
      editor.trimLeft();
    } else if (e.code === "KeyW") {
      e.preventDefault();
      editor.trimRight();
    } else if (e.code === "KeyI" && editor.isClipEdgeNavEnabled()) {
      e.preventDefault();
      editor.seekToSelectedClipEdge("start");
    } else if (e.code === "KeyO" && editor.isClipEdgeNavEnabled()) {
      e.preventDefault();
      editor.seekToSelectedClipEdge("end");
    } else if (e.code === "ArrowLeft" || e.code === "ArrowRight") {
      // Frame-stepping nav — matches Premiere / Final Cut / CapCut /
      // After Effects: ← / → = one frame, Shift+← / → = 10 frames.
      // Step size derived from Project.fps (defaults to 30 when
      // unset) so a 60 fps project nudges in half-frames relative
      // to a 30 fps one.
      e.preventDefault();
      const project = editor.getProject();
      const step = e.shiftKey ? bigFrameStepMs(project) : frameStepMs(project);
      const dir = e.code === "ArrowLeft" ? -1 : 1;
      const next = Math.max(
        0,
        Math.min(editor.getDuration(), editor.getTime() + dir * step),
      );
      editor.seek(next);
    } else if ((e.metaKey || e.ctrlKey) && e.code === "KeyZ") {
      e.preventDefault();
      if (e.shiftKey) editor.redo();
      else editor.undo();
    } else if (e.code === "Delete" || e.code === "Backspace") {
      const sel = editor.getSelection();
      if (sel) {
        e.preventDefault();
        editor.removeClip(sel);
      }
    }
  };
  target.addEventListener("keydown", onKeydown);
  return () => target.removeEventListener("keydown", onKeydown);
}
