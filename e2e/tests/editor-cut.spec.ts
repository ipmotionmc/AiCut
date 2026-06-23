import { expect, test } from "@playwright/test";

/**
 * Network-dependent: requires http://localhost:8091/a.mov + b.mov to
 * be reachable from the test machine. Verifies play → split → export
 * round-trip and asserts on the project JSON since clips no longer
 * have DOM nodes in the canvas timeline.
 */

const clipCount = (page: import("@playwright/test").Page) =>
  page.evaluate(
    () =>
      (window as any).__aicut?.api
        .getProject()
        .tracks.reduce((n: number, t: any) => n + t.clips.length, 0) ?? 0,
  );

test("play, split, and export round-trip", async ({ page }) => {
  await page.goto("/");

  // Wait for the seed → ready event → setProject pass to populate at
  // least one clip in the project.
  await expect.poll(() => clipCount(page), { timeout: 20_000 }).toBeGreaterThan(0);

  // Start playback briefly so the playhead lands inside a clip.
  await page.getByTestId("aicut-play").click();
  await expect(page.getByTestId("aicut-play")).toHaveAttribute("data-state", "playing");
  await page.waitForTimeout(800);
  await page.getByTestId("aicut-play").click();
  await expect(page.getByTestId("aicut-play")).toHaveAttribute("data-state", "paused");

  const before = await clipCount(page);
  await page.getByTestId("aicut-split").click();
  await expect.poll(() => clipCount(page)).toBe(before + 1);

  // Demo's host-supplied export button — calls editor.requestExport()
  // which still fires the `export` event the demo listens to.
  await page.getByTestId("demo-export").click();
  const exportJson = await page.getByTestId("demo-export-json").inputValue();
  expect(exportJson.length).toBeGreaterThan(0);
  const parsed = JSON.parse(exportJson) as {
    version: number;
    tracks: Array<{ clips: unknown[] }>;
  };
  expect(parsed.version).toBe(1);
  const total = parsed.tracks.reduce((n, t) => n + t.clips.length, 0);
  expect(total).toBe(before + 1);
});

test("undo after split restores prior clip count", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => clipCount(page), { timeout: 20_000 }).toBeGreaterThan(0);

  await page.getByTestId("aicut-play").click();
  await page.waitForTimeout(800);
  await page.getByTestId("aicut-play").click();

  const before = await clipCount(page);
  await page.getByTestId("aicut-split").click();
  await expect.poll(() => clipCount(page)).toBe(before + 1);

  await page.locator(".aicut-root").focus();
  await page.keyboard.press(process.platform === "darwin" ? "Meta+z" : "Control+z");
  await expect.poll(() => clipCount(page)).toBe(before);
});
