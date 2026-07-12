# @iplex/aicut-react

## 0.8.1

### Patch Changes

- 4a7b8f1: Timeline drag interactions: keep the industry row convention (top compositing layer on the top row, main track at the bottom — Premiere/CapCut style) with proper feedback:

  - Top insertion strip: thin Premiere-style overlay line + label chip at the top of the track stack during drags; dropping there appends a new top-layer track.
  - Bottom phantom row: full-height dashed slot at the bottom of the track stack during drags (scrollbar accounts for the extra height); dropping there prepends a new bottom-layer track at index 0.
  - Dragging a clip to the bottom empty area no longer creates a top-layer track (the 0.8.0 bug) but a bottom-layer track, matching the visual expectation.

- Updated dependencies [4a7b8f1]
  - @iplex/aicut-core@0.8.1

## 0.8.0

### Minor Changes

- 32a1000: Timeline UX, editor hotkeys, track layering, and lighting-v3 fixes.

  - Timeline clip labels: percent-decode URL filenames (query/hash stripped), fall back to the new `unnamedClip` locale string for blob:/data: sources, and clip + ellipsize labels to the clip body.
  - Clicking the blank space below the last track now deselects and seeks (drag scrubs), matching empty-track behavior.
  - Delete/Backspace removes the selected clip from the timeline canvas, and right-click opens a themed, localized context menu with a Delete item. New `onDeleteClip` timeline callback (React prop / Vue emit), new `deleteClip` locale key.
  - New `bindEditorHotkeys(target, editor)` export — the editor keyboard map (Space/K/Q/W/arrows/⌘Z/Delete) extracted from EditorUI so headless hosts can bind it. React `EditorProvider` grows an opt-in `hotkeys` prop that binds it to `document`; `TimelinePrimitive` now routes deletions through `editor.removeClip` so they land in undo history.
  - Track layering aligned across engines: the WebCodecs engine resolves overlapping clips top-layer-first (last track in `project.tracks`), matching the compositor and ffmpeg export. Timeline rows now display top layer on the top row (Premiere/CapCut convention); the "+ new track" phantom row moved to the top.
  - Lighting v3: dark-mode sphere outline is visible (light rim instead of a black inset shadow), and the rim-light toggle now renders a flashlight-behind-the-image glow that follows rotation, aspect, color temperature, and light/dark mode (`LightingScene.setRimEnabled` / `setRimTone`).

### Patch Changes

- Updated dependencies [32a1000]
  - @iplex/aicut-core@0.8.0
