import { expect, test } from "@playwright/test";

/**
 * Verifies the pluggable PlaybackEngine surface end-to-end:
 * the demo offers a radio to switch between the default
 * HtmlVideoEngine, a host-supplied CanvasCompositorEngine, and
 * the opt-in WebCodecsEngine. Flipping the radio really swaps the
 * rendering surface — and editor controls stay wired regardless of
 * which engine is active.
 */
test.describe("PlaybackEngine swap", () => {
  test("HTML5 ↔ Canvas swap: rendering surface flips, EditorApi stays live", async ({
    page,
  }) => {
    await page.goto("/");

    const preview = page.getByTestId("aicut-preview");
    await expect(preview).toBeVisible();

    // Default: HTML5 video engine — preview has at least one <video>,
    // no canvas under the preview, no compositor HUD.
    await expect(page.getByTestId("demo-engine-html")).toBeChecked();
    await expect(preview.locator("video")).toHaveCount(2); // two sources seeded
    await expect(preview.locator("canvas")).toHaveCount(0);
    await expect(preview.locator(".aicut-preview__badge")).toHaveCount(0);

    // Flip to the canvas engine.
    await page.getByTestId("demo-engine-canvas").check();
    await expect(page.getByTestId("demo-engine-canvas")).toBeChecked();

    // Now preview owns a canvas + the engine HUD; the decode videos
    // are kept off the DOM tree (canvas owns the pixels).
    await expect(preview.locator("canvas")).toHaveCount(1);
    await expect(preview.locator(".aicut-preview__badge")).toHaveText(
      /canvas compositor/,
    );
    await expect(preview.locator("video")).toHaveCount(0);

    // Editor controls are still wired — play through the editor API.
    await expect
      .poll(
        async () =>
          await page.evaluate(() => Boolean((window as any).__aicut?.api)),
        { timeout: 10_000 },
      )
      .toBe(true);
    await page.evaluate(() => (window as any).__aicut.api.seek(500));
    await expect(preview.locator(".aicut-preview__badge")).toContainText(
      /t=0\.5/,
    );

    // Switching back restores the default engine — same contract.
    await page.getByTestId("demo-engine-html").check();
    await expect(preview.locator("canvas")).toHaveCount(0);
    await expect(preview.locator(".aicut-preview__badge")).toHaveCount(0);
    await expect(preview.locator("video")).toHaveCount(2);
  });

  /**
   * WebCodecs is gated on the browser exposing VideoDecoder + friends.
   * System Chrome (Playwright's `channel: 'chrome'`) ships them in 94+,
   * so this should pass under the standard config. We don't assert on
   * actual decoded frames — that depends on whether the demo's local
   * MP4 fixtures are H.264 — only on the engine mount + HUD identity.
   * Decode quality is a manual / browser-side smoke test.
   */
  test("WebCodecs engine swap: canvas + HUD identifies the engine", async ({
    page,
  }) => {
    await page.goto("/");

    const radio = page.getByTestId("demo-engine-webcodecs");
    await expect(radio).toBeVisible();

    if (await radio.isDisabled()) {
      test.skip(
        true,
        "Browser doesn't expose WebCodecs — skipping WebCodecs swap test.",
      );
      return;
    }

    await radio.check();
    await expect(radio).toBeChecked();

    const preview = page.getByTestId("aicut-preview");
    await expect(preview.locator("canvas")).toHaveCount(1);
    await expect(preview.locator(".aicut-preview__badge")).toHaveText(
      /engine: webcodecs/,
    );
    await expect(preview.locator("video")).toHaveCount(0);
  });
});
