---
"@iplex/aicut-core": patch
"@iplex/aicut-react": patch
"@iplex/aicut-vue": patch
---

Unified track layer priority — track 0 (the panel's first row) is the TOP compositing layer across every engine and the export:

- Reverted the 0.8.0/0.8.1 timeline row-order changes entirely: rows are plain array order again (track 0 on the first row), the top insertion strip is gone, and new-track drops simply append — same interaction as pre-0.8.0.
- html-video engine (the default): z-index flipped so track 0 renders on top; same-source wrapper resolution favors track 0.
- Canvas compositor: paints tracks in reverse (track 0 last = on top); same-source `<video>` elements paint once per frame at the top layer's position, fixing the async `currentTime` race that made split-clip overlaps show the wrong frame.
- WebCodecs engine: overlap resolution restored to track-0-first.
- ffmpeg export (ts backend): overlays reversed so track 0 lands on top; audio now comes from track 0, matching the preview engines.
