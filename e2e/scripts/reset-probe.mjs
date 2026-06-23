import { chromium } from "@playwright/test";

for (const k of ["http_proxy", "HTTP_PROXY", "https_proxy", "HTTPS_PROXY", "all_proxy", "ALL_PROXY"]) delete process.env[k];
process.env.NO_PROXY = "*";

const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--no-proxy-server", "--proxy-bypass-list=*"],
});
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));
await page.goto("http://127.0.0.1:5173/", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(5000);

const before = await page.evaluate(() => {
  const api = (window).__aicut?.api;
  const p = api.getProject();
  return {
    sources: p.sources.length,
    clips: p.tracks.reduce((n, t) => n + t.clips.length, 0),
    tracks: p.tracks.length,
    sourcesHaveDuration: p.sources.every(s => s.duration > 0),
  };
});
console.log("before reset:", before);

await page.locator(".aicut-root").screenshot({ path: "/tmp/aicut-before-reset.png" });

await page.getByTestId("aicut-reset").click();
await page.waitForTimeout(500);

const after = await page.evaluate(() => {
  const api = (window).__aicut?.api;
  const p = api.getProject();
  return {
    sources: p.sources.length,
    clips: p.tracks.reduce((n, t) => n + t.clips.length, 0),
    tracks: p.tracks.length,
    sourcesHaveDuration: p.sources.every(s => s.duration > 0),
  };
});
console.log("after reset:", after);

await page.locator(".aicut-root").screenshot({ path: "/tmp/aicut-after-reset.png" });
await browser.close();
