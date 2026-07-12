---
"@iplex/aicut-core": patch
"@iplex/aicut-react": patch
"@iplex/aicut-vue": patch
---

Canvas compositor: same-source overlaps picked the BOTTOM track's clip as the paint target (an if-absent guard on a reverse iteration locked the first encounter = highest index). Unconditional set makes the last write — track 0, the top layer — win, so split-clip overlaps show the top row's segment as intended.
