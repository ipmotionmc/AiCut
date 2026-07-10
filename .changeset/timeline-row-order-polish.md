---
"@iplex/aicut-core": patch
"@iplex/aicut-react": patch
"@iplex/aicut-vue": patch
---

Timeline row order: keep the industry convention from 0.8.0 (top compositing layer on the top row, main track at the bottom — Premiere/CapCut style) but fix the two interaction problems it shipped with. The "+ new track" affordance is now a thin Premiere-style insertion strip overlaid at the top of the stack during drags — it highlights (with a label chip) when the drop would land there and no longer reserves a full row, so existing rows never shift mid-drag. `contentHeight(tracks)` lost its `isDragging` parameter accordingly.
