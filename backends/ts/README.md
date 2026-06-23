# @aicut/backend-ts

Reference TypeScript export backend for **[@aicut/core](https://www.npmjs.com/package/@aicut/core)**. Receives a Project JSON, renders to mp4 via ffmpeg, **streams progress over Server-Sent Events**, and serves the finished file. Not published to npm — it's a reference implementation you copy or run locally next to the editor.

The Go sibling at [`backends/go`](../go) implements the exact same wire contract on port 8788.

## Setup

```bash
pnpm install

# Provide an ffmpeg binary — three options, checked in order:
#   1. export AICUT_FFMPEG=/abs/path/to/ffmpeg
#   2. drop a binary at ./ffmpeg-bin/ffmpeg (must be +x)
#   3. install ffmpeg system-wide so `ffmpeg` is on $PATH

pnpm dev      # http://127.0.0.1:8787
```

## API

### `POST /export`

Streams the export job as `text/event-stream`. Each event is `data: <json>\n\n`; the client uses `fetch` + `ReadableStream` to consume it (`EventSource` doesn't accept POST bodies).

```
Content-Type: application/json
Body: {
  "project": { "version": 1, "sources": [...], "tracks": [...] },
  "output":  { "width": 1920, "height": 1080, "fps": 30 }   // optional
}
```

Event stream:

```
data: {"phase":"encode","overall":0.42,"clipIndex":0,"totalClips":3}
data: {"phase":"encode","overall":0.78,"clipIndex":1,"totalClips":3}
data: {"phase":"concat","overall":0.99,"totalClips":3}
data: {"phase":"done","fileUrl":"/files/<uuid>.mp4","id":"<uuid>"}
: ping                  ← heartbeat every 15s
data: {"phase":"error","error":"…"}
```

`overall` is the global progress fraction, weighted by clip durations. `out_time_us` from ffmpeg's `-progress` stream is the source of truth (unambiguous microseconds across ffmpeg versions).

Aborting the client connection (or an `AbortController` on the fetch) cancels the in-flight ffmpeg via SIGTERM.

### `GET /files/<uuid>.mp4`

Streams the rendered video at `application/mp4`. Files are persisted to `./outputs/<uuid>.mp4` — clean them up with cron / LRU when you wire this for real.

### `GET /health`

`{ ok: true, backend: "ts" }`

## Approach

For each clip:

1. `ffmpeg -ss <in> -i <url> -t <dur>` → re-encode to a normalised `libx264` / `aac` mp4 segment, `+faststart`.
2. Stream `-progress pipe:1 -nostats` over STDOUT; the server parses `out_time_us` and aggregates against total project duration.

After all clips:

3. Build `concat.txt`, run `ffmpeg -f concat -c copy` to stitch (no re-encode).
4. `rename()` into `./outputs/<uuid>.mp4`; clean the per-job temp dir.

Re-encoding the per-clip pass sidesteps codec / GOP-alignment differences between sources at the cost of speed; a future iteration can stream-copy when sources match.

## Client example

See `examples/react-demo/src/App.tsx` in the repo — it does a one-round-trip fetch + manual SSE parser + progress bar + cancel button.

```ts
const res = await fetch("http://127.0.0.1:8787/export", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ project }),
  signal: abort.signal,
});
const reader = res.body!.getReader();
// … split on \n\n, JSON.parse each `data: …` line.
```
