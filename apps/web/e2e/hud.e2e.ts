import { expect, type Page, test } from '@playwright/test';
import { handLand } from './harness/locators';
import { settled } from './harness/settle';

/**
 * HUD quick wins (issues 42 and 43): the pass button names the step it moves to, and the Text size
 * setting. The listed decks have no creature with haste, so the first test uses the hidden SYNTHETIC deck
 * `synthetic-hasty-goblins` (game/precons.ts), against a quiet opponent. Full Control is on, so the
 * game stops at every step and the button can be read at each; every click answers a settled page
 * (e2e/harness/settle.ts).
 */
const primary = (page: Page) => page.locator('.dec-bar [data-dec-primary]');
const handCard = (page: Page) => page.locator('.board-hand .is-clickable');

test('the pass button names the step it moves to, from the first main phase to the end of the turn', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?autostart=synthetic-hasty-goblins,swamp-forest&seed=1');
  await page.getByRole('button', { name: 'Keep', exact: true }).click();
  await page.getByRole('button', { name: 'Full Control' }).click();
  await settled(page);

  // Play on until the player has a Goblin with haste in play at their first main phase with the stack empty.
  const goblin = page.locator('[data-field-seat="0"] .board-tile', { hasText: 'Raging Goblin' });
  for (let step = 0; step < 200; step += 1) {
    await settled(page);
    if (
      (await primary(page).count()) > 0 &&
      (await primary(page).innerText()).trim() === 'To Combat'
    ) {
      if ((await goblin.count()) > 0) break;
    }
    if ((await handLand(page).count()) > 0) await handLand(page).first().click({ timeout: 10_000 });
    else if ((await handCard(page).count()) > 0)
      await handCard(page).first().click({ timeout: 10_000 });
    else if ((await primary(page).count()) > 0 && (await primary(page).isEnabled())) {
      await primary(page).click();
    }
  }
  await expect(goblin).toHaveCount(1);

  const labels: string[] = [];
  for (let i = 0; i < 12; i += 1) {
    await settled(page);
    const attack = page.getByRole('button', { name: 'Attack with all' });
    if (await attack.isVisible()) {
      await attack.click();
      await settled(page);
    }
    const label = ((await primary(page).innerText()) ?? '').trim();
    labels.push(label);
    if (label === 'End Turn') break;
    await primary(page).click();
  }
  // The attack button reads Declare attackers (1) while attackers are chosen; the pass labels are the rest.
  expect(labels.filter((l) => !/^Declare attackers/.test(l))).toEqual([
    'To Combat',
    'To Declare Attackers',
    'To Declare Blockers',
    'To Combat Damage',
    'To End of Combat',
    'To Second Main',
    'To End Step',
    'End Turn',
  ]);
  expect(errors).toEqual([]);
});

test('Text size: Large by default, Normal on request, and it is remembered', async ({ page }) => {
  await page.goto('/?autostart=white-knights,swamp-forest&seed=3');
  await page.getByRole('button', { name: 'Keep', exact: true }).click();
  await expect(primary(page)).toBeVisible({ timeout: 15_000 });
  const size = () =>
    page.evaluate(() => Number.parseFloat(getComputedStyle(document.body).fontSize));
  const prompt = () =>
    page.evaluate(() =>
      Number.parseFloat(
        getComputedStyle(document.querySelector('.pnl-tracker-info') as Element).fontSize,
      ),
    );

  expect(await size()).toBeCloseTo(16.8, 1);
  await page.getByRole('button', { name: /Settings/ }).click();
  await expect(page.getByRole('button', { name: 'Large', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const largePrompt = await prompt();

  await page
    .getByRole('group', { name: 'Text size' })
    .getByRole('button', { name: 'Normal', exact: true })
    .click();
  expect(await size()).toBeCloseTo(14, 1);
  await expect(page.locator('html')).toHaveAttribute('data-text-size', 'normal');
  expect(await prompt()).toBeLessThan(largePrompt);

  // A new visit keeps the choice.
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-text-size', 'normal');
  expect(await size()).toBeCloseTo(14, 1);
});

/** True when the point at the middle of the player's own commander tile belongs to the tile, not to an overlay. */
const commanderReachable = (page: Page) =>
  page.evaluate(() => {
    const tiles = [...document.querySelectorAll('.board-cmdr')];
    const mine = tiles[tiles.length - 1];
    if (mine === undefined) return false;
    const box = mine.getBoundingClientRect();
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return hit !== null && mine.contains(hit);
  });

/** True when the middle of the element at `selector` belongs to it, not to an overlay. */
const reachableAt = (page: Page, selector: string) =>
  page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (el === null) return false;
    const box = el.getBoundingClientRect();
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return hit !== null && el.contains(hit);
  }, selector);

/** The dock sits in the column of the stack (issue 47): it overlaps none of the board's parts. */
async function dockClearsTheBoard(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const dock = document.querySelector('.dec-dock')?.getBoundingClientRect();
    if (dock === undefined) return false;
    const parts = ['.board', '.board-hand', '.board-strip-me', '.board-strip-opp', '.board-cmdr'];
    return parts.every((sel) =>
      [...document.querySelectorAll(sel)].every((el) => {
        const r = el.getBoundingClientRect();
        return (
          dock.left >= r.right - 0.5 ||
          dock.right <= r.left + 0.5 ||
          dock.top >= r.bottom ||
          dock.bottom <= r.top
        );
      }),
    );
  });
}

test('at 1280x720 with Large text the action dock never covers the commander tile', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/?autostart=white-knights,swamp-forest&seed=3');
  await page.getByRole('button', { name: 'Keep', exact: true }).click();
  await expect(page.locator('html')).not.toHaveAttribute('data-text-size', 'normal');
  await expect(primary(page)).toBeVisible({ timeout: 15_000 });
  expect(await commanderReachable(page)).toBe(true);
  expect(await dockClearsTheBoard(page)).toBe(true);
  // Full Control keeps the bar up, with its toggles, at every step.
  await page.getByRole('button', { name: 'Full Control' }).click();
  await settled(page);
  expect(await commanderReachable(page)).toBe(true);
  expect(await dockClearsTheBoard(page)).toBe(true);
  // Nothing lies over a hand card or the button of the turn either.
  await page.mouse.move(5, 5);
  expect(await reachableAt(page, '.board-hand .is-clickable')).toBe(true);
  expect(await reachableAt(page, '.dec-bar [data-dec-primary]')).toBe(true);
});
