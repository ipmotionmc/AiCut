---
"@iplex/aicut-core": patch
"@iplex/aicut-react": patch
"@iplex/aicut-vue": patch
---

Right-edge trim is now clamped to the source's known duration — a clip could previously be stretched past real content, freezing the preview on the last frame and desyncing the export. Clamped both live during the drag (timeline) and at commit (`Editor.resizeClip`). Sources without duration metadata remain unclamped until it arrives.
