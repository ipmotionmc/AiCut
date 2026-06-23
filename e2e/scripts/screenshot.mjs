import { chromium } from "@playwright/test";

// Clear proxy env (same as playwright.config.ts) so Chrome bypasses
// the system 127.0.0.1:15236 proxy.
for (const k of [
  "http_proxy",
  "HTTP_PROXY",
  "https_proxy",
  "HTTPS_PROXY",
  "all_proxy",
  "ALL_PROXY",
]) {
  delete process.env[k];
}
process.env.NO_PROXY = "*";

const url = process.argv[2] ?? "http://127.0.0.1:5173/";
const out = process.argv[3] ?? "screenshot.png";
const waitMs = Number(process.argv[4] ?? 3000);

// Headless system Chrome — headless never attaches to existing
// Chrome windows the user might have open with other apps (e.g.
// localhost:3000) which would otherwise composite into the shot.
const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--no-proxy-server", "--proxy-bypass-list=*"],
});
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));
page.on("console", (m) => {
  if (["error", "warning"].includes(m.type())) console.log(`PAGE ${m.type()}:`, m.text());
});
const resp = await page.goto(url, { waitUntil: "domcontentloaded" });
console.log("status:", resp?.status(), "final url:", page.url());
await page.waitForTimeout(waitMs);
const editorExists = await page.locator(".aicut-root").count();
console.log("aicut-root count:", editorExists);
if (editorExists > 0) {
  await page.locator(".aicut-root").screenshot({ path: out });
} else {
  await page.screenshot({ path: out });
}
const title = await page.title();
console.log(`saved ${out} (title: ${title})`);
await browser.close();
