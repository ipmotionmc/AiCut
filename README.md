# AiCut

Video editor component library. Framework-agnostic core (`@aicut/core`) with thin React (`@aicut/react`) and Vue (`@aicut/vue`) wrappers — same shape as ag-Grid: one engine, framework-specific shells. The core ships a vanilla DOM UI; wrappers just mount it and forward events.

## Workspace layout

```
packages/
  core/         @aicut/core   — Editor + data model + HTML5 video PlaybackEngine + vanilla DOM UI
  react/        @aicut/react  — React component over core
  vue/          @aicut/vue    — Vue 3 component over core
examples/
  react-demo/   Vite demo wired to two public test videos
e2e/            Playwright tests (system Chrome, no-proxy)
backends/
  ts/           Fastify + Node export service
  go/           net/http + Go export service
```

The library packages publish to npm. The `examples/`, `e2e/`, and `backends/` directories do not — they exist to exercise and validate the library.

## Quick start

```bash
pnpm install
pnpm build           # builds @aicut/core, /react, /vue
pnpm demo:react      # starts the demo at http://127.0.0.1:5173
pnpm test:e2e        # runs Playwright against the demo (needs Chrome installed)
```

## Component contract

Inputs (props): `defaultProject` (sources + tracks + clips), `theme` (CSS variable overrides).

Outputs (events): `onChange(project)`, `onExport(project)`, `onTimeUpdate(ms)`, `onPlay`, `onPause`, `onSelectionChange(clipId)`, `onError`, `onReady(api)`.

Imperative API (via `apiRef` in React, `defineExpose` in Vue):
`play / pause / togglePlay / seek / cut / removeClip / addSource / setProject / getProject / setTheme / destroy`

Save/restore: persist `getProject()`'s JSON, then `setProject(json)` to restore. The data model is plain JSON with millisecond timing — no framework or runtime coupling.

## Playback (v1)

Pure HTML5 `<video>` element stack — one hidden video per source kept warm, the active one swapped in when the playhead crosses a clip boundary. The bundled demo expects two local test files served at:
- http://localhost:8091/a.mov
- http://localhost:8091/b.mov

Frame-accurate seek / multi-track compositing / transitions are deferred to a future Canvas/WebGL preview engine.

## Theming

Pure CSS variables, namespaced `--aicut-*`. No Tailwind dependency in the library. The defaults mirror the brand palette referenced in `/Users/zzq/dev/Iplex.ai/iplex/packages/ipvise-frontend/src/app/globals.css` — pass a `theme` prop or write CSS overriding `.aicut-root` to swap them out.

## Export backends

Both `backends/ts` and `backends/go` accept the same JSON shape:

```json
POST /export
{
  "project": { "version": 1, "sources": [...], "tracks": [...] },
  "output": { "width": 1920, "height": 1080, "fps": 30 }
}
```

Both shell out to `ffmpeg`. Resolution order:
1. `AICUT_FFMPEG` env var
2. `./ffmpeg-bin/ffmpeg` relative to the backend
3. system `ffmpeg`

The provided binary at `/Users/zzq/dev/Iplex.ai/iplex/infra/layers/ffmpeg.zip` can be unzipped into either backend's `ffmpeg-bin/` directory:

```bash
unzip /Users/zzq/dev/Iplex.ai/iplex/infra/layers/ffmpeg.zip -d backends/ts/ffmpeg-bin
chmod +x backends/ts/ffmpeg-bin/ffmpeg
```

The component itself **does not call any backend** — `onExport` just hands the project JSON to the host app, which decides whether to POST to the TS or Go service (or anything else).

## E2E

Playwright with `channel: 'chrome'` (system Chrome, not bundled Chromium) and `--no-proxy-server`. Smoke tests cover editor mount + reset; the network-dependent suite covers the play/cut/export round-trip against the test videos.

```bash
pnpm test:e2e            # headless
pnpm --filter @aicut/e2e test:headed   # debug visually
```

## Release

```bash
pnpm changeset      # record version bump
pnpm release        # build + publish
```

The three library packages (`@aicut/core`, `@aicut/react`, `@aicut/vue`) are pinned together via the `fixed` group in `.changeset/config.json`.
