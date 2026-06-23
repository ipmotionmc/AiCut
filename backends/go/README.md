# aicut-backend-go

Go port of the AiCut export backend. Same SSE wire contract as **[`backends/ts`](../ts)** — the only difference is the implementation language and that it defaults to port `8788` so both can run side-by-side.

## Setup

```bash
# Provide an ffmpeg binary — three options, checked in order:
#   1. export AICUT_FFMPEG=/abs/path/to/ffmpeg
#   2. drop a binary at ./ffmpeg-bin/ffmpeg (must be +x)
#   3. install ffmpeg system-wide so `ffmpeg` is on $PATH

go run .      # http://127.0.0.1:8788
```

No third-party Go modules — everything is `net/http` + std.

## API

### `POST /export` → `text/event-stream`

```
Content-Type: application/json
Body: {
  "project": { "version": 1, "sources": [...], "tracks": [...] },
  "output":  { "width": 1920, "height": 1080, "fps": 30 }   // optional
}
```

Streams:

```
data: {"phase":"encode","overall":0.42,"clipIndex":0,"totalClips":3}
data: {"phase":"concat","overall":0.99,"totalClips":3}
data: {"phase":"done","fileUrl":"/files/<id>.mp4","id":"<id>"}
: ping                  ← heartbeat every 15s
data: {"phase":"error","error":"…"}
```

`overall` is the global progress fraction, weighted by clip durations. The server reads `out_time_us` from ffmpeg's `-progress pipe:1` output and aggregates against total project duration. Client `AbortController` (or socket close) cancels the underlying `exec.CommandContext` — ffmpeg gets SIGTERM.

### `GET /files/<id>.mp4`

Streams `video/mp4`. Files persist to `./outputs/<id>.mp4`; LRU / cron up to you.

### `GET /health`

`{ ok: true, backend: "go" }`

## Approach

Matches the TS reference exactly — per-clip `libx264`/`aac` re-encode, then `-f concat -c copy` to stitch. Re-encoding the first pass sidesteps codec / GOP-alignment differences between sources.

## File ID format

`[a-f0-9]{32}.mp4` (16 random bytes hex). The handler regex-checks this before touching the filesystem — paranoid sanity against path traversal even though the filepath join already blocks `..`.
