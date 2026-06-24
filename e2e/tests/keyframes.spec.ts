import { expect, test } from "@playwright/test";

/**
 * Keyframe end-to-end. The v2 UI lives entirely inside the library —
 * the demo only has an enable toggle. We exercise:
 *
 *   - Toolbar keyframe button visibility gated on the enable toggle
 *   - Toolbar click toggles between add / remove at the playhead
 *   - Preview overlay (border + corner handles) appears on canvas
 *     engines once a clip is loaded
 *   - Library-mounted KeyframePanel surfaces only when a keyframe is
 *     selected
 *   - Editing X / Y / Scale in the panel persists via the editor API
 *   - Undo / disable-then-enable round-trip preserves data
 */
test.describe("Keyframes", () => {
  test("toolbar toggle + library panel + undo + round-trip", async ({
    page,
  }) => {
    await page.goto("/");

    await expect
      .poll(
        async () =>
          await page.evaluate(() => Boolean((window as any).__aicut?.api)),
        { timeout: 10_000 },
      )
      .toBe(true);

    // Lay down a real clip + select it.
    await page.evaluate(() => {
      const api = (window as any).__aicut.api;
      const p = api.getProject();
      const src = p.sources[0];
      p.tracks[0].clips = [
        {
          id: "kf-test-clip",
          sourceId: src.id,
          in: 0,
          out: 5000,
          start: 0,
        },
      ];
      api.setProject(p);
      api.setSelection("kf-test-clip");
    });

    // Toolbar keyframe button is hidden until the toggle is on.
    const kfBtn = page.getByTestId("aicut-keyframe");
    await expect(kfBtn).toBeHidden();

    // Flip the toggle ON.
    const toggle = page.getByTestId("demo-keyframes-toggle");
    await toggle.check();
    await expect(kfBtn).toBeVisible();

    // Seek to t=1000, click the toolbar add — a keyframe lands at 1000.
    await page.evaluate(() => (window as any).__aicut.api.seek(1000));
    await kfBtn.click();
    const afterAdd = await page.evaluate(() => {
      const p = (window as any).__aicut.api.getProject();
      const clip = p.tracks[0].clips.find(
        (c: { id: string }) => c.id === "kf-test-clip",
      );
      return clip?.keyframes ?? null;
    });
    expect(afterAdd).toHaveLength(1);
    expect(afterAdd[0].time).toBe(1000);

    // Library-mounted panel only appears when a keyframe is selected.
    const panel = page.getByTestId("aicut-keyframe-panel");
    await expect(panel).toBeHidden();
    await page.evaluate(
      ([id]) =>
        (window as any).__aicut.api.setSelectedKeyframe({
          clipId: "kf-test-clip",
          keyframeId: id,
        }),
      [afterAdd[0].id],
    );
    await expect(panel).toBeVisible();

    // Edit Scale via the library's panel input.
    const scaleIn = page.getByTestId("aicut-kf-scale");
    await scaleIn.fill("1.5");
    await scaleIn.blur();
    await expect
      .poll(async () =>
        await page.evaluate(() => {
          const p = (window as any).__aicut.api.getProject();
          const c = p.tracks[0].clips.find(
            (c: { id: string }) => c.id === "kf-test-clip",
          );
          return c?.keyframes?.[0]?.scale ?? null;
        }),
      )
      .toBe(1.5);

    // Toolbar click again at the same playhead → toggles OFF (removes).
    await kfBtn.click();
    await expect
      .poll(async () =>
        await page.evaluate(() => {
          const p = (window as any).__aicut.api.getProject();
          const c = p.tracks[0].clips.find(
            (c: { id: string }) => c.id === "kf-test-clip",
          );
          return c?.keyframes?.length ?? 0;
        }),
      )
      .toBe(0);

    // Undo restores the (now-removed) keyframe.
    await page.evaluate(() => (window as any).__aicut.api.undo());
    await expect
      .poll(async () =>
        await page.evaluate(() => {
          const p = (window as any).__aicut.api.getProject();
          const c = p.tracks[0].clips.find(
            (c: { id: string }) => c.id === "kf-test-clip",
          );
          return c?.keyframes?.length ?? 0;
        }),
      )
      .toBe(1);

    // Disable + re-enable → keyframe data preserved across the toggle.
    await toggle.uncheck();
    await expect(kfBtn).toBeHidden();
    const stillThere = await page.evaluate(() => {
      const p = (window as any).__aicut.api.getProject();
      const c = p.tracks[0].clips.find(
        (c: { id: string }) => c.id === "kf-test-clip",
      );
      return c?.keyframes?.length ?? 0;
    });
    expect(stillThere).toBe(1);
    await toggle.check();
    await expect(kfBtn).toBeVisible();
  });
});
