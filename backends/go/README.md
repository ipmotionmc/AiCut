# aicut-backend-go

Go port of the AiCut export backend. Same API contract as `@aicut/backend-ts` — the only difference is the implementation language and that it listens on port `8788` by default instead of `8787`, so both can coexist locally.

## Setup

```bash
# Provide an ffmpeg binary — three options, checked in order:
#   1. export AICUT_FFMPEG=/abs/path/to/ffmpeg
#   2. unzip the shared layer into ./ffmpeg-bin/
#   3. install ffmpeg system-wide so `ffmpeg` is on $PATH
unzip /Users/zzq/dev/Iplex.ai/iplex/infra/layers/ffmpeg.zip -d ./ffmpeg-bin
chmod +x ./ffmpeg-bin/ffmpeg

go run .
```

## API

`POST /export`

```json
{
  "project": { "version": 1, "sources": [...], "tracks": [...] },
  "output": { "width": 1920, "height": 1080, "fps": 30 }
}
```

Responds with `video/mp4` attachment. Temp directory is cleaned on response close.

`GET /health` → `{ "ok": true }`
