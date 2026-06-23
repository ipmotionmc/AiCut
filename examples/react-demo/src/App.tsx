import { useMemo, useRef, useState } from "react";
import {
  Timeline,
  VideoEditor,
  createEmptyProject,
  createId,
  type Project,
  type Theme,
  type TimelineApi,
  type VideoEditorApi,
} from "@aicut/react";

/**
 * Two reference themes the demo cycles through. The library itself
 * ships only the dark default; light mode is host-driven — exactly
 * the surface a real consumer would use.
 */
const THEMES: Record<"dark" | "light", Theme> = {
  // Both themes set every relevant variable explicitly so flipping
  // back from light → dark actually overrides the prior values
  // (setTheme only writes the keys we pass — it never clears CSS vars).
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

const SRC_A = {
  id: createId("src"),
  url: "http://localhost:8091/a.mov",
  kind: "video" as const,
  name: "a.mov",
};
const SRC_B = {
  id: createId("src"),
  url: "http://localhost:8091/b.mov",
  kind: "video" as const,
  name: "b.mov",
};

function seed(): Project {
  return {
    version: 1,
    sources: [SRC_A, SRC_B],
    tracks: [
      { id: createId("track"), kind: "video", clips: [] },
      // A second empty video track to demonstrate multi-track layout.
      // The host can drop clips into it via apiRef.moveClip(...) or
      // duplicate the seed logic.
      { id: createId("track"), kind: "video", clips: [] },
    ],
  };
}

const STORAGE_KEY = "aicut-demo-project";

/**
 * A separate, standalone Timeline driving a single-clip project — the
 * "frame picker" use case the host's other project needs. No editor,
 * no toolbar, no preview video; clicking the strip seeks and the host
 * displays the resulting timestamp.
 */
function FramePicker() {
  const [pickedMs, setPickedMs] = useState(0);
  const pickerRef = useRef<TimelineApi | null>(null);
  const sourceId = useMemo(() => createId("fp-src"), []);
  const project = useMemo<Project>(
    () => ({
      version: 1,
      sources: [
        {
          id: sourceId,
          url: "http://localhost:8091/a.mov",
          kind: "video",
          name: "a.mov",
        },
      ],
      tracks: [
        {
          id: createId("fp-track"),
          kind: "video",
          // out: 0 is the convention for "patch from metadata"; the
          // Timeline currently expects a real duration so we set a
          // large guess that gets visually corrected once the host
          // calls setProject with the real value (via api.setProject
          // after probing). For demo, a 60s guess works.
          clips: [
            {
              id: createId("fp-clip"),
              sourceId,
              in: 0,
              out: 60_000,
              start: 0,
            },
          ],
        },
      ],
    }),
    [sourceId],
  );
  return (
    <div className="demo-framepicker">
      <h2>Frame picker (standalone Timeline)</h2>
      <Timeline
        apiRef={pickerRef}
        defaultProject={project}
        showHeader={false}
        readOnly
        snap={false}
        autoFit
        style={{ height: 100 }}
        onSeek={(ms) => setPickedMs(ms)}
      />
      <div className="demo-state" data-testid="demo-framepicker-time">
        Picked: <code>{(pickedMs / 1000).toFixed(2)}s</code>
      </div>
    </div>
  );
}

export function App() {
  const apiRef = useRef<VideoEditorApi | null>(null);
  const [savedJson, setSavedJson] = useState("");
  const [exportJson, setExportJson] = useState("");
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [historyState, setHistoryState] = useState({ canUndo: false, canRedo: false });
  const [themeName, setThemeName] = useState<"dark" | "light">("dark");
  const theme = useMemo(() => THEMES[themeName], [themeName]);

  // Note: `onReady` is the right hook to expose the API to e2e via
  // window.__aicut — it fires synchronously on mount, BEFORE any
  // parent useEffect runs in React 19 strict mode (where parent
  // effects can race with the child mount). Putting this in a
  // separate useEffect was flaky under strict mode.

  return (
    <div className="demo-shell">
      <div className="demo-editor">
        <VideoEditor
          apiRef={apiRef}
          defaultProject={seed()}
          theme={theme}
          style={{ height: "100%" }}
          onReady={(api) => {
            // Expose the API for e2e immediately (canvas clips have
            // no DOM nodes to query).
            (window as unknown as { __aicut?: unknown }).__aicut = { api };
            api.on("selectionChange", ({ clipId }) =>
              setSelectedClipId(clipId),
            );
            api.on("historyChange", (h) => setHistoryState(h));

            // Build clips as each source's metadata resolves. The core
            // `ready` event fires per-source with the duration already
            // applied to `getProject().sources[].duration`.
            const seeded = new Set<string>();
            api.on("ready", ({ sourceId }) => {
              if (!sourceId || seeded.has(sourceId)) return;
              const project = api.getProject();
              const src = project.sources.find((s) => s.id === sourceId);
              if (!src?.duration) return;
              const track = project.tracks.find((t) => t.kind === "video");
              if (!track) return;
              const start = track.clips.reduce(
                (acc, c) => acc + (c.out - c.in),
                0,
              );
              track.clips.push({
                id: createId("clip"),
                sourceId: src.id,
                in: 0,
                out: src.duration,
                start,
              });
              seeded.add(sourceId);
              api.setProject(project);
            });
          }}
          onChange={(p) => setSavedJson(JSON.stringify(p, null, 2))}
          onExport={(p) => setExportJson(JSON.stringify(p, null, 2))}
        />
      </div>
      <aside className="demo-sidebar">
        <h2>Theme</h2>
        <div className="demo-row">
          <button
            type="button"
            data-testid="demo-theme-toggle"
            onClick={() => setThemeName(themeName === "dark" ? "light" : "dark")}
          >
            {themeName === "dark" ? "切换到 Light Studio" : "切换到 Pro Dark"}
          </button>
        </div>

        <h2>Persistence</h2>
        <div className="demo-row">
          <button
            type="button"
            data-testid="demo-save"
            onClick={() => {
              const project = apiRef.current?.getProject();
              if (project) localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
            }}
          >
            Save to localStorage
          </button>
          <button
            type="button"
            data-testid="demo-restore"
            onClick={() => {
              const raw = localStorage.getItem(STORAGE_KEY);
              if (raw) apiRef.current?.setProject(JSON.parse(raw) as Project);
            }}
          >
            Restore
          </button>
          <button
            type="button"
            data-testid="demo-reset"
            onClick={() => {
              apiRef.current?.setProject(createEmptyProject());
            }}
          >
            Reset (empty)
          </button>
        </div>

        <h2>State</h2>
        <div className="demo-state">
          <div>
            Selection: <code data-testid="demo-selected">{selectedClipId ?? "—"}</code>
          </div>
          <div>
            Undo: {historyState.canUndo ? "yes" : "no"} · Redo:{" "}
            {historyState.canRedo ? "yes" : "no"}
          </div>
        </div>

        <h2>Quick actions</h2>
        <div className="demo-row">
          <button
            type="button"
            data-testid="demo-add-track"
            onClick={() => apiRef.current?.addTrack("video")}
          >
            + Video track
          </button>
          <button
            type="button"
            data-testid="demo-move-to-track2"
            disabled={!selectedClipId}
            onClick={() => {
              const api = apiRef.current;
              if (!api || !selectedClipId) return;
              const project = api.getProject();
              const t2 = project.tracks[1];
              if (t2) api.moveClip(selectedClipId, { trackId: t2.id });
            }}
          >
            Selected → Track 2
          </button>
        </div>

        <h2>Shortcuts</h2>
        <ul className="demo-shortcuts">
          <li><kbd>Space</kbd> play / pause</li>
          <li><kbd>K</kbd> split at playhead</li>
          <li><kbd>Q</kbd> trim left to playhead</li>
          <li><kbd>W</kbd> trim right to playhead</li>
          <li><kbd>⌘Z</kbd> undo · <kbd>⌘⇧Z</kbd> redo</li>
          <li><kbd>Del</kbd> remove selected clip</li>
        </ul>

        <h2>Live project JSON</h2>
        <textarea
          className="demo-json"
          data-testid="demo-project-json"
          value={savedJson}
          readOnly
        />

        <h2>Last export payload</h2>
        <textarea
          className="demo-json"
          data-testid="demo-export-json"
          value={exportJson}
          readOnly
        />

        <FramePicker />
      </aside>
    </div>
  );
}
