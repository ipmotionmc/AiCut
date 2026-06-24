<script setup lang="ts">
import { onBeforeUnmount, onMounted, useTemplateRef, watch } from "vue";
import {
  LightingEditor as CoreLightingEditor,
  type LightingConfig,
  type LightingEditorOptions,
  type LightingView,
} from "@aicut/core/lighting";
import type { Theme } from "@aicut/core";

/**
 * Vue 3 shell for the 3D lighting picker. Renders scene + controls;
 * nothing else. Host code lays out their own surrounding UI (smart
 * mode panel, generate button, etc.) alongside this component in
 * their own template.
 */
const props = defineProps<{
  subjectImageUrl?: string;
  defaultConfig?: Partial<LightingConfig>;
  defaultView?: LightingView;
  theme?: Theme;
  locale?: LightingEditorOptions["locale"];
}>();

const emit = defineEmits<{
  (e: "ready", api: CoreLightingEditor): void;
  (e: "change", cfg: LightingConfig): void;
}>();

const host = useTemplateRef<HTMLDivElement>("host");
let editor: CoreLightingEditor | null = null;

onMounted(() => {
  if (!host.value) return;
  editor = CoreLightingEditor.create({
    container: host.value,
    subjectImageUrl: props.subjectImageUrl,
    config: props.defaultConfig,
    view: props.defaultView,
    theme: props.theme,
    locale: props.locale,
    onChange: (cfg) => emit("change", cfg),
  });
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
    if (editor) editor.setLocale(locale ?? {});
  },
);
watch(
  () => props.subjectImageUrl,
  (url) => {
    if (url && editor) editor.setSubjectImage(url);
  },
);

onBeforeUnmount(() => {
  editor?.destroy();
  editor = null;
});

defineExpose({
  api: (): CoreLightingEditor | null => editor,
});
</script>

<template>
  <div ref="host" data-aicut-lighting-host="" />
</template>
