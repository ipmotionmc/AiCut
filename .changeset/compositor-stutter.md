---
"@iplex/aicut-core": patch
"@iplex/aicut-react": patch
"@iplex/aicut-vue": patch
---

Fix playback stutter introduced in 0.8.2: the canvas compositor snapped `video.currentTime` to the rAF clock every frame (10ms tolerance), forcing a re-seek per frame — choppy video and audio even with a single clip. The correction now only fires while paused (frame-accurate scrubbing) or when drift exceeds 0.3s (same-source segment switch), so normal playback runs on the video's own clock again.
