import { defineConfig, devices } from "@playwright/test";

/**
 * E2E runs against the React demo app, not the library directly — this
 * keeps the published packages (`@iplex/aicut-core`, `@iplex/aicut-react`, `@iplex/aicut-vue`)
 * free of any test-only props or fixtures. See the project's
 * library-isolation note.
 *
 * Chrome: uses the system Chrome (`channel: 'chrome'`) per local
 * preference rather than Playwright's bundled Chromium. We aggressively
 * disable proxying because this machine has a system HTTP proxy at
 * 127.0.0.1:15236 (with corresponding `http_proxy` / `all_proxy` env
 * vars) that Chrome would otherwise route through — both the demo at
 * 127.0.0.1:5173 and the local test videos at 127.0.0.1:8091 must go
 * direct. Three layers, because any one of them alone has historically
 * lost to system-level Chrome policy:
 *   1. unset the proxy env vars before spawning anything
 *   2. `--no-proxy-server` Chromium flag (canonical opt-out)
 *   3. `--proxy-bypass-list=*` belt-and-suspenders catch-all
 */
for (const k of [
  "http_proxy",
  "HTTP_PROXY",
  "https_proxy",
  "HTTPS_PROXY",
  "all_proxy",
  "ALL_PROXY",
  "socks_proxy",
  "SOCKS_PROXY",
]) {
  delete process.env[k];
}
process.env["NO_PROXY"] = "*";
process.env["no_proxy"] = "*";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chrome",
      use: {
        ...devices["Desktop Chrome"],
        channel: "chrome",
        launchOptions: {
          args: ["--no-proxy-server", "--proxy-bypass-list=*"],
        },
      },
    },
  ],
  webServer: {
    command: "pnpm --filter @iplex/aicut-react-demo dev",
    cwd: "..",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: !process.env["CI"],
    timeout: 60_000,
    stdout: "pipe",
    stderr: "pipe",
  },
  timeout: 60_000,
  expect: { timeout: 10_000 },
});
