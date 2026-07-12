---
"@iplex/aicut-core": minor
"@iplex/aicut-react": minor
"@iplex/aicut-vue": minor
---

Clip edge-trimming is now behind a switch, DISABLED by default. Dragging a clip's edges to trim in/out points requires opting in:

- Editor: `clipResize: { enabled: true }` option + `isClipResizeEnabled()` / `setClipResizeEnabled(on)` runtime API (React/Vue `VideoEditor` accept the same `clipResize` prop).
- Standalone Timeline: `resizable: true` option + `setResizable(on)` (React `Timeline` prop is reactive; also on `TimelineApi`).

When off, the trim handles are hidden and edge presses select/move the clip like any other part of its body. Toolbar/hotkey trim (Q/W, trim-to-playhead) is unaffected by this switch.
