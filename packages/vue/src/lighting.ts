/**
 * @iplex/aicut-vue/lighting — separate entry that pulls three.js.
 */
export { default as LightingEditor } from "./LightingEditor.vue";

export {
  DEFAULT_LIGHTING_CONFIG,
  PRESET_DIRECTIONS,
  lightingLocaleEn,
  lightingLocaleZh,
  mergeLightingLocale,
  snapToPreset,
} from "@iplex/aicut-core/lighting";
export type {
  KeyPreset,
  LightingConfig,
  LightingEditorOptions,
  LightingLocale,
  LightingView,
} from "@iplex/aicut-core/lighting";
