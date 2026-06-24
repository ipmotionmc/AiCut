import { expect, test } from "@playwright/test";

/**
 * Keyframe end-to-end coverage. Drives the demo:
 *   - flip the sidebar toggle ON
 *   - programmatically lay down a clip + select it via the editor API
 *   - add a keyframe, edit values, undo
 *   - verify backward compat: disable + re-enable preserves the data
 *
 * Most of this routes through __aicut.api because the canvas timeline
 * has no DOM clip nodes to click on. The KeyframePanel inputs DO have
 * data-testids though, so we exercise those directly where it makes
 * sense (e.g. checking the X input reflects the selected keyframe).
 */
test.describe("Keyframes", () => {
  test("toggle + add + edit + undo + round-trip", async ({ page }) => {
    await page.goto("/");

    await expect
      .poll(
        async () =>
          await page.evaluate(() => Boolean((window as any).__aicut?.api)),
        { timeout: 10_000 },
      )
      .toBe(true);

    // Lay down a real clip so the editor has something to attach
    // keyframes to. The demo seeds two empty tracks; we add one
    // 5s clip backed by /a.mov (already in public/).
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

    // Flip the sidebar toggle ON.
    const toggle = page.getByTestId("demo-keyframes-toggle");
    await expect(toggle).toBeVisible();
    await toggle.check();
    await expect(toggle).toBeChecked();

    // KeyframePanel should now be visible.
    const panel = page.getByTestId("demo-kf-panel");
    await expect(panel).toBeVisible();

    // Add a keyframe at the playhead (seek to t=1000 first so the
    // resulting time is predictable).
    await page.evaluate(() => (window as any).__aicut.api.seek(1000));
    const addBtn = page.getByTestId("demo-kf-add");
    await addBtn.click();

    // The editor should now have exactly one keyframe at time=1000.
    const firstAddState = await page.evaluate(() => {
      const proj = (window as any).__aicut.api.getProject();
      const clip = proj.tracks[0].clips.find(
        (c: { id: string }) => c.id === "kf-test-clip",
      );
      return clip?.keyframes ?? null;
    });
    expect(firstAddState).toHaveLength(1);
    expect(firstAddState[0]).toMatchObject({ time: 1000, scale: 1 });

    // Select the keyframe via the API (clicking a diamond would also
    // work but the canvas pixel hunt is fragile).
    const kfId = firstAddState[0].id;
    await page.evaluate(
      ([id]) =>
        (window as any).__aicut.api.setSelectedKeyframe({
          clipId: "kf-test-clip",
          keyframeId: id,
        }),
      [kfId],
    );

    // Edit Scale via the KeyframePanel input → blur to commit.
    const scaleInput = page.getByTestId("demo-kf-scale");
    await scaleInput.fill("1.5");
    await scaleInput.blur();

    await expect
      .poll(
        async () =>
          await page.evaluate(() => {
            const proj = (window as any).__aicut.api.getProject();
            const clip = proj.tracks[0].clips.find(
              (c: { id: string }) => c.id === "kf-test-clip",
            );
            return clip?.keyframes?.[0]?.scale ?? null;
          }),
      )
      .toBe(1.5);

    // Undo restores Scale to 1.
    await page.evaluate(() => (window as any).__aicut.api.undo());
    await expect
      .poll(
        async () =>
          await page.evaluate(() => {
            const proj = (window as any).__aicut.api.getProject();
            const clip = proj.tracks[0].clips.find(
              (c: { id: string }) => c.id === "kf-test-clip",
            );
            return clip?.keyframes?.[0]?.scale ?? null;
          }),
      )
      .toBe(1);

    // Disable + re-enable → data preserved.
    await toggle.uncheck();
    await expect(panel).not.toBeVisible();
    const stillThere = await page.evaluate(() => {
      const proj = (window as any).__aicut.api.getProject();
      const clip = proj.tracks[0].clips.find(
        (c: { id: string }) => c.id === "kf-test-clip",
      );
      return clip?.keyframes?.length ?? 0;
    });
    expect(stillThere).toBe(1);
    await toggle.check();
    await expect(panel).toBeVisible();
  });
});
