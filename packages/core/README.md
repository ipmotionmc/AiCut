# @aicut/core

Framework-agnostic video editor engine. Owns the project data model, the HTML5 playback engine, the canvas timeline (ruler, tracks, clips, thumbnails, playhead, snap, in-canvas scrollbars), and a vanilla DOM toolbar.

For React or Vue apps, prefer **[@aicut/react](https://www.npmjs.com/package/@aicut/react)** or **[@aicut/vue](https://www.npmjs.com/package/@aicut/vue)** — they wrap this same engine.

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
    tracks: [
      {
        id: "t1",
        kind: "video",
        clips: [{ id: "c1", sourceId: "s1", in: 0, out: 5000, start: 0 }],
      },
    ],
  },
});

editor.on("change", ({ project }) => localStorage.setItem("aicut", JSON.stringify(project)));
editor.on("export", ({ project }) => fetch("/api/export", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ project }),
}));
```

The editor renders into your `container`. Call methods on the returned `editor` instance to drive it imperatively.

## API surface

### Playback & editing

```ts
editor.play(); editor.pause(); editor.togglePlay(); editor.seek(timeMs);
editor.split();           // split at playhead
editor.trimLeft();        // trim selected clip's left edge to playhead
editor.trimRight();
editor.removeClip(clipId);
editor.setClipSpeed(clipId, 2);

editor.undo(); editor.redo();
editor.canUndo(); editor.canRedo();
```

### Project, sources, tracks

```ts
editor.getProject();              // deep clone of current state
editor.setProject(p);             // replace, preserves auto-fit etc.
editor.reset();                   // empty single-track project
editor.addSource({ id, url, kind: "video" });
editor.addTrack("video");
editor.removeTrack(trackId);
editor.moveClip(clipId, { start, trackId, newTrack });
editor.resizeClip(clipId, { in, out, start });
```

### Viewport

```ts
editor.getScale(); editor.setScale(80);    // px per second
editor.getSnap(); editor.setSnap(false);
editor.getSelection(); editor.setSelection(clipId);
editor.enterFullscreen(); editor.exitFullscreen();
```

### Events

```ts
const off = editor.on("change", ({ project }) => /* … */);
editor.on("time", ({ timeMs }) => /* playback tick */);
editor.on("export", ({ project }) => /* host-triggered export */);
editor.on("selectionChange", ({ clipId }) => /* … */);
editor.on("historyChange", ({ canUndo, canRedo }) => /* … */);
editor.on("ready", ({ sourceId }) => /* per-source metadata loaded */);
editor.on("scaleChange", ({ pxPerSec }) => /* … */);
editor.on("snapChange", ({ snap }) => /* … */);
editor.on("error", ({ error }) => /* … */);
off();                                       // unsubscribe
```

### Triggering export

The library never calls a backend on its own — `requestExport()` fires the `export` event with the current project JSON; your handler decides what to do.

```ts
editor.requestExport();        // → emits "export" with project
```

## Theming

CSS variables; pass any subset via `theme` and the rest fall back to the defaults.

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
    previewBg: "#000",                          // letterbox colour
  },
});

editor.setTheme({ controlsBg: "#f6f6f8", previewBg: "#e4e4e7" });   // runtime swap
```

Every variable is also a plain CSS custom property — `.aicut-root { --aicut-controls-bg: …; }` works too.

## Internationalisation

English by default. Bundled `localeZh` covers the whole editor (toolbar tooltips, exit-fullscreen overlay, canvas track headers).

```ts
import { Editor, localeZh } from "@aicut/core";

Editor.create({ container, project, locale: localeZh });

// Partial override + runtime swap
editor.setLocale({ undo: "Annuler", redo: "Refaire" });
```

`Locale` is exported as a type if you need to typecheck a custom pack.

## Toolbar slots

Both the editor's built-in toolbar and the standalone `Timeline`'s optional toolbar reserve `toolbarLeft` / `toolbarRight` slot DOM elements for host-supplied controls.

```ts
const editor = Editor.create({ container, project });
const exportBtn = document.createElement("button");
exportBtn.textContent = "Export";
exportBtn.onclick = () => editor.requestExport();
editor.toolbarRight.appendChild(exportBtn);
```

The library paints nothing into either slot and renders no separator until they're populated.

## Standalone Timeline

Use the canvas timeline without the rest of the editor — useful for a frame-picker, thumbnail strip, or a read-only preview.

```ts
import { Timeline } from "@aicut/core";

const tl = Timeline.create({
  container: document.getElementById("strip")!,
  project: { /* one-clip project */ },
  showHeader: false,
  readOnly: true,
  onSeek: (ms) => console.log("picked", ms),
});
```

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
  in: Ms; out: Ms;       // window into the source (exclusive at `out`)
  start: Ms;              // position on the timeline
  speed?: number;
}

type Ms = number;         // integer milliseconds; no frame-rate coupling
```

## License

MIT
