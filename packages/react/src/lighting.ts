/**
 * @aicut/react/lighting — separate entry that pulls three.js. Users
 * who never import this path don't pay the three.js bundle cost.
 */
export { LightingEditor } from "./LightingEditor.js";
export type {
  LightingEditorProps,
  LightingEditorApi,
} from "./LightingEditor.js";

// Re-export the data + locale exports from the core sub-entry so
// hosts only need a single import line for everything lighting-related.
export {
  DEFAULT_LIGHTING_CONFIG,
  PRESET_DIRECTIONS,
  lightingLocaleEn,
  lightingLocaleZh,
  mergeLightingLocale,
  snapToPreset,
} from "@aicut/core/lighting";
export type {
  KeyPreset,
  LightingConfig,
  LightingEditorOptions,
  LightingLocale,
  LightingView,
} from "@aicut/core/lighting";
