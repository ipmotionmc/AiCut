import {
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type CSSProperties,
  type Ref,
} from "react";
import {
  LightingEditor as CoreLightingEditor,
  type LightingConfig,
  type LightingEditorOptions,
  type LightingView,
} from "@aicut/core/lighting";
import type { Theme } from "@aicut/core";

export interface LightingEditorApi {
  setConfig(partial: Partial<LightingConfig>): void;
  getConfig(): LightingConfig;
  setSubjectImage(url: string): void;
  setView(v: LightingView): void;
  getView(): LightingView;
}

export interface LightingEditorProps {
  /** Initial subject image (URL or data URI). Reactive. */
  subjectImageUrl?: string;
  /** Initial config. */
  defaultConfig?: Partial<LightingConfig>;
  /** Initial view. Default `"perspective"`. */
  defaultView?: LightingView;
  /** Theme — reactive (calls editor.setTheme). */
  theme?: Theme;
  /** Locale partial — reactive (calls editor.setLocale). */
  locale?: LightingEditorOptions["locale"];

  className?: string;
  style?: CSSProperties;
  apiRef?: Ref<LightingEditorApi | null>;

  onChange?: (cfg: LightingConfig) => void;
}

/**
 * React shell for the 3D lighting picker. Renders scene + controls;
 * nothing else. Host code lays out their own surrounding UI (smart
 * mode panel, generate button, etc.) alongside this component in
 * whatever flex/grid the host prefers.
 */
export function LightingEditor(props: LightingEditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<CoreLightingEditor | null>(null);
  // Triggers a re-render the moment the editor is created, so the
  // useImperativeHandle factory below can return the real instance
  // instead of locking at null forever (same trick as VideoEditor).
  const [ready, setReady] = useState(false);

  const cbRef = useRef(props);
  cbRef.current = props;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const editor = CoreLightingEditor.create({
      container: host,
      subjectImageUrl: cbRef.current.subjectImageUrl,
      config: cbRef.current.defaultConfig,
      view: cbRef.current.defaultView,
      theme: cbRef.current.theme,
      locale: cbRef.current.locale,
      onChange: (cfg) => cbRef.current.onChange?.(cfg),
    });
    editorRef.current = editor;
    setReady(true);
    return () => {
      editor.destroy();
      editorRef.current = null;
      setReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (props.theme) editorRef.current?.setTheme(props.theme);
  }, [props.theme]);
  useEffect(() => {
    // Always push — `undefined` is the "reset to English defaults"
    // signal. Without this, toggling ZH→EN in the host kept ZH labels.
    editorRef.current?.setLocale(props.locale ?? {});
  }, [props.locale]);
  useEffect(() => {
    if (props.subjectImageUrl)
      editorRef.current?.setSubjectImage(props.subjectImageUrl);
  }, [props.subjectImageUrl]);

  useImperativeHandle<LightingEditorApi | null, LightingEditorApi | null>(
    props.apiRef,
    () => {
      const ed = editorRef.current;
      if (!ed) return null;
      return {
        setConfig: (p) => ed.setConfig(p),
        getConfig: () => ed.getConfig(),
        setSubjectImage: (url) => ed.setSubjectImage(url),
        setView: (v) => ed.setView(v),
        getView: () => ed.getView(),
      };
    },
    [ready],
  );

  return (
    <div
      ref={hostRef}
      className={props.className}
      style={props.style}
      data-aicut-lighting-host=""
    />
  );
}
