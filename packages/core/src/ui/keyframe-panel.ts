import type { Editor } from "../editor.js";
import {
  getEffectiveTransform,
  hasKeyframesForProp,
} from "../keyframes/index.js";
import type { Clip, KeyframeProp } from "../types.js";

/**
 * Floating numeric panel anchored to the preview's top-left corner.
 * Shown whenever keyframe mode is on AND a clip is selected — the
 * three inputs (panX, panY, scale) drive the currently-effective
 * transform via `Editor.setValueAtPlayhead`. Each prop is
 * independent: if it has keyframes, edits land as upserted keyframes
 * at the playhead; otherwise the clip's static base updates.
 *
 * Selected keyframe state still drives the highlight, but unlike v3
 * the panel doesn't require a selected keyframe to be visible —
 * matches the reference (Figma-style) UX where you just see the
 * current values and the "K" affordance turns them into an animation.
 */
export class KeyframePanel {
  private editor: Editor;
  readonly root: HTMLDivElement;
  private inputs: Record<KeyframeProp, HTMLInputElement>;
  private kfBadges: Record<KeyframeProp, HTMLSpanElement>;
  private clipLabel: HTMLSpanElement;
  /** Cached so we know when to re-sync inputs from the model. */
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
    title.textContent = "Transform";
    this.root.appendChild(title);

    this.clipLabel = document.createElement("span");
    this.clipLabel.className = "aicut-keyframe-panel__time";
    this.root.appendChild(this.clipLabel);

    this.inputs = {
      panX: this.makeRow("X", "kf-x", "panX", 1),
      panY: this.makeRow("Y", "kf-y", "panY", 1),
      scale: this.makeRow("Scale", "kf-scale", "scale", 0.05),
    };
    this.kfBadges = {
      panX: this.makeBadge(this.inputs.panX),
      panY: this.makeBadge(this.inputs.panY),
      scale: this.makeBadge(this.inputs.scale),
    };

    host.appendChild(this.root);
  }

  destroy(): void {
    this.root.remove();
  }

  /** Re-read the editor's state and show / hide / refresh inputs. */
  render(): void {
    const enabled = this.editor.isKeyframesEnabled();
    const selectedClipId = this.editor.getSelection();
    const clip = selectedClipId ? this.findClip(selectedClipId) : null;
    if (!enabled || !clip) {
      this.root.style.display = "none";
      this.lastSyncKey = "";
      return;
    }
    const playheadLocal = this.editor.getTime() - clip.start;
    if (playheadLocal < 0 || playheadLocal > clip.out - clip.in) {
      this.root.style.display = "none";
      return;
    }
    const t = getEffectiveTransform(clip, playheadLocal);
    const kfMask = (["panX", "panY", "scale"] as const)
      .map((p) => (hasKeyframesForProp(clip, p) ? "1" : "0"))
      .join("");
    const syncKey = `${clip.id}|${t.panX.toFixed(2)}|${t.panY.toFixed(2)}|${t.scale.toFixed(4)}|${kfMask}`;
    this.root.style.display = "flex";
    if (syncKey === this.lastSyncKey) return;
    this.lastSyncKey = syncKey;
    this.setIfBlur(this.inputs.panX, String(Math.round(t.panX)));
    this.setIfBlur(this.inputs.panY, String(Math.round(t.panY)));
    this.setIfBlur(this.inputs.scale, t.scale.toFixed(2));
    this.clipLabel.textContent = `${(playheadLocal / 1000).toFixed(2)}s`;
    // Visual cue: the small dot next to each input shows whether
    // that prop is animated (filled = keyframes exist) or just static
    // (outlined).
    for (const p of ["panX", "panY", "scale"] as const) {
      const animated = hasKeyframesForProp(clip, p);
      this.kfBadges[p].classList.toggle(
        "aicut-keyframe-panel__badge--on",
        animated,
      );
      this.kfBadges[p].title = animated ? "Animated" : "Static value";
    }
  }

  // ---- internals ------------------------------------------------------

  private makeRow(
    label: string,
    testId: string,
    prop: KeyframeProp,
    step: number,
  ): HTMLInputElement {
    const row = document.createElement("div");
    row.className = "aicut-keyframe-panel__row";
    const lab = document.createElement("label");
    lab.textContent = label;
    const input = document.createElement("input");
    input.type = "number";
    input.step = String(step);
    input.setAttribute("data-testid", `aicut-${testId}`);
    input.addEventListener("blur", () => this.commit(prop, input.value));
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") input.blur();
    });
    row.append(lab, input);
    this.root.appendChild(row);
    return input;
  }

  private makeBadge(input: HTMLInputElement): HTMLSpanElement {
    const dot = document.createElement("span");
    dot.className = "aicut-keyframe-panel__badge";
    input.parentElement?.appendChild(dot);
    return dot;
  }

  private commit(prop: KeyframeProp, raw: string): void {
    const num = Number(raw);
    if (!Number.isFinite(num)) return;
    const clipId = this.editor.getSelection();
    if (!clipId) return;
    this.editor.setValueAtPlayhead(clipId, prop, num);
  }

  private setIfBlur(input: HTMLInputElement, value: string): void {
    if (document.activeElement === input) return;
    if (input.value !== value) input.value = value;
  }

  private findClip(clipId: string): Clip | null {
    const project = this.editor.getProject();
    for (const t of project.tracks) {
      const c = t.clips.find((cl) => cl.id === clipId);
      if (c) return c;
    }
    return null;
  }
}
