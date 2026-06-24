# @aicut/core

> Framework-agnostic engine for the AiCut video editor — canvas timeline, plain-JSON projects, zero runtime deps.

[![npm](https://img.shields.io/npm/v/@aicut/core.svg)](https://www.npmjs.com/package/@aicut/core)
[![License](https://img.shields.io/npm/l/@aicut/core.svg)](./LICENSE)
[![GitHub](https://img.shields.io/badge/repo-ziqiangai/AiCut-181717?logo=github)](https://github.com/ziqiangai/AiCut)

![AiCut editor](https://raw.githubusercontent.com/ziqiangai/AiCut/main/docs/screenshots/editor-dark.png)

For React or Vue apps, prefer **[@aicut/react](https://www.npmjs.com/package/@aicut/react)** or **[@aicut/vue](https://www.npmjs.com/package/@aicut/vue)** — they wrap this same engine.

## Install

```bash
pnpm add @aicut/core
```

## Quick start

```ts
import { Editor } from "@aicut/core";
import "@aicut/core/styles.css";

const editor = Editor.create({
  container: document.getElementById("app")!,
  project: {
    version: 1,
    sources: [
      { id: "s1", url: "/media/a.mp4", kind: "video", name: "a.mp4" },
    ],
    tracks: [{
      id: "t1",
      kind: "video",
      clips: [{ id: "c1", sourceId: "s1", in: 0, out: 5000, start: 0 }],
    }],
  },
});

editor.on("change", ({ project }) => {
  localStorage.setItem("aicut", JSON.stringify(project));
});

editor.on("export", ({ project }) => {
  fetch("/api/export", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ project }),
  });
});
```

## API at a glance

```ts
// Playback
editor.play(); editor.pause(); editor.togglePlay();
editor.seek(timeMs);

// Editing
editor.split();          // at playhead
editor.trimLeft();
editor.trimRight();
editor.removeClip(clipId);
editor.setClipSpeed(clipId, 2);
editor.undo(); editor.redo();

// Project state
editor.getProject();
editor.setProject(project);
editor.reset();
editor.addSource({ id, url, kind: "video" });
editor.addTrack("video");
editor.moveClip(clipId, { start, trackId, newTrack });

// Viewport
editor.setScale(80);     // px per second
editor.setSnap(false);
editor.setSelection(clipId);

// UI
editor.setTheme({ controlsBg: "#fff" });
editor.setLocale({ undo: "Annuler" });
editor.requestExport();  // → fires "export" event
```

## Events

```ts
editor.on("change",          ({ project }) => /* … */);
editor.on("time",            ({ timeMs }) => /* … */);
editor.on("export",          ({ project }) => /* … */);
editor.on("selectionChange", ({ clipId }) => /* … */);
editor.on("historyChange",   ({ canUndo, canRedo }) => /* … */);
editor.on("ready",           ({ sourceId }) => /* … */);
editor.on("scaleChange",     ({ pxPerSec }) => /* … */);
editor.on("snapChange",      ({ snap }) => /* … */);
editor.on("error",           ({ error }) => /* … */);
```

Each `on` returns an unsubscribe function.

## Theming

```ts
Editor.create({
  container,
  project,
  theme: {
    controlsBg: "#1f1f22",
    controlsText: "rgba(255, 255, 255, 0.85)",
    controlsBorder: "rgba(255, 255, 255, 0.08)",
    controlsHover: "rgba(255, 255, 255, 0.08)",
    controlsActive: "rgba(255, 255, 255, 0.12)",
    previewBg: "#000",                 // letterbox colour
  },
});
```

Every key is also a plain CSS custom property — `.aicut-root { --aicut-controls-bg: …; }` works too. Call `editor.setTheme(…)` to swap at runtime.

## i18n

English by default. Bundled `localeZh` covers the whole editor (toolbar tooltips, exit-fullscreen overlay, canvas track headers).

```ts
import { Editor, localeZh } from "@aicut/core";

Editor.create({ container, project, locale: localeZh });

editor.setLocale({ undo: "Annuler" });   // partial override
```

## Host slots

The editor reserves four slot DOM elements for host-supplied controls. Library paints nothing into any of them; populated slots show, empty ones collapse.

```ts
// Header above the preview — collapses entirely when both empty.
editor.headerLeft.textContent = "Untitled project";
const exportBtn = document.createElement("button");
exportBtn.textContent = "Export";
exportBtn.onclick = () => editor.requestExport();
editor.headerRight.appendChild(exportBtn);

// Toolbar bookends (next to the built-in icons)
editor.toolbarLeft.appendChild(aspectDropdown);
editor.toolbarRight.appendChild(customIconBtn);
```

| Slot | Where |
| --- | --- |
| `editor.headerLeft` / `editor.headerRight` | Optional header row above the preview |
| `editor.toolbarLeft` / `editor.toolbarRight` | Bookends on the toolbar row |

The standalone `Timeline` also exposes `toolbarLeft` / `toolbarRight` when constructed with `toolbar: true`.

## Lighting picker (opt-in sub-entry)

A separate component for AI-relighting workflows — drag a light dot around a 3D sphere wrapping a subject frame, control brightness / color / direction. Three.js is bundled only on this sub-entry, so consumers of the video editor pay zero bytes for it.

The library renders **only the picker** (scene + controls). Smart-mode UI (prompt textarea, preset thumbnails, Generate button, close handling) is host code laid out beside `<LightingEditor>`.

```ts
import { LightingEditor } from "@aicut/core/lighting";
import "@aicut/core/styles.css";

const ed = LightingEditor.create({
  container: document.getElementById("light")!,
  subjectImageUrl: "/frames/subject.jpg",
  onChange: (cfg) => console.log(cfg),
});

// Runtime control
ed.setView("front");
ed.setConfig({ brightness: 0.8, color: "#ffaa3a" });
ed.setSubjectImage("/frames/another-subject.jpg");
ed.reset();                  // restore safe defaults

// Footer slot — the only DOM region the library leaves for host action
// buttons (Reset, Generate, save-preset, etc.). Library renders nothing
// into it; host appends whatever it wants:
const resetBtn = document.createElement("button");
resetBtn.textContent = "Reset";
resetBtn.onclick = () => ed.reset();
ed.controlsFooter.appendChild(resetBtn);

// Host snapshot for "Generate" — call from your own button
function onGenerate() {
  const cfg = ed.getConfig();
  fetch("/relight", { method: "POST", body: JSON.stringify(cfg) });
}
```

Locale extension `LightingLocale` (separate from the video editor's `Locale`) is exported with `lightingLocaleEn` / `lightingLocaleZh`.

## Standalone Timeline

```ts
import { Timeline } from "@aicut/core";

const tl = Timeline.create({
  container: document.getElementById("strip")!,
  project: singleClipProject,
  showHeader: false,
  readOnly: true,
  onSeek: (ms) => console.log("picked", ms),
});
```

Useful for a frame-picker, thumbnail strip, or read-only preview.

## Data model

```ts
interface Project {
  version: 1;
  sources: MediaSource[];
  tracks: Track[];
}

interface MediaSource {
  id: string; url: string; kind: "video" | "audio";
  duration?: number; name?: string;
}

interface Track { id: string; kind: "video" | "audio"; clips: Clip[]; }

interface Clip {
  id: string; sourceId: string;
  in: Ms; out: Ms;     // window into the source (exclusive at `out`)
  start: Ms;            // position on the timeline
  speed?: number;
}

type Ms = number;       // integer milliseconds; no frame-rate coupling
```

---

[Full docs & demo](https://github.com/ziqiangai/AiCut) · [@aicut/react](https://www.npmjs.com/package/@aicut/react) · [@aicut/vue](https://www.npmjs.com/package/@aicut/vue)
