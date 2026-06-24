import { useEffect, useMemo, useRef, useState } from "react";
import {
  LightingEditor,
  lightingLocaleZh,
  type LightingConfig,
  type LightingEditorApi,
  type LightingView,
} from "@aicut/react/lighting";
import { localeZh, type Theme } from "@aicut/react";

const THEMES: Record<"dark" | "light", Theme> = {
  dark: {
    controlsBg: "#1f1f22",
    controlsBorder: "rgba(255, 255, 255, 0.08)",
    controlsText: "rgba(255, 255, 255, 0.85)",
    controlsHover: "rgba(255, 255, 255, 0.08)",
    controlsActive: "rgba(255, 255, 255, 0.12)",
  },
  light: {
    controlsBg: "#f6f6f8",
    controlsBorder: "rgba(0, 0, 0, 0.08)",
    controlsText: "rgba(0, 0, 0, 0.78)",
    controlsHover: "rgba(0, 0, 0, 0.06)",
    controlsActive: "rgba(0, 0, 0, 0.08)",
  },
};

/**
 * Demo page for the @aicut/react LightingEditor sub-entry. Shows how
 * a host wires:
 *   - the subject image (from public/lighting-samples/subject.jpg);
 *   - a custom `smartPanel` (prompt + presets + generate button);
 *   - the `onChange` + `onGenerate` events into a live JSON sidebar.
 *
 * The library renders nothing in the smart slot until this component
 * portals its UI in — that's the contract.
 */

interface Preset {
  id: string;
  name: string;
  config: Partial<LightingConfig>;
}

const PRESETS: Preset[] = [
  { id: "rembrandt", name: "Rembrandt", config: { keyDirection: { x: -0.7, y: 0.7, z: 0.3 }, brightness: 0.5, color: "#fff2d6" } },
  { id: "blue-back", name: "Blue back-light", config: { keyDirection: { x: 0.2, y: 0.1, z: -1 }, brightness: 0.8, color: "#5b8cff", rim: true } },
  { id: "overexposed", name: "Overexposed film", config: { keyDirection: { x: 0, y: 0, z: 1 }, brightness: 1, color: "#ffffff" } },
  { id: "cyberpunk", name: "Cyberpunk", config: { keyDirection: { x: -0.5, y: -0.3, z: 0.8 }, brightness: 0.75, color: "#ff44ff", rim: true } },
  { id: "sunset", name: "Sunset", config: { keyDirection: { x: 0.9, y: 0.2, z: 0.3 }, brightness: 0.65, color: "#ffaa3a" } },
  { id: "noir", name: "Noir", config: { keyDirection: { x: -0.9, y: 0.3, z: 0.2 }, brightness: 0.25, color: "#dddddd", rim: true } },
  { id: "golden-hour", name: "Golden hour", config: { keyDirection: { x: -0.8, y: 0.4, z: 0.4 }, brightness: 0.6, color: "#ffcf6e" } },
  { id: "cool-grey", name: "Cool grey", config: { keyDirection: { x: 0, y: 0.5, z: 0.8 }, brightness: 0.5, color: "#c8d2dc" } },
];

const SUBJECT_URL = "/lighting-samples/subject.jpg";

export function LightingDemo() {
  const apiRef = useRef<LightingEditorApi | null>(null);
  const [config, setConfig] = useState<LightingConfig | null>(null);
  const [view, setView] = useState<LightingView>("perspective");
  const [prompt, setPrompt] = useState("");
  const [subject, setSubject] = useState<string>(SUBJECT_URL);
  const [language, setLanguage] = useState<"en" | "zh">("en");
  const [themeName, setThemeName] = useState<"dark" | "light">("dark");
  const [smartEnabled, setSmartEnabled] = useState(true);
  const [smartOpen, setSmartOpen] = useState(true);
  const [lastGenerated, setLastGenerated] = useState<LightingConfig | null>(
    null,
  );

  // Merge BOTH locale shapes — video editor strings + lighting strings.
  // Passing only `localeZh` would leave the lighting tooltips in English.
  const locale = useMemo(
    () =>
      language === "zh"
        ? { ...localeZh, ...lightingLocaleZh }
        : undefined,
    [language],
  );
  const theme = useMemo(() => THEMES[themeName], [themeName]);

  // Whenever the user picks a preset, push it into the editor and let
  // its onChange fire the local state update — keeps a single source.
  const applyPreset = (p: Preset): void => {
    apiRef.current?.setConfig(p.config);
  };

  // File upload: read as data URL so we don't depend on a backend.
  useEffect(() => {
    return () => {
      // Revoke any object URLs we'd allocated. Currently using data
      // URIs (FileReader.readAsDataURL) so nothing to revoke, but
      // leaving the hook in place documents the intent.
    };
  }, []);

  const onUploadSubject = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      const url = String(r.result);
      setSubject(url);
      apiRef.current?.setSubjectImage(url);
    };
    r.readAsDataURL(f);
  };

  const smartPanel = (
    <div className="ldemo-smart">
      <h3 className="ldemo-smart-title">Smart mode</h3>
      <textarea
        className="ldemo-smart-textarea"
        placeholder="Describe the lighting / mood you want…"
        rows={3}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
      />
      <label className="ldemo-smart-upload">
        <input
          type="file"
          accept="image/*"
          onChange={onUploadSubject}
          style={{ display: "none" }}
        />
        <span>↑ Upload subject</span>
      </label>
      <div className="ldemo-smart-preset-title">Presets</div>
      <div className="ldemo-smart-preset-grid">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            className="ldemo-smart-preset"
            onClick={() => applyPreset(p)}
            title={p.name}
            data-testid={`ldemo-preset-${p.id}`}
          >
            <span
              className="ldemo-smart-preset-swatch"
              style={{ background: String(p.config.color ?? "#888") }}
            />
            <span className="ldemo-smart-preset-name">{p.name}</span>
          </button>
        ))}
      </div>
      <button
        type="button"
        className="ldemo-generate"
        onClick={() => apiRef.current?.requestGenerate()}
        data-testid="ldemo-generate"
      >
        Generate
      </button>
    </div>
  );

  return (
    <div className="lighting-shell">
      <div className="lighting-editor-area">
        <LightingEditor
          apiRef={apiRef}
          subjectImageUrl={subject}
          defaultView={view}
          locale={locale}
          theme={theme}
          smartEnabled={smartEnabled}
          smartOpen={smartOpen}
          smartPanel={smartPanel}
          onChange={(cfg) => setConfig(cfg)}
          onGenerate={(cfg) => setLastGenerated(cfg)}
          onSmartOpenChange={(open) => setSmartOpen(open)}
        />
      </div>
      <aside className="lighting-sidebar">
        <h2>Theme</h2>
        <div className="demo-row">
          <button
            type="button"
            data-testid="ldemo-theme-toggle"
            onClick={() =>
              setThemeName(themeName === "dark" ? "light" : "dark")
            }
          >
            {themeName === "dark" ? "Switch to Light" : "Switch to Dark"}
          </button>
        </div>

        <h2>Language</h2>
        <div className="demo-row">
          <button
            type="button"
            data-testid="ldemo-locale-toggle"
            onClick={() => setLanguage(language === "en" ? "zh" : "en")}
          >
            {language === "en" ? "Switch to 中文" : "Switch to English"}
          </button>
        </div>

        <h2>Smart mode</h2>
        <div className="demo-row demo-checkbox-row">
          <label>
            <input
              type="checkbox"
              data-testid="ldemo-smart-enabled"
              checked={smartEnabled}
              onChange={(e) => setSmartEnabled(e.target.checked)}
            />
            <span>Enable smart mode</span>
          </label>
          <label>
            <input
              type="checkbox"
              data-testid="ldemo-smart-open"
              checked={smartOpen}
              disabled={!smartEnabled}
              onChange={(e) => setSmartOpen(e.target.checked)}
            />
            <span>Drawer open</span>
          </label>
        </div>

        <h2>View</h2>
        <div className="demo-row">
          <button
            type="button"
            onClick={() => {
              const next: LightingView =
                view === "perspective" ? "front" : "perspective";
              setView(next);
              apiRef.current?.setView(next);
            }}
          >
            Toggle ({view})
          </button>
        </div>

        <h2>Live config</h2>
        <pre className="lighting-state" data-testid="ldemo-config-json">
{config ? JSON.stringify(config, null, 2) : "(drag the dot or pick a preset)"}
        </pre>

        <h2>Last generate payload</h2>
        <pre className="lighting-state" data-testid="ldemo-generated-json">
{lastGenerated
  ? JSON.stringify(lastGenerated, null, 2)
  : "(click Generate inside the smart panel)"}
        </pre>

        <h2>Prompt (host state)</h2>
        <pre className="lighting-state">{prompt || "(empty)"}</pre>
      </aside>
    </div>
  );
}
