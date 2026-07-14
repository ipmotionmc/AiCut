# @iplex/aicut-core

## 0.8.6

### Patch Changes

- 9d7ebb9: Canvas compositor AV-sync and scaling quality:

  - While playing, drift correction no longer hard-seeks the audible top-track video (which flushed the audio pipeline — periodic dropouts, worst on Safari — and re-decoded from the previous keyframe, causing transient macroblock artifacts, with a stall→seek→longer-stall loop on remote sources). The audible video is now the master clock: the engine clock silently resyncs to it and the playhead follows the sound. Muted lower-layer sources keep the one-off corrective seek; paused/scrub seeking is unchanged.
  - `imageSmoothingQuality = "high"` is now applied (and re-applied after every backing-store resize, which resets 2d context state) in both the canvas compositor and the WebCodecs engine — upscaled frames on Retina displays were using the default low-quality bilinear filter and looked soft/blocky vs the html-video engine.

## 0.8.5

### Patch Changes

- d6ddc70: Clip edge-trimming is now behind a switch, DISABLED by default. Dragging a clip's edges to trim in/out points requires opting in:

  - Editor: `clipResize: { enabled: true }` option + `isClipResizeEnabled()` / `setClipResizeEnabled(on)` runtime API (React/Vue `VideoEditor` accept the same `clipResize` prop).
  - Standalone Timeline: `resizable: true` option + `setResizable(on)` (React `Timeline` prop is reactive; also on `TimelineApi`).

  When off, the trim handles are hidden and edge presses select/move the clip like any other part of its body. Toolbar/hotkey trim (Q/W, trim-to-playhead) is unaffected by this switch.

- b90b6de: Right-edge trim is now clamped to the source's known duration — a clip could previously be stretched past real content, freezing the preview on the last frame and desyncing the export. Clamped both live during the drag (timeline) and at commit (`Editor.resizeClip`). Sources without duration metadata remain unclamped until it arrives.

## 0.8.4

### Patch Changes

- 783386f: Canvas compositor: same-source overlaps picked the BOTTOM track's clip as the paint target (an if-absent guard on a reverse iteration locked the first encounter = highest index). Unconditional set makes the last write — track 0, the top layer — win, so split-clip overlaps show the top row's segment as intended.

## 0.8.3

### Patch Changes

- fbc1262: Fix playback stutter introduced in 0.8.2: the canvas compositor snapped `video.currentTime` to the rAF clock every frame (10ms tolerance), forcing a re-seek per frame — choppy video and audio even with a single clip. The correction now only fires while paused (frame-accurate scrubbing) or when drift exceeds 0.3s (same-source segment switch), so normal playback runs on the video's own clock again.

## 0.8.2

### Patch Changes

- 9230812: Unified track layer priority — track 0 (the panel's first row) is the TOP compositing layer across every engine and the export:

  - Reverted the 0.8.0/0.8.1 timeline row-order changes entirely: rows are plain array order again (track 0 on the first row), the top insertion strip is gone, and new-track drops simply append — same interaction as pre-0.8.0.
  - html-video engine (the default): z-index flipped so track 0 renders on top; same-source wrapper resolution favors track 0.
  - Canvas compositor: paints tracks in reverse (track 0 last = on top); same-source `<video>` elements paint once per frame at the top layer's position, fixing the async `currentTime` race that made split-clip overlaps show the wrong frame.
  - WebCodecs engine: overlap resolution restored to track-0-first.
  - ffmpeg export (ts backend): overlays reversed so track 0 lands on top; audio now comes from track 0, matching the preview engines.

## 0.8.1

### Patch Changes

- 4a7b8f1: Timeline drag interactions: keep the industry row convention (top compositing layer on the top row, main track at the bottom — Premiere/CapCut style) with proper feedback:

  - Top insertion strip: thin Premiere-style overlay line + label chip at the top of the track stack during drags; dropping there appends a new top-layer track.
  - Bottom phantom row: full-height dashed slot at the bottom of the track stack during drags (scrollbar accounts for the extra height); dropping there prepends a new bottom-layer track at index 0.
  - Dragging a clip to the bottom empty area no longer creates a top-layer track (the 0.8.0 bug) but a bottom-layer track, matching the visual expectation.

## 0.8.0

### Minor Changes

- 32a1000: Timeline UX, editor hotkeys, track layering, and lighting-v3 fixes.

  - Timeline clip labels: percent-decode URL filenames (query/hash stripped), fall back to the new `unnamedClip` locale string for blob:/data: sources, and clip + ellipsize labels to the clip body.
  - Clicking the blank space below the last track now deselects and seeks (drag scrubs), matching empty-track behavior.
  - Delete/Backspace removes the selected clip from the timeline canvas, and right-click opens a themed, localized context menu with a Delete item. New `onDeleteClip` timeline callback (React prop / Vue emit), new `deleteClip` locale key.
  - New `bindEditorHotkeys(target, editor)` export — the editor keyboard map (Space/K/Q/W/arrows/⌘Z/Delete) extracted from EditorUI so headless hosts can bind it. React `EditorProvider` grows an opt-in `hotkeys` prop that binds it to `document`; `TimelinePrimitive` now routes deletions through `editor.removeClip` so they land in undo history.
  - Track layering aligned across engines: the WebCodecs engine resolves overlapping clips top-layer-first (last track in `project.tracks`), matching the compositor and ffmpeg export. Timeline rows now display top layer on the top row (Premiere/CapCut convention); the "+ new track" phantom row moved to the top.
  - Lighting v3: dark-mode sphere outline is visible (light rim instead of a black inset shadow), and the rim-light toggle now renders a flashlight-behind-the-image glow that follows rotation, aspect, color temperature, and light/dark mode (`LightingScene.setRimEnabled` / `setRimTone`).
