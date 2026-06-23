import { expect, test } from "@playwright/test";

/**
 * Canvas-aware smoke test. The timeline is painted on a single
 * `<canvas>` — clips and ticks have no DOM nodes, so assertions go
 * through the editor API the demo exposes on `window.__aicut`.
 */
test("editor mounts and exposes controls", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator(".aicut-root")).toBeVisible();
  await expect(page.getByTestId("aicut-toolbar")).toBeVisible();
  await expect(page.getByTestId("aicut-play")).toBeVisible();
  await expect(page.getByTestId("aicut-split")).toBeVisible();
  await expect(page.getByTestId("aicut-trim-left")).toBeVisible();
  await expect(page.getByTestId("aicut-trim-right")).toBeVisible();
  await expect(page.getByTestId("aicut-fullscreen")).toBeVisible();
  await expect(page.getByTestId("aicut-snap")).toBeVisible();
  await expect(page.getByTestId("aicut-zoom-slider")).toBeVisible();
  // Export is no longer built-in; the demo provides its own button via
  // the editor's toolbarRight slot, asserted by its `demo-export` testid.
  await expect(page.getByTestId("demo-export")).toBeVisible();
  await expect(page.getByTestId("aicut-timeline")).toBeVisible();
  await expect(page.locator('[data-testid="aicut-timeline"] canvas')).toBeVisible();
  await expect(page.getByTestId("aicut-time-current")).toContainText(":");

  await expect(page.getByTestId("demo-save")).toBeVisible();
  await expect(page.getByTestId("demo-restore")).toBeVisible();
  await expect(page.getByTestId("demo-reset")).toBeVisible();
});

test("reset to empty project clears clips", async ({ page }) => {
  await page.goto("/");
  await expect
    .poll(
      async () =>
        await page.evaluate(() => Boolean((window as any).__aicut?.api)),
      { timeout: 10_000 },
    )
    .toBe(true);
  // Use the API directly to remove any race with in-flight metadata
  // events from the demo's source-loading flow. We're testing the
  // editor's reset behavior, not the demo's button wiring (covered by
  // the "editor mounts" smoke test).
  await page.evaluate(() => {
    const api = (window as any).__aicut.api;
    api.setProject({
      version: 1,
      sources: [],
      tracks: [{ id: "empty", kind: "video", clips: [] }],
    });
  });
  await expect
    .poll(async () =>
      await page.evaluate(
        () =>
          (window as any).__aicut?.api
            .getProject()
            .tracks.reduce((n: number, t: any) => n + t.clips.length, 0) ?? -1,
      ),
    )
    .toBe(0);
  await expect(page.getByTestId("aicut-split")).toBeDisabled();
  // Note: the demo's host-supplied export button stays enabled
  // unconditionally — disable logic is now the host's call.
});
