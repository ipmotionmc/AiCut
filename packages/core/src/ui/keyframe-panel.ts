import type { Editor } from "../editor.js";
import type { Clip, Keyframe } from "../types.js";

/**
 * Inline numeric panel for the currently selected keyframe. Floats on
 * the left edge of the preview area; only visible when keyframe mode
 * is on AND a keyframe is selected. Mounted by EditorUI.
 *
 * Inputs commit on blur / Enter so typing isn't laggy. Editing any
 * field updates the selected keyframe's values; the engine repaints
 * the preview transform on the next rAF.
 */
export class KeyframePanel {
  private editor: Editor;
  readonly root: HTMLDivElement;
  private xIn: HTMLInputElement;
  private yIn: HTMLInputElement;
  private scaleIn: HTMLInputElement;
  private timeLabel: HTMLSpanElement;
  private deleteBtn: HTMLButtonElement;
  /** Cached so we know when we have to re-sync inputs from the model. */
  private lastSyncKey = "";

  constructor(host: HTMLElement, editor: Editor) {
    this.editor = editor;

    this.root = document.createElement("div");
    this.root.className = "aicut-keyframe-panel";
    this.root.setAttribute("data-testid", "aicut-keyframe-panel");
    this.root.style.display = "none";
    this.root.addEventListener("pointerdown", (e) => e.stopPropagation());
    this.root.addEventListener("wheel", (e) => e.stopPropagation());

    const title = document.createElement("div");
    title.className = "aicut-keyframe-panel__title";
    title.textContent = "Keyframe";
    this.root.appendChild(title);

    this.timeLabel = document.createElement("span");
    this.timeLabel.className = "aicut-keyframe-panel__time";
    this.root.appendChild(this.timeLabel);

    this.xIn = this.makeRow("X", "kf-x", (v) => this.commit("x", v));
    this.yIn = this.makeRow("Y", "kf-y", (v) => this.commit("y", v));
    this.scaleIn = this.makeRow(
      "Scale",
      "kf-scale",
      (v) => this.commit("scale", v),
      0.05,
    );

    this.deleteBtn = document.createElement("button");
    this.deleteBtn.type = "button";
    this.deleteBtn.className = "aicut-keyframe-panel__delete";
    this.deleteBtn.setAttribute("data-testid", "aicut-keyframe-delete");
    this.deleteBtn.textContent = "Delete";
    this.deleteBtn.addEventListener("click", () => this.onDelete());
    this.root.appendChild(this.deleteBtn);

    host.appendChild(this.root);
  }

  destroy(): void {
    this.root.remove();
  }

  /** Re-read the editor's state and show / hide / refresh inputs. */
  render(): void {
    const enabled = this.editor.isKeyframesEnabled();
    const selected = this.editor.getSelectedKeyframe();
    if (!enabled || !selected) {
      this.root.style.display = "none";
      this.lastSyncKey = "";
      return;
    }
    const found = this.findKeyframe(selected.clipId, selected.keyframeId);
    if (!found) {
      this.root.style.display = "none";
      this.lastSyncKey = "";
      return;
    }
    const { kf } = found;
    this.root.style.display = "flex";
    const syncKey = `${kf.id}|${kf.time}|${kf.x ?? 0}|${kf.y ?? 0}|${
      kf.scale ?? 1
    }`;
    if (syncKey !== this.lastSyncKey) {
      this.lastSyncKey = syncKey;
      // Only overwrite an input the user isn't focused on, to keep
      // mid-typing values intact.
      if (document.activeElement !== this.xIn) {
        this.xIn.value = String(Math.round(kf.x ?? 0));
      }
      if (document.activeElement !== this.yIn) {
        this.yIn.value = String(Math.round(kf.y ?? 0));
      }
      if (document.activeElement !== this.scaleIn) {
        this.scaleIn.value = (kf.scale ?? 1).toFixed(2);
      }
      this.timeLabel.textContent = `at ${(kf.time / 1000).toFixed(2)}s`;
    }
  }

  // ---- internals ------------------------------------------------------

  private makeRow(
    label: string,
    testId: string,
    onCommit: (raw: string) => void,
    step = 1,
  ): HTMLInputElement {
    const row = document.createElement("div");
    row.className = "aicut-keyframe-panel__row";
    const lab = document.createElement("label");
    lab.textContent = label;
    const input = document.createElement("input");
    input.type = "number";
    input.step = String(step);
    input.setAttribute("data-testid", `aicut-${testId}`);
    input.addEventListener("blur", () => onCommit(input.value));
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") input.blur();
    });
    row.append(lab, input);
    this.root.appendChild(row);
    return input;
  }

  private commit(axis: "x" | "y" | "scale", raw: string): void {
    const num = Number(raw);
    if (!Number.isFinite(num)) return;
    const sel = this.editor.getSelectedKeyframe();
    if (!sel) return;
    this.editor.setKeyframeValues(sel.clipId, sel.keyframeId, { [axis]: num });
  }

  private onDelete(): void {
    const sel = this.editor.getSelectedKeyframe();
    if (!sel) return;
    this.editor.removeKeyframe(sel.clipId, sel.keyframeId);
  }

  private findKeyframe(
    clipId: string,
    kfId: string,
  ): { clip: Clip; kf: Keyframe } | null {
    const project = this.editor.getProject();
    for (const t of project.tracks) {
      const clip = t.clips.find((c) => c.id === clipId);
      if (!clip || !clip.keyframes) continue;
      const kf = clip.keyframes.find((k) => k.id === kfId);
      if (kf) return { clip, kf };
    }
    return null;
  }
}
