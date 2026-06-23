import { expect, test } from "@playwright/test";

/**
 * Standalone canvas `<Timeline>` mounted by the demo as a frame-picker
 * (`FramePicker`). Click the strip at different X positions, verify
 * the reported pick time changes — proves the timeline works WITHOUT
 * the editor / playback engine.
 */
test("frame-picker reports seek time on click", async ({ page }) => {
  await page.goto("/");
  const label = page.getByTestId("demo-framepicker-time");
  await expect(label).toBeVisible();
  const initial = (await label.textContent()) ?? "";

  // The picker is the second canvas on the page (first is the editor's).
  const pickers = page.locator(".demo-framepicker canvas");
  await expect(pickers).toHaveCount(1);
  const box = await pickers.first().boundingBox();
  if (!box) throw new Error("picker canvas has no box");

  // Click roughly at the strip's 75% horizontal — past the ruler band.
  await pickers.first().click({
    position: { x: box.width * 0.75, y: box.height * 0.7 },
  });

  await expect.poll(async () => (await label.textContent()) ?? "").not.toBe(
    initial,
  );
});
