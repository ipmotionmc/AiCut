import { test, expect } from "@playwright/test";

test("lighting demo renders and interacts", async ({ page }) => {
  // Browser logs a generic "Failed to load resource" line for every
  // 404, with the URL in a separate location. Track actual failed
  // request URLs ourselves and skip cosmetic ones (favicon, etc.).
  const NOISE_URL = /favicon|\.well-known/i;
  const failedUrls: string[] = [];
  const pageErrors: string[] = [];
  page.on("response", (r) => {
    if (r.status() >= 400 && !NOISE_URL.test(r.url())) {
      failedUrls.push(`${r.status()} ${r.url()}`);
    }
  });
  page.on("pageerror", (err) => pageErrors.push(err.message));

  await page.goto("/#/lighting");

  // Wait for the scene viewport to appear
  await expect(page.getByTestId("aicut-lighting-scene")).toBeVisible({
    timeout: 10_000,
  });

  // Wait for the three.js canvas inside the viewport
  const canvas = page.locator(
    "[data-testid='aicut-lighting-scene'] canvas[data-aicut-lighting-canvas]",
  );
  await expect(canvas).toBeVisible();

  // Controls
  await expect(page.getByTestId("aicut-lighting-brightness")).toBeVisible();
  await expect(page.getByTestId("aicut-lighting-color")).toBeVisible();
  await expect(page.getByTestId("aicut-lighting-dir-front")).toBeVisible();
  await expect(page.getByTestId("aicut-lighting-rim")).toBeVisible();

  // Smart panel (host-supplied)
  await expect(page.getByTestId("ldemo-generate")).toBeVisible();
  await expect(page.getByTestId("ldemo-preset-rembrandt")).toBeVisible();

  // Click a preset, verify the active direction button updates
  await page.getByTestId("ldemo-preset-overexposed").click();
  await expect(page.getByTestId("aicut-lighting-dir-front")).toHaveClass(/active/);

  // Generate flow → JSON dump appears
  await page.getByTestId("ldemo-generate").click();
  const generated = await page
    .getByTestId("ldemo-generated-json")
    .innerText();
  expect(generated).toContain("brightness");
  expect(generated).toContain("keyDirection");

  // README hero shot — frame just the editor area (left column).
  // The dev sidebar to the right shows the JSON config dumps, which
  // are clutter for a marketing image.
  const editorArea = page.locator(".lighting-editor-area");
  await editorArea.screenshot({
    path: "/Users/zzq/dev/AiCut/docs/screenshots/lighting-editor.png",
  });

  expect(failedUrls, failedUrls.join("\n")).toEqual([]);
  expect(pageErrors, pageErrors.join("\n")).toEqual([]);
});
