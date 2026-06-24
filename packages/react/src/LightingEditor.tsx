import {
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type Ref,
} from "react";
import { createPortal } from "react-dom";
import {
  LightingEditor as CoreLightingEditor,
  type LightingConfig,
  type LightingEditorOptions,
  type LightingView,
} from "@aicut/core/lighting";
import type { Theme } from "@aicut/core";

/**
 * Imperative handle. Mirrors the core class's mutating surface, plus
 * a `requestGenerate()` shortcut so host buttons inside the smart slot
 * don't need to thread the api ref to fire onGenerate.
 */
export interface LightingEditorApi {
  setConfig(partial: Partial<LightingConfig>): void;
  getConfig(): LightingConfig;
  setSubjectImage(url: string): void;
  setView(v: LightingView): void;
  getView(): LightingView;
  setSmartEnabled(enabled: boolean): void;
  isSmartEnabled(): boolean;
  setSmartOpen(open: boolean): void;
  isSmartOpen(): boolean;
  requestGenerate(): void;
}

export interface LightingEditorProps {
  /** Initial subject image (URL or data URI). */
  subjectImageUrl?: string;
  /** Initial config. */
  defaultConfig?: Partial<LightingConfig>;
  /** Initial view. Default `"perspective"`. */
  defaultView?: LightingView;
  /** Theme — reactive (calls editor.setTheme). */
  theme?: Theme;
  /** Locale partial — reactive (calls editor.setLocale). */
  locale?: LightingEditorOptions["locale"];

  /**
   * Any React node — portaled into the editor's smart slot. Host uses
   * this for prompt textarea, preset grid, generate button, anything.
   * The library renders nothing into the slot until you populate it.
   */
  smartPanel?: ReactNode;
  /**
   * Whether the Smart mode feature is wired in at all. When false,
   * the column AND the controls-header toggle disappear — leaving a
   * clean 2-col scene + controls layout. Default `true`. Reactive.
   */
  smartEnabled?: boolean;
  /**
   * When `smartEnabled`, whether the slot drawer starts open. Reactive
   * — flips re-fire the editor's `setSmartOpen` so the panel slides
   * in/out. Default `true`.
   */
  smartOpen?: boolean;

  className?: string;
  style?: CSSProperties;
  apiRef?: Ref<LightingEditorApi | null>;

  onChange?: (cfg: LightingConfig) => void;
  onGenerate?: (cfg: LightingConfig) => void;
  /** Fires when the user clicks × or the Smart mode header toggle. */
  onSmartOpenChange?: (open: boolean) => void;
}

export function LightingEditor(props: LightingEditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<CoreLightingEditor | null>(null);
  // smart slot DOM node — set once the editor mounts; gates the portal.
  const [slot, setSlot] = useState<HTMLElement | null>(null);

  // Stable closure for callbacks the core only ever subscribes to once.
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
      smartEnabled: cbRef.current.smartEnabled,
      smartOpen: cbRef.current.smartOpen,
      theme: cbRef.current.theme,
      locale: cbRef.current.locale,
      onChange: (cfg) => cbRef.current.onChange?.(cfg),
      onGenerate: (cfg) => cbRef.current.onGenerate?.(cfg),
      onSmartOpenChange: (open) =>
        cbRef.current.onSmartOpenChange?.(open),
    });
    editorRef.current = editor;
    setSlot(editor.smartSlot);
    return () => {
      editor.destroy();
      editorRef.current = null;
      setSlot(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reactive prop mirror — theme + locale + subject only. Config /
  // view are owned by the editor instance after mount; host should
  // use `apiRef.current?.setConfig(…)` to push them.
  useEffect(() => {
    if (props.theme) editorRef.current?.setTheme(props.theme);
  }, [props.theme]);
  useEffect(() => {
    // Always push — `undefined` is the "reset to English defaults"
    // signal. Previously the `if (props.locale)` guard meant that
    // toggling ZH→EN in the host kept the ZH labels in place.
    editorRef.current?.setLocale(props.locale ?? {});
  }, [props.locale]);
  useEffect(() => {
    if (props.subjectImageUrl)
      editorRef.current?.setSubjectImage(props.subjectImageUrl);
  }, [props.subjectImageUrl]);

  useEffect(() => {
    if (props.smartEnabled !== undefined)
      editorRef.current?.setSmartEnabled(props.smartEnabled);
  }, [props.smartEnabled]);
  useEffect(() => {
    if (props.smartOpen !== undefined)
      editorRef.current?.setSmartOpen(props.smartOpen);
  }, [props.smartOpen]);

  // Keyed on `slot` for the same reason VideoEditor's apiRef is —
  // useImperativeHandle's factory runs in the commit phase BEFORE
  // useEffect, so with `[]` deps the ref locks to null forever.
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
        setSmartEnabled: (en) => ed.setSmartEnabled(en),
        isSmartEnabled: () => ed.isSmartEnabled(),
        setSmartOpen: (open) => ed.setSmartOpen(open),
        isSmartOpen: () => ed.isSmartOpen(),
        requestGenerate: () => ed.requestGenerate(),
      };
    },
    [slot],
  );

  return (
    <div
      ref={hostRef}
      className={props.className}
      style={props.style}
      data-aicut-lighting-host=""
    >
      {slot && props.smartPanel != null
        ? createPortal(props.smartPanel, slot)
        : null}
    </div>
  );
}
