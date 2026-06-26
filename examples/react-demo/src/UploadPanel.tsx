import {
  useCallback,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
} from "react";
import { useToast } from "./Toast.js";

export interface UploadResult {
  /** Public URL the editor stores in `sources[].url`. Either an
   *  uploaded http URL (server mode) or a `blob:` URL (local mode). */
  url: string;
  /** Original filename — used for the source's display name. */
  name: string;
  /** Probed duration in ms (best-effort via <video> metadata). */
  durationMs?: number;
  /** True when the URL is a local `blob:` URL — the backend can't
   *  open these, so the export-side knows to surface a hint. */
  isLocal: boolean;
}

interface Props {
  uploadEndpoint: string | null;
  onUploaded: (r: UploadResult) => void;
  /** Where the next dropped file will land — drives the badge below
   *  the drop zone. `mainTrackIndex: 0` means "track 1, primary";
   *  anything else implies a PiP overlay slot, and the badge tells
   *  the user that's the case so they're not surprised. */
  nextTrackIndex?: number;
  /** Total number of video tracks in the project — used to format
   *  the "Track X / N" line. */
  videoTrackCount?: number;
}

/**
 * Sidebar upload widget. Click to browse OR drag-drop a video file.
 *
 *   - `uploadEndpoint` set → POST multipart to it; expect JSON
 *     `{ url }` back. Stored URL is the server URL (backend-openable).
 *   - `uploadEndpoint` null → fall back to `URL.createObjectURL` for
 *     a local `blob:` URL (browser-playable, not backend-openable).
 *
 * Tries to probe the video's duration via a transient `<video>` so the
 * editor seeds an accurate clip length on first drop.
 */
export function UploadPanel({
  uploadEndpoint,
  onUploaded,
  nextTrackIndex,
  videoTrackCount,
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const toast = useToast();

  const handleFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith("video/") && !file.name.match(/\.(mp4|mov|m4v|webm|mkv|avi)$/i)) {
        toast.push(`不支持的文件类型：${file.type || file.name}`, {
          variant: "error",
        });
        return;
      }
      setBusy(true);
      try {
        let url: string;
        let isLocal: boolean;
        if (uploadEndpoint) {
          const form = new FormData();
          form.append("file", file, file.name);
          const res = await fetch(uploadEndpoint, {
            method: "POST",
            body: form,
          });
          if (!res.ok) {
            throw new Error(`Upload failed: HTTP ${res.status}`);
          }
          const data = (await res.json()) as { url?: string };
          if (!data.url) {
            throw new Error("Upload response missing `url` field");
          }
          url = data.url;
          isLocal = false;
        } else {
          url = URL.createObjectURL(file);
          isLocal = true;
          toast.push(
            "VITE_UPLOAD_ENDPOINT not set — using a local blob URL. Playable in this browser only, can't be exported.",
            { variant: "warn", duration: 5000 },
          );
        }
        const durationMs = await probeDuration(url).catch(() => undefined);
        onUploaded({ url, name: file.name, durationMs, isLocal });
        if (!isLocal) {
          toast.push(`Uploaded: ${file.name}`, { variant: "success" });
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        toast.push(`Upload error: ${msg}`, { variant: "error" });
      } finally {
        setBusy(false);
      }
    },
    [uploadEndpoint, onUploaded, toast],
  );

  const onDrop = (e: DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) void handleFile(file);
  };

  return (
    <div>
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        data-testid="demo-upload-zone"
        style={{
          ...zoneStyle,
          borderColor: dragOver
            ? "var(--color-brand, #9a31f4)"
            : "rgba(255, 255, 255, 0.18)",
          background: dragOver
            ? "rgba(154, 49, 244, 0.06)"
            : "transparent",
          opacity: busy ? 0.6 : 1,
          cursor: busy ? "wait" : "pointer",
        }}
      >
        <div style={{ fontWeight: 600, fontSize: 13 }}>
          {busy ? "Uploading…" : "Click or drag a video file"}
        </div>
        <div
          style={{
            fontSize: 11,
            opacity: 0.6,
            marginTop: 4,
            lineHeight: 1.5,
          }}
        >
          {uploadEndpoint
            ? `Upload endpoint set → POSTs to the backend`
            : `VITE_UPLOAD_ENDPOINT unset → local blob preview only`}
        </div>
        {nextTrackIndex != null && videoTrackCount != null ? (
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              marginTop: 8,
              padding: "2px 8px",
              fontSize: 10,
              letterSpacing: "0.02em",
              borderRadius: 999,
              border: "1px solid var(--aicut-controls-border, rgba(255,255,255,0.18))",
              background:
                nextTrackIndex > 0
                  ? "rgba(154, 49, 244, 0.16)"
                  : "transparent",
              color:
                nextTrackIndex > 0
                  ? "var(--color-brand, #9a31f4)"
                  : "var(--aicut-controls-text, rgba(255,255,255,0.6))",
            }}
          >
            {nextTrackIndex > 0 ? (
              <PipIcon />
            ) : (
              <MainTrackIcon />
            )}
            <span>
              Next → Track {nextTrackIndex + 1}
              {nextTrackIndex > 0 ? " (PiP overlay)" : ""}
            </span>
          </div>
        ) : null}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
          // Reset so picking the same file twice still fires.
          e.target.value = "";
        }}
      />
    </div>
  );
}

const zoneStyle: CSSProperties = {
  border: "1.5px dashed rgba(255, 255, 255, 0.18)",
  borderRadius: 10,
  padding: 14,
  textAlign: "center" as const,
  transition: "background-color 120ms ease, border-color 120ms ease",
  userSelect: "none" as const,
};

/** Probe a video URL's duration via a hidden <video>. */
function probeDuration(url: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    v.src = url;
    v.onloadedmetadata = () => {
      const ms = Math.round(v.duration * 1000);
      v.src = "";
      resolve(Number.isFinite(ms) && ms > 0 ? ms : 0);
    };
    v.onerror = () => reject(new Error("metadata probe failed"));
    // Some browsers need a brief tick before metadata fires; bail
    // after 5s rather than hanging forever.
    setTimeout(() => reject(new Error("metadata probe timeout")), 5000);
  });
}

/** Filmstrip-with-cut icon — main / first track. */
function MainTrackIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="1.5" y="3" width="13" height="10" rx="1.4" stroke="currentColor" strokeWidth="1.3" />
      <line x1="4" y1="5" x2="4" y2="11" stroke="currentColor" strokeWidth="1" />
      <line x1="12" y1="5" x2="12" y2="11" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

/** Picture-in-picture icon — outer frame with a smaller frame inset
 *  at the top-right corner. Mirrors the browser's native PiP glyph. */
function PipIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="1.5" y="2.5" width="13" height="11" rx="1.4" stroke="currentColor" strokeWidth="1.3" />
      <rect x="8" y="5.5" width="5.5" height="4.5" rx="0.8" fill="currentColor" opacity="0.8" />
    </svg>
  );
}
