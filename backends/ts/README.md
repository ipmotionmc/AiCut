# @aicut/backend-ts

Reference TypeScript export backend. Receives a Project JSON from the editor's `onExport` event and renders it to a single mp4 via ffmpeg.

## Setup

```bash
pnpm install
# Provide an ffmpeg binary — three options, checked in order:
#   1. export AICUT_FFMPEG=/abs/path/to/ffmpeg
#   2. unzip the shared layer into ./ffmpeg-bin/
#      (so ./ffmpeg-bin/ffmpeg exists and is executable)
#   3. install ffmpeg system-wide so `ffmpeg` is on $PATH
unzip /Users/zzq/dev/Iplex.ai/iplex/infra/layers/ffmpeg.zip -d ./ffmpeg-bin
chmod +x ./ffmpeg-bin/ffmpeg
pnpm dev
```

## API

`POST /export`

```json
{
  "project": { "version": 1, "sources": [...], "tracks": [...] },
  "output": { "width": 1920, "height": 1080, "fps": 30 }
}
```

Returns the rendered `video/mp4` as an attachment. Temp files are cleaned up when the response stream closes.

`GET /health` → `{ ok: true }`

## Approach

Re-encodes each clip to a normalized H.264/AAC segment, then concat-demuxes the segments stream-copy. Re-encoding the per-clip pass sidesteps codec / GOP-alignment differences between sources at the cost of speed; a future iteration can stream-copy when sources match.
