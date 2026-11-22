import { expect, type Page, test } from '@playwright/test';
import { settled } from './harness/settle';

/**
 * The companion (SPEC 5.8, 10): both seats reveal one (the hidden SYNTHETIC deck `synthetic-companion`), the strips show them, the action bar offers
 * "Bring your companion" only when the engine offers it, and after it was brought the chip says so and the button is gone. The same at the narrowest layout the game screen has (`.app` min-width 720).
 */
const bar = (page: Page) => page.locator('.dec-bar');
const primary = (page: Page) => page.locator('.dec-bar [data-dec-primary]');
const bring = (page: Page) => page.getByRole('button', { name: /^Bring your companion/ });

/** Plays lands and passes until the bring button is offered. */
async function reachOffer(page: Page, max = 1200): Promise<void> {
  const discard = page.getByRole('dialog', { name: /^Discard/ });
  for (let step = 0; step < max; step += 1) {
    await settled(page);
    if ((await bring(page).count()) > 0) return;
    if (await page.getByRole('dialog', { name: /^You (win|lose)/ }).isVisible()) {
      throw new Error('the game ended before the companion could be brought');
    }
    if (await discard.isVisible()) {
      await discard.locator('.dec-card-button').first().click();
      await discard.getByRole('button', { name: 'Confirm' }).click();
    } else if ((await page.locator('.dec-overlay').count()) > 0) {
      throw new Error('an unexpected dialog is open');
    } else if (
      (await page.locator('.board-hand .is-clickable', { hasText: 'Basic Land' }).count()) > 0
    ) {
      await page.locator('.board-hand .is-clickable', { hasText: 'Basic Land' }).first().click();
    } else if ((await primary(page).count()) > 0 && (await primary(page).isEnabled())) {
      await primary(page).click();
    }
  }
  throw new Error('the companion was never offered');
}

for (const [label, viewport] of [
  ['desktop', { width: 1366, height: 768 }],
  [
    'narrowest layout, 720 wide (the game has no phone layout: SPEC 10)',
    { width: 720, height: 740 },
  ],
] as const) {
  test(`companion: shown in both strips, brought with its button, then used (${label})`, async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await page.setViewportSize(viewport);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/?autostart=synthetic-companion,synthetic-companion&seed=1');
    await page.getByRole('button', { name: 'Keep', exact: true }).click();

    const mineChip = page.locator('[data-companion="0"]');
    const theirChip = page.locator('[data-companion="1"]');
    await expect(mineChip).toContainText('SYNTHETIC Companion Spider');
    await expect(mineChip).toContainText('Companion');
    await expect(theirChip).toContainText('SYNTHETIC Companion Spider');

    await reachOffer(page);
    // The offer is a button of the bar, next to the pass button, which stays the primary one.
    await expect(bar(page).locator('[data-dec-primary]')).toHaveCount(1);
    await expect(bring(page)).toBeVisible();
    const box = await bring(page).boundingBox();
    expect(box).not.toBeNull();
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(viewport.width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      viewport.width,
    );

    await bring(page).click();
    await settled(page);
    await expect(mineChip).toHaveAttribute('data-companion-brought', 'true');
    await expect(mineChip).toContainText('Used');
    await expect(bring(page)).toHaveCount(0);
    await expect(theirChip).toHaveAttribute('data-companion-brought', 'false');
    expect(errors).toEqual([]);
  });
}

// Issue 459: with a full hand the human strip (command zone, companion chip, tax) is not covered by the hand: it ends above the hand and takes the pointer.
for (const viewport of [
  { width: 1366, height: 768 },
  { width: 1280, height: 720 },
  { width: 720, height: 740 },
] as const) {
  test(`companion: a full hand does not cover the human strip (${viewport.width}x${viewport.height})`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto('/?autostart=synthetic-companion,synthetic-companion&seed=1');
    await page.getByRole('button', { name: 'Keep', exact: true }).click();
    const chip = page.locator('[data-companion="0"]');
    await expect(chip).toBeVisible();
    expect(await page.locator('.board-hand-card').count()).toBeGreaterThanOrEqual(6);
    const covered = await page.evaluate(() => {
      const chipBox = document.querySelector('[data-companion="0"]');
      const hand = document.querySelector('.board-hand');
      if (chipBox === null || hand === null) return ['missing'];
      const r = chipBox.getBoundingClientRect();
      const problems: string[] = [];
      if (r.bottom > hand.getBoundingClientRect().top) problems.push('chip overlaps the hand');
      for (const [fx, fy] of [
        [0.1, 0.1],
        [0.5, 0.5],
        [0.9, 0.9],
      ] as const) {
        const hit = document.elementFromPoint(r.x + r.width * fx, r.y + r.height * fy);
        if (hit === null || !chipBox.contains(hit)) problems.push(`not reachable at ${fx},${fy}`);
      }
      return problems;
    });
    expect(covered).toEqual([]);
  });
}
