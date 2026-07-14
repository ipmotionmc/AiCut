---
"@iplex/aicut-core": patch
"@iplex/aicut-react": patch
"@iplex/aicut-vue": patch
---

Canvas compositor AV-sync and scaling quality:

- While playing, drift correction no longer hard-seeks the audible top-track video (which flushed the audio pipeline — periodic dropouts, worst on Safari — and re-decoded from the previous keyframe, causing transient macroblock artifacts, with a stall→seek→longer-stall loop on remote sources). The audible video is now the master clock: the engine clock silently resyncs to it and the playhead follows the sound. Muted lower-layer sources keep the one-off corrective seek; paused/scrub seeking is unchanged.
- `imageSmoothingQuality = "high"` is now applied (and re-applied after every backing-store resize, which resets 2d context state) in both the canvas compositor and the WebCodecs engine — upscaled frames on Retina displays were using the default low-quality bilinear filter and looked soft/blocky vs the html-video engine.
