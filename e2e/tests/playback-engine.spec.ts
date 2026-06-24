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
   * so this should pass under the standard config.
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

  /**
   * End-to-end decode: switch to WebCodecs, programmatically lay down
   * a clip from one of the seeded sources, and assert the HUD reports
   * decoded frames > 0 within a few seconds. This is the test that
   * catches "the engine mounts but never actually decodes anything"
   * — the unit tests can't see real fetch + mp4box + VideoDecoder
   * cooperating, only the e2e can.
   */
  test("WebCodecs actually decodes frames from an H.264 source", async ({
    page,
  }) => {
    await page.goto("/");

    const radio = page.getByTestId("demo-engine-webcodecs");
    if (await radio.isDisabled()) {
      test.skip(true, "Browser doesn't expose WebCodecs — skipping decode test.");
      return;
    }

    // Wait for the editor API to attach before switching engines.
    await expect
      .poll(
        async () =>
          await page.evaluate(() => Boolean((window as any).__aicut?.api)),
        { timeout: 10_000 },
      )
      .toBe(true);

    // Surface any engine errors so a decoder failure shows up in the
    // test output instead of as a silent "decoded: 0".
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(`console: ${msg.text()}`);
    });

    // Flip to WebCodecs.
    await radio.check();
    await expect(radio).toBeChecked();
    const preview = page.getByTestId("aicut-preview");
    await expect(preview.locator(".aicut-preview__badge")).toHaveText(
      /engine: webcodecs/,
    );

    // Lay down a clip programmatically so the engine actually has
    // something to decode. The demo seeds two video sources but no
    // clips; mirror what a user drag-drop would produce.
    await page.evaluate(() => {
      const api = (window as any).__aicut.api;
      const p = api.getProject();
      const src = p.sources[0]; // SRC_A — http://127.0.0.1:8091/a.mov
      p.tracks[0].clips = [
        {
          id: "test-clip",
          sourceId: src.id,
          in: 0,
          out: 3000, // 3 seconds is plenty for decode to spin up
          start: 0,
        },
      ];
      api.setProject(p);
    });

    // Now wait for the HUD to show decoded > 0. The number is in the
    // badge text — parse it out so the timeout is meaningful (rather
    // than a regex on a value that updates every rAF).
    await expect
      .poll(
        async () => {
          const text = await preview
            .locator(".aicut-preview__badge")
            .textContent();
          const match = text?.match(/decoded:\s*(\d+)/);
          return match ? Number(match[1]) : 0;
        },
        {
          timeout: 30_000,
          message:
            `WebCodecsEngine never decoded a frame.\n` +
            `Captured errors:\n${errors.join("\n")}`,
        },
      )
      .toBeGreaterThan(0);
  });
});
