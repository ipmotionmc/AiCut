---
"@iplex/aicut-core": patch
"@iplex/aicut-react": patch
"@iplex/aicut-vue": patch
---

Revert the timeline's reversed row display from 0.8.0. Tracks render in array order again (track 0 on the top row) and the "+ new track" phantom row returns to the bottom — the reversed order put seeded content on the bottom row under empty tracks and made drags shift every row down, which read as broken. The 0.8.0 engine alignment stays: overlapping clips still resolve top-layer-first (last track in `project.tracks`) across the compositor, WebCodecs preview, and ffmpeg export.
