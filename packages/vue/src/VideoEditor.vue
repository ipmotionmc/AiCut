<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import {
  Editor,
  type EditorApi,
  type Locale,
  type Ms,
  type PlaybackEngineFactory,
  type Project,
  type Theme,
} from "@aicut/core";

/**
 * Vue 3 wrapper around `@aicut/core`. Same shape as `@aicut/react`:
 * uncontrolled for project state, theme is reactive, API exposed via
 * `defineExpose` so a parent `ref` can call cut/seek/setProject/etc.
 */
const props = defineProps<{
  defaultProject?: Project;
  theme?: Theme;
  /** UI string overrides (English default). Reactive — swap to `localeZh` for Chinese. */
  locale?: Partial<Locale>;
  /**
   * Initial-only factory for a custom playback engine. Defaults to the
   * built-in `HtmlVideoEngine`. Pass `WebCodecsEngine` (v0.6+) or your
   * own engine to override. Bound at mount; later prop changes are
   * ignored.
   */
  playbackEngine?: PlaybackEngineFactory;
}>();

const emit = defineEmits<{
  (e: "ready", api: EditorApi): void;
  (e: "change", project: Project): void;
  (e: "export", project: Project): void;
  (e: "timeUpdate", timeMs: Ms): void;
  (e: "play"): void;
  (e: "pause"): void;
  (e: "selectionChange", clipId: string | null): void;
  (e: "error", error: Error): void;
}>();

const host = ref<HTMLDivElement | null>(null);
let editor: Editor | null = null;
const offs: Array<() => void> = [];
/** Header slot DOM nodes — set after editor mount so Vue Teleports
 *  have a valid target. Library renders nothing here; named slots
 *  `#headerLeft` / `#headerRight` portal whatever the host provides. */
const headerLeftSlot = ref<HTMLElement | null>(null);
const headerRightSlot = ref<HTMLElement | null>(null);

onMounted(() => {
  if (!host.value) return;
  editor = Editor.create({
    container: host.value,
    project: props.defaultProject,
    theme: props.theme,
    locale: props.locale,
    playbackEngine: props.playbackEngine,
  });

  offs.push(
    editor.on("change", ({ project }) => emit("change", project)),
    editor.on("export", ({ project }) => emit("export", project)),
    editor.on("time", ({ timeMs }) => emit("timeUpdate", timeMs)),
    editor.on("play", () => emit("play")),
    editor.on("pause", () => emit("pause")),
    editor.on("selectionChange", ({ clipId }) =>
      emit("selectionChange", clipId),
    ),
    editor.on("error", ({ error }) => emit("error", error)),
  );

  headerLeftSlot.value = editor.headerLeft;
  headerRightSlot.value = editor.headerRight;
  emit("ready", editor);
});

watch(
  () => props.theme,
  (theme) => {
    if (theme && editor) editor.setTheme(theme);
  },
);

watch(
  () => props.locale,
  (locale) => {
    if (locale && editor) editor.setLocale(locale);
  },
);

onBeforeUnmount(() => {
  for (const off of offs) off();
  offs.length = 0;
  editor?.destroy();
  editor = null;
  headerLeftSlot.value = null;
  headerRightSlot.value = null;
});

defineExpose({
  /** Returns the underlying core API or null if not yet mounted. */
  api: (): EditorApi | null => editor,
});
</script>

<template>
  <div ref="host" data-aicut-host="">
    <Teleport v-if="headerLeftSlot" :to="headerLeftSlot">
      <slot name="headerLeft" />
    </Teleport>
    <Teleport v-if="headerRightSlot" :to="headerRightSlot">
      <slot name="headerRight" />
    </Teleport>
  </div>
</template>
