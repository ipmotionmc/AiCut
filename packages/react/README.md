# @aicut/react

React 18 / 19 wrapper around **[@aicut/core](https://www.npmjs.com/package/@aicut/core)** — a canvas-rendered video editor component you can drop into any host app. Import the core stylesheet once and you're done.

```bash
pnpm add @aicut/react @aicut/core
```

## Quick start

```tsx
import { useRef } from "react";
import {
  VideoEditor,
  type VideoEditorApi,
  type Project,
} from "@aicut/react";
import "@aicut/core/styles.css";

const project: Project = {
  version: 1,
  sources: [{ id: "s1", url: "/media/a.mp4", kind: "video", name: "a.mp4" }],
  tracks: [
    { id: "t1", kind: "video", clips: [
      { id: "c1", sourceId: "s1", in: 0, out: 5000, start: 0 },
    ]},
  ],
};

export function Editor() {
  const apiRef = useRef<VideoEditorApi | null>(null);
  return (
    <VideoEditor
      apiRef={apiRef}
      defaultProject={project}
      onChange={(p) => console.log("autosave", p)}
      onExport={(p) => fetch("/api/export", {
        method: "POST",
        body: JSON.stringify({ project: p }),
      })}
      style={{ height: 600 }}
    />
  );
}
```

The component is **uncontrolled for project state** — the editor owns the current project. To restore from JSON later, `apiRef.current?.setProject(saved)`.

## Props

| Prop | Type | Notes |
| --- | --- | --- |
| `defaultProject` | `Project` | Initial project. Read once on mount. |
| `theme` | `Theme` | CSS variable overrides. Reactive — mirrors to `editor.setTheme`. |
| `locale` | `Partial<Locale>` | UI strings. English by default; pass `localeZh` for Chinese. Reactive. |
| `toolbarLeft` | `ReactNode` | Portaled into the editor toolbar's left bookend slot. |
| `toolbarRight` | `ReactNode` | Portaled into the right slot — host's Export button lives here. |
| `apiRef` | `Ref<VideoEditorApi \| null>` | Imperative API handle. |
| `onReady` | `(api) => void` | Fires synchronously on mount. |
| `onChange` | `(project) => void` | Any model mutation. |
| `onExport` | `(project) => void` | Fired by `api.requestExport()`. |
| `onTimeUpdate` | `(ms) => void` | Playback tick. |
| `onPlay` / `onPause` | `() => void` | |
| `onSelectionChange` | `(clipId \| null) => void` | |
| `onError` | `(err) => void` | |
| `className` / `style` | `string` / `CSSProperties` | Forwarded to the host `<div>`. |

The `apiRef` value implements **every method on `EditorApi`** — `play`, `pause`, `seek`, `split`, `trimLeft`, `trimRight`, `setProject`, `getProject`, `addSource`, `addTrack`, `removeClip`, `setSelection`, `undo`, `redo`, `setTheme`, `setLocale`, `requestExport`, etc. See [`@aicut/core`](https://www.npmjs.com/package/@aicut/core) for the full surface.

## Custom toolbar controls

Drop any React node into `toolbarLeft` / `toolbarRight`. The library renders nothing into the slots and hides the separator until they're populated.

```tsx
<VideoEditor
  apiRef={apiRef}
  defaultProject={project}
  toolbarLeft={
    <select value={aspect} onChange={(e) => setAspect(e.target.value)}>
      <option value="16:9">16:9</option>
      <option value="9:16">9:16</option>
      <option value="1:1">1:1</option>
    </select>
  }
  toolbarRight={
    <button onClick={() => apiRef.current?.requestExport()}>Export</button>
  }
/>
```

`api.requestExport()` fires the `export` event with the current project JSON, which flows back through your `onExport` prop. From there, POST it to your own backend.

## Theming

```tsx
<VideoEditor
  theme={{
    controlsBg: "#f6f6f8",
    controlsText: "rgba(0, 0, 0, 0.78)",
    controlsBorder: "rgba(0, 0, 0, 0.08)",
    controlsHover: "rgba(0, 0, 0, 0.06)",
    controlsActive: "rgba(0, 0, 0, 0.08)",
    previewBg: "#e4e4e7",     // letterbox colour around the video
  }}
  /* … */
/>
```

The `theme` prop is reactive — swap it any time and the editor calls `setTheme` internally.

## i18n

English is default. Pass the bundled `localeZh` for Chinese, or a partial object to override specific keys.

```tsx
import { VideoEditor, localeZh } from "@aicut/react";

<VideoEditor locale={localeZh} /* … */ />
<VideoEditor locale={{ undo: "Annuler" }} /* … */ />
```

## Standalone `<Timeline>`

Use the canvas timeline without the rest of the editor.

```tsx
import { Timeline, type TimelineApi } from "@aicut/react";

<Timeline
  apiRef={timelineRef}
  defaultProject={singleClipProject}
  showHeader={false}
  readOnly
  toolbar                                            // 36px top strip
  toolbarLeft={<span>Picked at {ms / 1000}s</span>}
  toolbarRight={<button onClick={pick}>Use frame</button>}
  onSeek={(ms) => setPicked(ms)}
/>
```

## License

MIT
