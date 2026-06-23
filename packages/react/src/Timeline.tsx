import {
  useEffect,
  useImperativeHandle,
  useRef,
  type CSSProperties,
  type Ref,
} from "react";
import {
  Timeline as CoreTimeline,
  type Clip,
  type Ms,
  type Project,
  type TimelineOptions,
} from "@aicut/core";

/** Imperative handle exposed via `apiRef`. */
export interface TimelineApi {
  setProject(p: Project): void;
  getProject(): Project;
  setTime(t: Ms): void;
  getTime(): Ms;
  setScale(pxPerSec: number): void;
  getScale(): number;
  setSelection(id: string | null): void;
  getSelection(): string | null;
  setSnap(snap: boolean): void;
  fitToWindow(): void;
  getDebugInfo(): ReturnType<CoreTimeline["getDebugInfo"]>;
}

export interface TimelineProps {
  /** Initial project. Use `apiRef.current.setProject(...)` to swap. */
  defaultProject: Project;
  /** Initial scale (px/sec). Defaults to 80; auto-fits on first render. */
  defaultScale?: number;
  /** Initial playhead position. */
  defaultTime?: Ms;
  /** Initial selection. */
  defaultSelectedClipId?: string | null;

  /** Hide the left header column (compact / frame-picker mode). */
  showHeader?: boolean;
  /** Disable all editing interactions. */
  readOnly?: boolean;
  /** Snap to clip edges + playhead when dragging. Default true. */
  snap?: boolean;
  /** Apply fit-to-window on mount once duration is known. Default true. */
  autoFit?: boolean;

  className?: string;
  style?: CSSProperties;

  apiRef?: Ref<TimelineApi | null>;

  onSeek?: (timeMs: Ms) => void;
  onSelectClip?: (clipId: string | null) => void;
  onScaleChange?: (pxPerSec: number) => void;
  onMoveClip?: TimelineOptions["onMoveClip"];
  onResizeClip?: TimelineOptions["onResizeClip"];
  onChange?: (project: Project) => void;
}

/**
 * Standalone, framework-agnostic canvas Timeline wrapped for React.
 * Mount it without an `Editor` for use cases like a video frame-picker:
 *
 * ```tsx
 * <Timeline
 *   defaultProject={{ version: 1, sources: [video], tracks: [{ id, kind: "video", clips: [{...}] }] }}
 *   showHeader={false}
 *   readOnly
 *   onSeek={(ms) => setCurrentMs(ms)}
 * />
 * ```
 *
 * Uncontrolled for `project` and `pxPerSec` — the underlying Timeline
 * owns them and reports changes via callbacks. Call methods on
 * `apiRef.current` to drive it imperatively (mirroring ag-Grid /
 * VideoEditor patterns).
 */
export function Timeline(props: TimelineProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const tlRef = useRef<CoreTimeline | null>(null);

  // Latest-callback ref so the create-once effect doesn't tear the
  // timeline down on every render just because callback identities
  // change.
  const cbRef = useRef(props);
  cbRef.current = props;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const tl = CoreTimeline.create({
      container: host,
      project: cbRef.current.defaultProject,
      pxPerSec: cbRef.current.defaultScale,
      time: cbRef.current.defaultTime,
      selectedClipId: cbRef.current.defaultSelectedClipId ?? null,
      showHeader: cbRef.current.showHeader,
      readOnly: cbRef.current.readOnly,
      snap: cbRef.current.snap,
      autoFit: cbRef.current.autoFit,
      onSeek: (t) => cbRef.current.onSeek?.(t),
      onSelectClip: (id) => cbRef.current.onSelectClip?.(id),
      onScaleChange: (s) => cbRef.current.onScaleChange?.(s),
      onMoveClip: (id, opts) => cbRef.current.onMoveClip?.(id, opts),
      onResizeClip: (id, e) => cbRef.current.onResizeClip?.(id, e),
      onChange: (p) => cbRef.current.onChange?.(p),
    });
    tlRef.current = tl;
    return () => {
      tl.destroy();
      tlRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useImperativeHandle<TimelineApi | null, TimelineApi | null>(
    props.apiRef,
    () => {
      const tl = tlRef.current;
      if (!tl) return null;
      return {
        setProject: (p) => tl.setProject(p),
        getProject: () => tl.getProject(),
        setTime: (t) => tl.setTime(t),
        getTime: () => tl.getTime(),
        setScale: (s) => tl.setScale(s),
        getScale: () => tl.getScale(),
        setSelection: (id) => tl.setSelection(id),
        getSelection: () => tl.getSelection(),
        setSnap: (s) => tl.setSnap(s),
        fitToWindow: () => tl.fitToWindow(),
        getDebugInfo: () => tl.getDebugInfo(),
      };
    },
    [],
  );

  return (
    <div
      ref={hostRef}
      className={props.className}
      style={{ width: "100%", height: 240, ...props.style }}
      data-aicut-timeline-host=""
    />
  );

  // Type-only re-export used to keep React/Vue prop typings in lockstep
  // with the core. Reference here so the symbol isn't tree-shaken.
  void ({} as Clip);
}
