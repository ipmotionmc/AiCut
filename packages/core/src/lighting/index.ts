/**
 * @iplex/aicut-core/lighting — opt-in 3D lighting picker.
 *
 * Pulls in three.js; importing this module is the cost. The main
 * `@iplex/aicut-core` entry never imports anything from here, so consumers
 * of the video editor pay nothing for this component.
 */

export { LightingEditor } from "./editor.js";
export {
  DEFAULT_LIGHTING_CONFIG,
  type KeyPreset,
  type LightingConfig,
  type LightingEditorOptions,
  type LightingView,
} from "./types.js";
export {
  lightingLocaleEn,
  lightingLocaleZh,
  mergeLightingLocale,
  type LightingLocale,
} from "./i18n.js";
export { PRESET_DIRECTIONS, snapToPreset } from "./presets.js";
