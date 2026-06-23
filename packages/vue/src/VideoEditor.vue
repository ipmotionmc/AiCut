<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import {
  Editor,
  type EditorApi,
  type Locale,
  type Ms,
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

onMounted(() => {
  if (!host.value) return;
  editor = Editor.create({
    container: host.value,
    project: props.defaultProject,
    theme: props.theme,
    locale: props.locale,
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
});

defineExpose({
  /** Returns the underlying core API or null if not yet mounted. */
  api: (): EditorApi | null => editor,
});
</script>

<template>
  <div ref="host" data-aicut-host="" />
</template>
