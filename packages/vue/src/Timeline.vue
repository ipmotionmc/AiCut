<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import {
  Timeline as CoreTimeline,
  type Clip,
  type Locale,
  type Ms,
  type Project,
} from "@iplex/aicut-core";

/**
 * Standalone canvas Timeline wrapped for Vue 3. Same surface as the
 * React `<Timeline>`: pass `defaultProject`, drive imperatively via
 * the exposed `api()` ref.
 */
const props = defineProps<{
  defaultProject: Project;
  defaultScale?: number;
  defaultTime?: Ms;
  defaultSelectedClipId?: string | null;
  showHeader?: boolean;
  readOnly?: boolean;
  snap?: boolean;
  resizable?: boolean;
  autoFit?: boolean;
  locale?: Partial<Locale>;
}>();

const emit = defineEmits<{
  (e: "seek", timeMs: Ms): void;
  (e: "selectClip", clipId: string | null): void;
  (e: "scaleChange", pxPerSec: number): void;
  (e: "deleteClip", clipId: string): void;
  (e: "moveClip", clipId: string, opts: { start?: Ms; trackId?: string }): void;
  (
    e: "resizeClip",
    clipId: string,
    edits: Partial<Pick<Clip, "in" | "out" | "start">>,
  ): void;
  (e: "change", project: Project): void;
}>();

const host = ref<HTMLDivElement | null>(null);
let timeline: CoreTimeline | null = null;

onMounted(() => {
  if (!host.value) return;
  timeline = CoreTimeline.create({
    container: host.value,
    project: props.defaultProject,
    pxPerSec: props.defaultScale,
    time: props.defaultTime,
    selectedClipId: props.defaultSelectedClipId ?? null,
    showHeader: props.showHeader,
    readOnly: props.readOnly,
    snap: props.snap,
    resizable: props.resizable,
    autoFit: props.autoFit,
    locale: props.locale,
    onSeek: (t) => emit("seek", t),
    onSelectClip: (id) => emit("selectClip", id),
    onScaleChange: (s) => emit("scaleChange", s),
    onDeleteClip: (id) => emit("deleteClip", id),
    onMoveClip: (id, opts) => emit("moveClip", id, opts),
    onResizeClip: (id, edits) => emit("resizeClip", id, edits),
    onChange: (p) => emit("change", p),
  });
});

watch(
  () => props.locale,
  (locale) => {
    if (locale && timeline) timeline.setLocale(locale);
  },
);

onBeforeUnmount(() => {
  timeline?.destroy();
  timeline = null;
});

defineExpose({
  api: (): CoreTimeline | null => timeline,
});
</script>

<template>
  <div ref="host" data-aicut-timeline-host="" :style="{ width: '100%', height: '240px' }" />
</template>
