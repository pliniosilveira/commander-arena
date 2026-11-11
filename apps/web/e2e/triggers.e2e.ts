import { expect, type Page, test } from '@playwright/test';
import { settled } from './harness/settle';

/**
 * The decisions of triggered abilities and sacrifice (M5 S2). The listed test decks hold none, so
 * these games use the hidden SYNTHETIC deck `synthetic-triggers` (game/precons.ts): invented
 * cards, not real ones. A scripted player plays lands and casts spells until the game asks the
 * question under test. The engine and the AI are seeded, so a given seed asks it at the same
 * point every time; the loop only waits for the page to settle.
 */
const GAME = '/?autostart=synthetic-triggers,swamp-forest';

const optional = (page: Page) => page.getByRole('dialog', { name: 'Optional ability' });
const sacrifice = (page: Page) => page.getByRole('region', { name: 'Permanents to sacrifice' });
const order = (page: Page) => page.getByRole('region', { name: 'Trigger order' });
const primary = (page: Page) => page.locator('[data-dec-primary]');
const logText = (page: Page) => page.getByRole('log').innerText();

type Want = 'optional' | 'sacrifice' | 'order';

/**
 * Plays on until the wanted question is on screen. Other questions of the three kinds are answered
 * with their first or default choice; a land or spell in hand is played whenever one is playable;
 * otherwise the primary button (pass, no attack, no blocks) is pressed.
 */
async function playUntil(page: Page, want: Want): Promise<void> {
  const keep = page.getByRole('button', { name: 'Keep', exact: true });
  for (let step = 0; step < 500; step += 1) {
    await settled(page);
    const asked = {
      optional: await optional(page).isVisible(),
      sacrifice: await sacrifice(page).isVisible(),
      order: await order(page).isVisible(),
    };
    if (asked[want]) return;
    if (asked.optional) {
      await optional(page).getByRole('button', { name: 'Yes' }).click();
    } else if (asked.sacrifice) {
      await sacrifice(page).locator('button[aria-pressed]').first().click();
      await primary(page).click();
    } else if (asked.order) {
      await primary(page).click();
    } else if (await keep.isVisible()) {
      await keep.click();
    } else if ((await page.locator('.board-hand .is-clickable').count()) > 0) {
      await page.locator('.board-hand .is-clickable').first().click();
    } else if ((await primary(page).count()) > 0 && (await primary(page).isEnabled())) {
      await primary(page).click();
    }
  }
  throw new Error(`the game never asked: ${want}`);
}

test('a "you may" trigger asks in a dialog, and No is logged', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${GAME}&seed=1`);
  await playUntil(page, 'optional');

  const dialog = optional(page);
  await expect(dialog).toContainText('SYNTHETIC May Draw Creature');
  await expect(dialog).toContainText('you may draw a card');
  await expect(dialog).toContainText('Do it?');
  // The ability that asks is on the stack, shown as an ability of its source.
  await expect(page.getByRole('region', { name: 'Stack' })).toContainText('Triggered ability');
  await expect(dialog.getByRole('button', { name: 'Yes' })).toBeVisible();

  await dialog.getByRole('button', { name: 'No' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('log')).toContainText('You choose not to use SYNTHETIC May Draw');
  expect(errors).toEqual([]);
});

test('"Yes" and the keyboard: Enter accepts', async ({ page }) => {
  await page.goto(`${GAME}&seed=1`);
  await playUntil(page, 'optional');
  await page.keyboard.press('Enter');
  await expect(optional(page)).toBeHidden();
  await expect(page.getByRole('log')).toContainText('You choose to use SYNTHETIC May Draw');
});

test('a sacrifice: legal permanents glow, one is picked, Confirm sacrifices it', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${GAME}&seed=2`);
  await playUntil(page, 'sacrifice');

  const panel = sacrifice(page);
  await expect(panel).toContainText('Sacrifice for SYNTHETIC');
  const confirm = primary(page);
  await expect(confirm).toHaveText('Confirm');
  await expect(confirm).toBeDisabled();
  await expect(page.getByText(/Sacrifice a permanent for SYNTHETIC/)).toBeVisible();

  // The same permanents are highlighted on the board and listed in the panel.
  const chips = panel.locator('button[aria-pressed]');
  const glowing = page.locator('.board-field .is-clickable');
  await expect(glowing.first()).toBeVisible();
  expect(await chips.count()).toBeGreaterThan(1);

  // Pick on the board: the tile is badged, the chip is pressed, Confirm is enabled.
  const tile = glowing.first();
  const name = (await tile.getAttribute('title')) ?? '';
  await tile.click();
  await expect(page.locator('.board-field .is-selected .board-ibadge')).toHaveText('Sacrifice');
  await expect(panel.locator('button[aria-pressed="true"]')).toHaveCount(1);
  await expect(panel).toContainText('1 of 1 chosen');
  await expect(confirm).toBeEnabled();

  // Picking another one in the panel swaps the choice (only one may be sacrificed).
  await chips.last().click();
  await expect(panel.locator('button[aria-pressed="true"]')).toHaveCount(1);
  await chips.last().click();
  await expect(confirm).toBeDisabled();
  await chips.first().click();

  await page.keyboard.press('Enter');
  await expect(panel).toBeHidden();
  await expect(page.getByRole('log')).toContainText('You sacrifice');
  expect(name).not.toBe('');
  expect(errors).toEqual([]);
});

test('triggers that go off together are ordered: the top of the list resolves first', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${GAME}&seed=4`);
  await playUntil(page, 'order');

  const panel = order(page);
  const rows = panel.locator('.dec-order-row');
  expect(await rows.count()).toBeGreaterThan(1);
  await expect(panel).toContainText('Top resolves first. Bottom resolves last.');
  await expect(rows.first()).toContainText('Resolves first');
  await expect(rows.last()).toContainText('Resolves last');
  await expect(rows.first().getByRole('button', { name: /up/ })).toBeDisabled();
  await expect(rows.last().getByRole('button', { name: /down/ })).toBeDisabled();

  const names = await rows.locator('.dec-order-name').allInnerTexts();
  // Move the first row down with the keyboard: focus follows it, Enter presses it again.
  const down = rows.first().getByRole('button', { name: /down/ });
  await down.focus();
  await page.keyboard.press('Enter');
  const moved = await rows.locator('.dec-order-name').allInnerTexts();
  expect(moved[1]).toBe(names[0]);
  expect(moved[0]).toBe(names[1]);
  await expect(rows.first()).toContainText('Resolves first');
  await expect(page.locator(':focus')).toHaveAttribute('aria-label', /Move .*(up|down)/);

  await primary(page).click();
  await expect(panel).toBeHidden();
  // They went on the stack in the opposite order: the last row first.
  const log = await logText(page);
  const triggered = [...log.matchAll(/^(.+) triggers\.$/gm)].map((m) => m[1] ?? '');
  const lastTwo = triggered.slice(-moved.length);
  expect(lastTwo).toEqual([...moved].reverse().map((n) => n.replace(/\s*×\d+$/, '')));
  expect(errors).toEqual([]);
});

test('manual mana: a Treasure asks for a color, is sacrificed, and pays', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${GAME}&seed=1`);
  await page.getByRole('button', { name: 'Keep', exact: true }).click();
  await expect(page.locator('.board-hand .is-clickable').first()).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Manual mana' }).click();

  // The land makes a Treasure when it enters.
  const hand = page.locator('.board-hand [data-object-id]');
  await hand.filter({ hasText: 'SYNTHETIC Treasure Land' }).first().click();
  const treasure = page.locator('.board-field [title="Treasure"]');
  await expect(treasure.first()).toBeVisible({ timeout: 15_000 });

  // {1}{U}: the land taps for colorless, the Treasure supplies the blue.
  await hand.filter({ hasText: 'SYNTHETIC Enters Draw Creature' }).first().click();
  const pay = page.getByRole('region', { name: 'Payment' });
  await expect(pay).toBeVisible();
  await page
    .locator('.board-field [data-object-id]', { hasText: 'SYNTHETIC Treasure Land' })
    .click();
  await treasure.first().click();
  // A Treasure makes mana of any color: the page asks which.
  await page.getByRole('button', { name: 'Add U', exact: true }).click();
  await expect(pay).toContainText('Treasure will be sacrificed');
  await expect(treasure.first().locator('.board-ibadge')).toHaveText('2 (U)');
  await primary(page).click();

  await expect(page.getByRole('log')).toContainText('You cast SYNTHETIC Enters Draw Creature');
  await expect(page.getByRole('log')).toContainText('You sacrifice Treasure');
  await expect(treasure).toHaveCount(0);
  expect(errors).toEqual([]);
});
