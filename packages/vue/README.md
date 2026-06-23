# @aicut/vue

Vue 3 wrapper around **[@aicut/core](https://www.npmjs.com/package/@aicut/core)** — a canvas-rendered video editor component. Import the core stylesheet once and use it like any other Vue SFC.

```bash
pnpm add @aicut/vue @aicut/core
```

## Quick start

```vue
<script setup lang="ts">
import { ref } from "vue";
import {
  VideoEditor,
  type EditorApi,
  type Project,
} from "@aicut/vue";
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

const editor = ref<{ api(): EditorApi | null } | null>(null);

function save(p: Project) {
  console.log("autosave", p);
}

async function doExport(p: Project) {
  await fetch("/api/export", {
    method: "POST",
    body: JSON.stringify({ project: p }),
  });
}
</script>

<template>
  <VideoEditor
    ref="editor"
    :default-project="project"
    @change="save"
    @export="doExport"
    style="height: 600px"
  />
</template>
```

The component is **uncontrolled for project state**. Restore later with `editor.value?.api()?.setProject(saved)`.

## Props

| Prop | Type | Notes |
| --- | --- | --- |
| `defaultProject` | `Project` | Initial project. Read once on mount. |
| `theme` | `Theme` | CSS variable overrides. Reactive. |
| `locale` | `Partial<Locale>` | UI strings. English by default; pass `localeZh` for Chinese. Reactive. |

## Events

| Event | Payload |
| --- | --- |
| `ready` | `(api: EditorApi)` |
| `change` | `(project: Project)` |
| `export` | `(project: Project)` — fired by `api.requestExport()` |
| `time-update` | `(timeMs: number)` |
| `play` / `pause` | `()` |
| `selection-change` | `(clipId: string \| null)` |
| `error` | `(error: Error)` |

The exposed `api()` returns the same `EditorApi` instance described in [`@aicut/core`](https://www.npmjs.com/package/@aicut/core) — `play`, `pause`, `seek`, `split`, `setProject`, `requestExport`, `setTheme`, `setLocale`, the lot.

## Theming

```vue
<VideoEditor
  :theme="{
    controlsBg: '#f6f6f8',
    controlsText: 'rgba(0, 0, 0, 0.78)',
    controlsBorder: 'rgba(0, 0, 0, 0.08)',
    controlsHover: 'rgba(0, 0, 0, 0.06)',
    controlsActive: 'rgba(0, 0, 0, 0.08)',
    previewBg: '#e4e4e7',
  }"
  /* … */
/>
```

The `theme` prop is reactive — swap the binding and the editor calls `setTheme` internally.

## i18n

```vue
<script setup lang="ts">
import { ref, computed } from "vue";
import { VideoEditor, localeEn, localeZh, type Locale } from "@aicut/vue";

const lang = ref<"en" | "zh">("en");
const locale = computed<Locale>(() => (lang.value === "zh" ? localeZh : localeEn));
</script>

<template>
  <VideoEditor :locale="locale" /* … */ />
</template>
```

## Standalone `<Timeline>`

```vue
<script setup lang="ts">
import { ref } from "vue";
import { Timeline } from "@aicut/vue";

const picked = ref(0);
</script>

<template>
  <Timeline
    :default-project="singleClipProject"
    :show-header="false"
    read-only
    @seek="(ms) => (picked = ms)"
  />
</template>
```

## License

MIT
