import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Editor } from "./editor.js";
import type { PlaybackEngine } from "./playback/index.js";
import type { Project } from "./types.js";

function makeStubEngine(): PlaybackEngine {
  let time = 0;
  let playing = false;
  return {
    setProject() {},
    play() {
      playing = true;
    },
    pause() {
      playing = false;
    },
    isPlaying: () => playing,
    getTime: () => time,
    seek(ms) {
      time = ms;
    },
    destroy() {},
  };
}

function tinyProject(): Project {
  return {
    version: 1,
    sources: [{ id: "s1", url: "blob:x", kind: "video" }],
    tracks: [
      {
        id: "t1",
        kind: "video",
        clips: [{ id: "c1", sourceId: "s1", in: 0, out: 5000, start: 0 }],
      },
    ],
  };
}

describe("Editor.keyframes — per-property mutators + history + selection", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });
  afterEach(() => {
    container.remove();
  });

  it("isKeyframesEnabled defaults to false; setKeyframesEnabled emits + flips", () => {
    const editor = Editor.create({
      container,
      project: tinyProject(),
      playbackEngine: () => makeStubEngine(),
    });
    expect(editor.isKeyframesEnabled()).toBe(false);
    let seen = false;
    editor.on("keyframesEnabledChange", ({ enabled }) => {
      seen = enabled;
    });
    editor.setKeyframesEnabled(true);
    expect(editor.isKeyframesEnabled()).toBe(true);
    expect(seen).toBe(true);
    editor.destroy();
  });

  it("addKeyframe(prop) at playhead uses currently interpolated value", () => {
    const stub = makeStubEngine();
    const editor = Editor.create({
      container,
      project: tinyProject(),
      playbackEngine: () => stub,
    });
    stub.seek(1000);
    const id = editor.addKeyframe("c1", "scale");
    expect(id).not.toBeNull();
    const clip = editor.getProject().tracks[0]?.clips[0];
    expect(clip?.keyframes).toHaveLength(1);
    expect(clip?.keyframes?.[0]).toMatchObject({
      prop: "scale",
      time: 1000,
      value: 1,
    });
    editor.destroy();
  });

  it("addKeyframe respects explicit value override", () => {
    const editor = Editor.create({
      container,
      project: tinyProject(),
      playbackEngine: () => makeStubEngine(),
    });
    const id = editor.addKeyframe("c1", "scale", { time: 500, value: 2 });
    expect(id).not.toBeNull();
    const kf = editor.getProject().tracks[0]?.clips[0]?.keyframes?.[0];
    expect(kf).toMatchObject({ prop: "scale", time: 500, value: 2 });
    editor.destroy();
  });

  it("addKeyframe at the same time on the same prop UPSERTS the value", () => {
    const editor = Editor.create({
      container,
      project: tinyProject(),
      playbackEngine: () => makeStubEngine(),
    });
    editor.addKeyframe("c1", "scale", { time: 1000, value: 1.5 });
    editor.addKeyframe("c1", "scale", { time: 1000, value: 2 });
    const kfs = editor.getProject().tracks[0]?.clips[0]?.keyframes ?? [];
    expect(kfs).toHaveLength(1);
    expect(kfs[0]?.value).toBe(2);
    editor.destroy();
  });

  it("different props at the same time are independent keyframes", () => {
    const editor = Editor.create({
      container,
      project: tinyProject(),
      playbackEngine: () => makeStubEngine(),
    });
    editor.addKeyframe("c1", "panX", { time: 1000, value: 50 });
    editor.addKeyframe("c1", "scale", { time: 1000, value: 2 });
    const kfs = editor.getProject().tracks[0]?.clips[0]?.keyframes ?? [];
    expect(kfs).toHaveLength(2);
    expect(kfs.some((k) => k.prop === "panX" && k.value === 50)).toBe(true);
    expect(kfs.some((k) => k.prop === "scale" && k.value === 2)).toBe(true);
    editor.destroy();
  });

  it("removeKeyframe drops one entry; sets keyframes to undefined when last", () => {
    const editor = Editor.create({
      container,
      project: tinyProject(),
      playbackEngine: () => makeStubEngine(),
    });
    const id = editor.addKeyframe("c1", "scale", { time: 1000, value: 2 });
    expect(editor.removeKeyframe("c1", id!)).toBe(true);
    expect(editor.getProject().tracks[0]?.clips[0]?.keyframes).toBeUndefined();
    editor.destroy();
  });

  it("moveKeyframe clamps + rejects collision on the SAME prop", () => {
    const editor = Editor.create({
      container,
      project: tinyProject(),
      playbackEngine: () => makeStubEngine(),
    });
    const a = editor.addKeyframe("c1", "scale", { time: 1000, value: 1 });
    const b = editor.addKeyframe("c1", "scale", { time: 3000, value: 2 });
    // Move b before a — they're on the same prop, so re-sort.
    expect(editor.moveKeyframe("c1", b!, 500)).toBe(true);
    // Try to collide a with b (now at 500).
    expect(editor.moveKeyframe("c1", a!, 500)).toBe(false);
    // Move a to a free slot.
    expect(editor.moveKeyframe("c1", a!, 2500)).toBe(true);
    editor.destroy();
  });

  it("setKeyframeValue updates the single value of one kf", () => {
    const editor = Editor.create({
      container,
      project: tinyProject(),
      playbackEngine: () => makeStubEngine(),
    });
    const id = editor.addKeyframe("c1", "scale", { time: 1000, value: 1 });
    expect(editor.setKeyframeValue("c1", id!, 1.75)).toBe(true);
    const kf = editor.getProject().tracks[0]?.clips[0]?.keyframes?.[0];
    expect(kf?.value).toBeCloseTo(1.75);
    expect(editor.setKeyframeValue("c1", id!, 1.75)).toBe(false); // no-op
    editor.destroy();
  });

  it("setValueAtPlayhead writes static base when no keyframes exist", () => {
    const stub = makeStubEngine();
    const editor = Editor.create({
      container,
      project: tinyProject(),
      playbackEngine: () => stub,
    });
    stub.seek(1500);
    expect(editor.setValueAtPlayhead("c1", "scale", 1.5)).toBe(true);
    const clip = editor.getProject().tracks[0]?.clips[0];
    expect(clip?.scale).toBe(1.5);
    expect(clip?.keyframes).toBeUndefined();
    editor.destroy();
  });

  it("setValueAtPlayhead upserts a keyframe once the prop is animated", () => {
    const stub = makeStubEngine();
    const editor = Editor.create({
      container,
      project: tinyProject(),
      playbackEngine: () => stub,
    });
    stub.seek(0);
    editor.addKeyframe("c1", "scale", { time: 0, value: 1 });
    stub.seek(2000);
    editor.setValueAtPlayhead("c1", "scale", 2);
    const kfs = editor.getProject().tracks[0]?.clips[0]?.keyframes ?? [];
    expect(kfs).toHaveLength(2);
    expect(kfs.find((k) => k.time === 2000)?.value).toBe(2);
    editor.destroy();
  });

  it("undo restores state before add / move / value-change", () => {
    const editor = Editor.create({
      container,
      project: tinyProject(),
      playbackEngine: () => makeStubEngine(),
    });
    const id = editor.addKeyframe("c1", "scale", { time: 1000, value: 1.5 });
    editor.moveKeyframe("c1", id!, 2500);
    editor.setKeyframeValue("c1", id!, 2);
    editor.undo(); // value back to 1.5
    expect(
      editor.getProject().tracks[0]?.clips[0]?.keyframes?.[0]?.value,
    ).toBe(1.5);
    editor.undo(); // time back to 1000
    expect(
      editor.getProject().tracks[0]?.clips[0]?.keyframes?.[0]?.time,
    ).toBe(1000);
    editor.undo(); // keyframe removed
    expect(
      editor.getProject().tracks[0]?.clips[0]?.keyframes,
    ).toBeUndefined();
    editor.destroy();
  });

  it("selecting a keyframe also selects its parent clip", () => {
    const editor = Editor.create({
      container,
      project: tinyProject(),
      playbackEngine: () => makeStubEngine(),
    });
    const id = editor.addKeyframe("c1", "scale", { time: 1000, value: 1.5 });
    editor.setSelectedKeyframe({ clipId: "c1", keyframeId: id! });
    expect(editor.getSelection()).toBe("c1");
    editor.destroy();
  });

  it("toggleKeyframeAtPlayhead adds 3 keyframes (panX/panY/scale) when none exist", () => {
    const stub = makeStubEngine();
    const editor = Editor.create({
      container,
      project: tinyProject(),
      playbackEngine: () => stub,
    });
    editor.setSelection("c1");
    stub.seek(1000);
    expect(editor.toggleKeyframeAtPlayhead()).toBe(true);
    const kfs = editor.getProject().tracks[0]?.clips[0]?.keyframes ?? [];
    expect(kfs).toHaveLength(3);
    const props = new Set(kfs.map((k) => k.prop));
    expect(props).toEqual(new Set(["panX", "panY", "scale"]));
    // Toggle again at the same time → removes them.
    expect(editor.toggleKeyframeAtPlayhead()).toBe(true);
    expect(editor.getProject().tracks[0]?.clips[0]?.keyframes).toBeUndefined();
    editor.destroy();
  });

  it("projects without keyframes round-trip identically through setProject", () => {
    const editor = Editor.create({
      container,
      project: tinyProject(),
      playbackEngine: () => makeStubEngine(),
    });
    const beforeJson = JSON.stringify(editor.getProject());
    editor.setProject(JSON.parse(beforeJson));
    expect(JSON.stringify(editor.getProject())).toBe(beforeJson);
    editor.destroy();
  });

  it("splitClipAt partitions per-property keyframes across the cut", () => {
    const editor = Editor.create({
      container,
      project: tinyProject(),
      playbackEngine: () => makeStubEngine(),
    });
    editor.addKeyframe("c1", "scale", { time: 500, value: 1 });
    editor.addKeyframe("c1", "scale", { time: 3000, value: 2 });
    editor.addKeyframe("c1", "panX", { time: 3000, value: 100 });
    editor.split(2000);
    const clips = editor.getProject().tracks[0]?.clips ?? [];
    expect(clips).toHaveLength(2);
    expect(clips[0]?.keyframes).toHaveLength(1);
    expect(clips[0]?.keyframes?.[0]).toMatchObject({
      prop: "scale",
      time: 500,
    });
    expect(clips[1]?.keyframes).toHaveLength(2);
    expect(clips[1]?.keyframes?.every((k) => k.time === 1000)).toBe(true);
    editor.destroy();
  });

  it("migrates legacy {time, x, y, scale} tuple keyframes on setProject", () => {
    const editor = Editor.create({
      container,
      project: tinyProject(),
      playbackEngine: () => makeStubEngine(),
    });
    editor.setProject({
      version: 1,
      sources: [{ id: "s1", url: "blob:x", kind: "video" }],
      tracks: [
        {
          id: "t1",
          kind: "video",
          clips: [
            {
              id: "c1",
              sourceId: "s1",
              in: 0,
              out: 5000,
              start: 0,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              keyframes: [
                { id: "old1", time: 1000, x: 50, y: 0, scale: 1.5 },
                { id: "old2", time: 3000, x: 100, y: 0, scale: 2 },
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
              ] as any,
            },
          ],
        },
      ],
    });
    const kfs = editor.getProject().tracks[0]?.clips[0]?.keyframes ?? [];
    // 2 tuples × 3 props = 6 per-property entries.
    expect(kfs).toHaveLength(6);
    const props = new Set(kfs.map((k) => k.prop));
    expect(props).toEqual(new Set(["panX", "panY", "scale"]));
    editor.destroy();
  });
});
