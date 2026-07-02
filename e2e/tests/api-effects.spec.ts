import { expect, test } from "@playwright/test";

/**
 * Covers the `@aicut/effects` overlay wired into the `/#/api`
 * playground. Assertions target DOM markers on the overlay
 * (`[data-aicut-effects]` root, `[data-effect-kind="…"]` children) —
 * the animations themselves are timing-visual and not asserted here.
 * Goal is to catch: package broken, overlay not mounted, per-kind
 * default not firing, or the enabled-toggle not gating subscription.
 */

const OVERLAY = "[data-aicut-effects]";
const EFFECT_ROOT = `${OVERLAY} [data-effect-kind]`;

async function gotoPlayground(page: import("@playwright/test").Page) {
  await page.goto("/#/api");
  // Toggle chip renders after the playground body — cheap ready signal.
  await expect(page.getByTestId("apiplay-toggle-effects")).toBeVisible();
}

test("playground mounts with effects overlay ready", async ({ page }) => {
  await gotoPlayground(page);
  // Overlay div is always present when enabled, even with zero active
  // effects — it's the parent listener container.
  await expect(page.locator(OVERLAY)).toBeAttached();
  // No effect nodes at idle.
  await expect(page.locator(EFFECT_ROOT)).toHaveCount(0);
});

test("splitClip fires the default effect overlay", async ({ page }) => {
  await gotoPlayground(page);
  const splitCard = page.getByTestId("apiplay-card-splitClip");
  await splitCard.locator(".apiplay-run-btn").click();

  // Effect appears — split animation is ~800ms so the overlay child
  // node lives at least a few hundred ms. Being generous with the
  // arrival window because RAF-scheduled state updates aren't
  // instantaneous.
  await expect(
    page.locator(`${OVERLAY} [data-effect-kind="splitClip"]`),
  ).toBeAttached({ timeout: 500 });

  // …then unmounts on the effect's `onComplete` call. Split total is
  // 800ms; give it 1.5s slack.
  await expect(
    page.locator(`${OVERLAY} [data-effect-kind="splitClip"]`),
  ).toHaveCount(0, { timeout: 1500 });
});

test("moveClipTo fires the default effect overlay", async ({ page }) => {
  await gotoPlayground(page);
  const moveCard = page.getByTestId("apiplay-card-moveClipTo");
  await moveCard.locator(".apiplay-run-btn").click();

  await expect(
    page.locator(`${OVERLAY} [data-effect-kind="moveClipTo"]`),
  ).toBeAttached({ timeout: 500 });

  // Move animation runs ~1.45s (spawn+lift+carry+drop+exit). Give the
  // full cycle plus slack.
  await expect(
    page.locator(`${OVERLAY} [data-effect-kind="moveClipTo"]`),
  ).toHaveCount(0, { timeout: 2500 });
});

test("effects toggle off suppresses the overlay", async ({ page }) => {
  await gotoPlayground(page);
  await page.getByTestId("apiplay-toggle-effects").click();
  // Overlay unmounts entirely when disabled.
  await expect(page.locator(OVERLAY)).toHaveCount(0);

  // Split still runs at the data layer, but nothing renders.
  const splitCard = page.getByTestId("apiplay-card-splitClip");
  await splitCard.locator(".apiplay-run-btn").click();
  // Give the effect roughly the time it would have taken to show up
  // if the toggle were broken — 400ms is well past the mount latency.
  await page.waitForTimeout(400);
  await expect(page.locator(EFFECT_ROOT)).toHaveCount(0);
});
