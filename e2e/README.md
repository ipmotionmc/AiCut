# @aicut/e2e

Playwright end-to-end tests, run against the React demo app.

```bash
pnpm install
pnpm --filter @aicut/e2e exec playwright install chrome   # one-time, only if you don't have Chrome already
pnpm --filter @aicut/e2e test
```

Notes:

- Uses **system Chrome** (`channel: 'chrome'`), not Playwright's bundled Chromium, per local preference.
- Launches Chrome with `--no-proxy-server` and `--proxy-bypass-list=*` and `delete`s `http_proxy` / `all_proxy` env vars at config load — bypasses any system proxy (e.g. 127.0.0.1:15236) so the demo at 127.0.0.1:5173 and the test videos at 127.0.0.1:8091 go direct.
- `editor-smoke.spec.ts` is network-free (won't depend on the test videos loading). `editor-cut.spec.ts` does need network access.
- Tests interact only via the rendered DOM of the demo — they never import the library packages, keeping the published surface clean.
