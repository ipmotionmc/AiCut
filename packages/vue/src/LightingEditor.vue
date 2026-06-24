<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from "vue";
import {
  LightingEditor as CoreLightingEditor,
  type LightingConfig,
  type LightingEditorOptions,
  type LightingView,
} from "@aicut/core/lighting";
import type { Theme } from "@aicut/core";

/**
 * Vue 3 wrapper around the core `LightingEditor`. Same shape as the
 * React component: `defaultConfig` is read once on mount, `theme` /
 * `locale` / `subjectImageUrl` are reactive, the host AI UI goes into
 * a `<slot name="smart">` that Vue teleports into the smart slot DOM.
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
  (e: "generate", cfg: LightingConfig): void;
}>();

const host = useTemplateRef<HTMLDivElement>("host");
let editor: CoreLightingEditor | null = null;
const smartSlot = ref<HTMLElement | null>(null);

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
    onGenerate: (cfg) => emit("generate", cfg),
  });
  smartSlot.value = editor.smartSlot;
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
watch(
  () => props.subjectImageUrl,
  (url) => {
    if (url && editor) editor.setSubjectImage(url);
  },
);

onBeforeUnmount(() => {
  editor?.destroy();
  editor = null;
  smartSlot.value = null;
});

defineExpose({
  api: (): CoreLightingEditor | null => editor,
});
</script>

<template>
  <div ref="host" data-aicut-lighting-host="">
    <Teleport v-if="smartSlot" :to="smartSlot">
      <slot name="smart" />
    </Teleport>
  </div>
</template>
