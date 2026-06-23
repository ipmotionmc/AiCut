import { chromium } from "@playwright/test";

for (const k of ["http_proxy", "HTTP_PROXY", "https_proxy", "HTTPS_PROXY", "all_proxy", "ALL_PROXY"]) {
  delete process.env[k];
}
process.env.NO_PROXY = "*";

const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--no-proxy-server", "--proxy-bypass-list=*"],
});
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await ctx.newPage();
await page.goto("http://127.0.0.1:5173/", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(5000);
await page.locator(".aicut-root").screenshot({ path: "/tmp/aicut-dark.png" });
console.log("dark saved");
await page.getByTestId("demo-theme-toggle").click();
await page.waitForTimeout(400);
await page.locator(".aicut-root").screenshot({ path: "/tmp/aicut-light.png" });
console.log("light saved");
await browser.close();
