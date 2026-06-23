import {
  useEffect,
  useImperativeHandle,
  useRef,
  type CSSProperties,
  type Ref,
} from "react";
import {
  Editor,
  type EditorApi,
  type Ms,
  type Project,
  type Theme,
} from "@aicut/core";

export type VideoEditorApi = EditorApi;

export interface VideoEditorProps {
  /**
   * Initial project. Read once on mount — to swap projects after mount,
   * call `apiRef.current.setProject(...)` so React doesn't reinstantiate
   * the editor and lose playback state.
   */
  defaultProject?: Project;
  /** CSS variable overrides applied on mount and whenever this ref changes. */
  theme?: Theme;

  className?: string;
  style?: CSSProperties;

  /** Imperative handle for cut/seek/getProject/setProject/etc. */
  apiRef?: Ref<VideoEditorApi | null>;

  onReady?: (api: VideoEditorApi) => void;
  onChange?: (project: Project) => void;
  onExport?: (project: Project) => void;
  onTimeUpdate?: (timeMs: Ms) => void;
  onPlay?: () => void;
  onPause?: () => void;
  onSelectionChange?: (clipId: string | null) => void;
  onError?: (error: Error) => void;
}

/**
 * Declarative React shell over `@aicut/core` `Editor`. Mounts the
 * editor instance once, mirrors prop changes (`theme`) into it, and
 * forwards events as React-style callbacks.
 *
 * Intentionally uncontrolled for project state — the editor owns the
 * current project. Use `onChange` to persist and `apiRef.setProject`
 * to restore.
 */
export function VideoEditor(props: VideoEditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<Editor | null>(null);

  // Latest-callback refs so the effect that creates the editor doesn't
  // re-run on every parent render just because props.onChange is a new
  // identity — the editor would otherwise be torn down constantly.
  const cbRef = useRef(props);
  cbRef.current = props;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const editor = Editor.create({
      container: host,
      project: cbRef.current.defaultProject,
      theme: cbRef.current.theme,
    });
    editorRef.current = editor;

    const offs = [
      editor.on("change", ({ project }) => cbRef.current.onChange?.(project)),
      editor.on("export", ({ project }) => cbRef.current.onExport?.(project)),
      editor.on("time", ({ timeMs }) => cbRef.current.onTimeUpdate?.(timeMs)),
      editor.on("play", () => cbRef.current.onPlay?.()),
      editor.on("pause", () => cbRef.current.onPause?.()),
      editor.on("selectionChange", ({ clipId }) =>
        cbRef.current.onSelectionChange?.(clipId),
      ),
      editor.on("error", ({ error }) => cbRef.current.onError?.(error)),
    ];

    cbRef.current.onReady?.(editor);

    return () => {
      for (const off of offs) off();
      editor.destroy();
      editorRef.current = null;
    };
    // Editor lifecycle is tied to mount; we deliberately don't list
    // any reactive deps. `theme` changes are pushed through the
    // separate effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (props.theme) editorRef.current?.setTheme(props.theme);
  }, [props.theme]);

  useImperativeHandle<VideoEditorApi | null, VideoEditorApi | null>(
    props.apiRef,
    () => editorRef.current,
    [],
  );

  return (
    <div
      ref={hostRef}
      className={props.className}
      style={props.style}
      data-aicut-host=""
    />
  );
}
