import { expect, test } from "@playwright/test";

/**
 * Keyframe end-to-end. v4 model: keyframes are PER-PROPERTY
 * (panX / panY / scale). Toolbar's diamond button captures all three
 * at the playhead in one click (or removes them on second click).
 * The library-mounted panel + preview overlay are always visible
 * while keyframe mode is on + a clip is selected.
 */
test.describe("Keyframes (v4: per-property)", () => {
  test("toolbar toggle + library panel + value edits + undo", async ({
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

    // Toolbar button hidden until the toggle is on.
    const kfBtn = page.getByTestId("aicut-keyframe");
    await expect(kfBtn).toBeHidden();
    const toggle = page.getByTestId("demo-keyframes-toggle");
    await toggle.check();
    await expect(kfBtn).toBeVisible();

    // Library panel appears as soon as keyframe mode + clip selection.
    const panel = page.getByTestId("aicut-keyframe-panel");
    await expect(panel).toBeVisible();

    // Seek to t=1000, click toolbar → 3 keyframes land (panX, panY, scale).
    await page.evaluate(() => (window as any).__aicut.api.seek(1000));
    await kfBtn.click();
    const afterAdd = await page.evaluate(() => {
      const p = (window as any).__aicut.api.getProject();
      const clip = p.tracks[0].clips.find(
        (c: { id: string }) => c.id === "kf-test-clip",
      );
      return clip?.keyframes ?? null;
    });
    expect(afterAdd).toHaveLength(3);
    const props = new Set(afterAdd.map((k: { prop: string }) => k.prop));
    expect(props).toEqual(new Set(["panX", "panY", "scale"]));
    expect(afterAdd.every((k: { time: number }) => k.time === 1000)).toBe(
      true,
    );

    // Edit Scale via the library's panel → upserts a kf at the
    // current playhead (still at t=1000).
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
          const k = c?.keyframes?.find(
            (k: { prop: string }) => k.prop === "scale",
          );
          return k?.value ?? null;
        }),
      )
      .toBe(1.5);

    // Editing panX with no kf for it yet (after deletion below) ends
    // up as the static base — but here we DO have keyframes, so it's
    // an upsert. Quick verification: change panX, see the kf value.
    const xIn = page.getByTestId("aicut-kf-x");
    await xIn.fill("80");
    await xIn.blur();
    await expect
      .poll(async () =>
        await page.evaluate(() => {
          const p = (window as any).__aicut.api.getProject();
          const c = p.tracks[0].clips.find(
            (c: { id: string }) => c.id === "kf-test-clip",
          );
          return (
            c?.keyframes?.find(
              (k: { prop: string }) => k.prop === "panX",
            )?.value ?? null
          );
        }),
      )
      .toBe(80);

    // Toolbar click again → removes all keyframes at this time.
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

    // Undo → keyframes come back.
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
      .toBe(3);

    // Disable / re-enable → data preserved.
    await toggle.uncheck();
    await expect(kfBtn).toBeHidden();
    const stillThere = await page.evaluate(() => {
      const p = (window as any).__aicut.api.getProject();
      const c = p.tracks[0].clips.find(
        (c: { id: string }) => c.id === "kf-test-clip",
      );
      return c?.keyframes?.length ?? 0;
    });
    expect(stillThere).toBe(3);
    await toggle.check();
    await expect(kfBtn).toBeVisible();
  });

  test("setValueAtPlayhead with no kf updates static base (not animated)", async ({
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

    await page.evaluate(() => {
      const api = (window as any).__aicut.api;
      const p = api.getProject();
      p.tracks[0].clips = [
        {
          id: "static-clip",
          sourceId: p.sources[0].id,
          in: 0,
          out: 5000,
          start: 0,
        },
      ];
      api.setProject(p);
      api.setSelection("static-clip");
    });

    await page.getByTestId("demo-keyframes-toggle").check();
    await page.evaluate(() => (window as any).__aicut.api.seek(500));

    // Edit X — no keyframes yet, so it updates the static base.
    const xIn = page.getByTestId("aicut-kf-x");
    await xIn.fill("50");
    await xIn.blur();
    await expect
      .poll(async () =>
        await page.evaluate(() => {
          const p = (window as any).__aicut.api.getProject();
          const c = p.tracks[0].clips.find(
            (c: { id: string }) => c.id === "static-clip",
          );
          return { panX: c?.panX, kfs: c?.keyframes?.length ?? 0 };
        }),
      )
      .toEqual({ panX: 50, kfs: 0 });
  });
});
