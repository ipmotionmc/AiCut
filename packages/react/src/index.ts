export { VideoEditor } from "./VideoEditor.js";
export type { VideoEditorProps, VideoEditorApi } from "./VideoEditor.js";
export { Timeline } from "./Timeline.js";
export type { TimelineProps, TimelineApi } from "./Timeline.js";
export type {
  Project,
  MediaSource,
  Track,
  Clip,
  Ms,
  Theme,
  EditorApi,
  Locale,
  PlaybackEngine,
  PlaybackEngineFactory,
  PlaybackEngineOptions,
  CanvasCompositorEngineOptions,
} from "@aicut/core";
export {
  createEmptyProject,
  createId,
  localeEn,
  localeZh,
  HtmlVideoEngine,
  htmlVideoEngineFactory,
  CanvasCompositorEngine,
  canvasCompositorEngineFactory,
  // Live bindings — re-reading them after `setTimelineMetrics` (which
  // EditorOptions.trackHeight / .rulerHeight calls under the hood)
  // returns the updated values.
  TRACK_HEIGHT,
  RULER_HEIGHT,
  HEADER_WIDTH,
  setTimelineMetrics,
} from "@aicut/core";
