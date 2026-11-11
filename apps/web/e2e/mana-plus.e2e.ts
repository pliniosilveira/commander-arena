import { expect, type Page, test } from '@playwright/test';
import { settled } from './harness/settle';

/**
 * More mana production (D-099, D-102): a filter land that asks which combination, a manual payment
 * with one, and a land that makes only the colors the opponent's lands could. The listed test decks
 * hold none of these, so the games use the hidden SYNTHETIC deck `synthetic-mana-plus`
 * (game/precons.ts): invented cards, not real ones. A scripted player plays lands (spells stay in the
 * hand) until the situation under test exists; the engine and the AI are seeded, so a seed reaches
 * it at the same point every time and the loop only waits for the page to settle.
 */
const game = (seed: number) => `/?autostart=synthetic-mana-plus,swamp-forest&seed=${seed}`;

const S_FILTER = 3;
const S_MANUAL = 3;
const S_ORCHARD = 3;

/** The lands the script plays: only what the situation needs, so the board stays small. */
const FILTER_LANDS = /^(Mountain|Plains|SYNTHETIC Filter Land)/;
const ORCHARD_LANDS = /^SYNTHETIC Orchard/;

const primary = (page: Page) => page.locator('.dec-bar [data-dec-primary]');
const press = (page: Page) =>
  primary(page)
    .click({ timeout: 400 })
    .catch(() => undefined);
const discardDialog = (page: Page) => page.getByRole('dialog', { name: /^Discard/ });
const log = (page: Page) => page.getByRole('log');
/** A permanent on a side of the battlefield, by name. */
const field = (page: Page, seat: number, name: string) =>
  page.locator(`[data-field-seat="${seat}"] .board-tile`, { hasText: name });
/** One of my untapped permanents that can be used now, by name. */
const usable = (page: Page, name: string) =>
  page.locator('[data-field-seat="0"] .board-tile.is-clickable:not(.is-tapped)', {
    hasText: name,
  });
const pool = (page: Page) => page.locator('[data-pool]');

/** Plays lands until `ready` holds; nothing else is ever cast. */
async function playUntil(page: Page, ready: () => Promise<boolean>, land: RegExp): Promise<void> {
  const keepButton = page.getByRole('button', { name: 'Keep', exact: true });
  for (let step = 0; step < 600; step += 1) {
    await settled(page);
    if (await keepButton.isVisible()) {
      await keepButton.click();
    } else if (await discardDialog(page).isVisible()) {
      const cards = discardDialog(page).locator('.dec-card-button');
      const spare = cards.filter({ hasNotText: land });
      await ((await spare.count()) > 0 ? spare : cards).first().click();
      await discardDialog(page).getByRole('button', { name: 'Confirm' }).click();
    } else if ((await page.locator('.dec-overlay').count()) === 0 && (await ready())) {
      return;
    } else {
      const lands = page.locator('.board-hand .is-clickable').filter({ hasText: land });
      if ((await lands.count()) > 0) {
        await lands.first().click();
      } else {
        await press(page);
      }
    }
  }
  throw new Error('the game never reached the situation');
}

/** A filter land and a basic land that I can tap now. */
const filterAndBasic = (page: Page) => async () =>
  (await usable(page, 'SYNTHETIC Filter Land').count()) > 0 &&
  (await usable(page, 'Mountain').or(usable(page, 'Plains')).count()) > 0;

test('a filter land asks which combination; the pool shows what was made', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(game(S_FILTER));
  await playUntil(page, filterAndBasic(page), FILTER_LANDS);

  // The basic land's mana is the half the filter takes.
  await usable(page, 'Mountain').or(usable(page, 'Plains')).first().click();
  await expect(pool(page)).toHaveCount(1);
  const half = await pool(page).getAttribute('data-pool');
  expect(['R', 'W']).toContain(half);

  await usable(page, 'SYNTHETIC Filter Land').first().click();
  const ask = page.getByRole('group', { name: 'Add {R}{R}, {W}{R} or {W}{W}?' });
  await expect(ask).toBeVisible();
  // The filter's plain tap ("Ability 1") and its three combinations.
  await expect(ask.getByRole('button', { name: /^Add / })).toHaveCount(3);
  await expect(ask.getByRole('button', { name: 'Ability 1' })).toBeVisible();
  await expect(ask.getByRole('button', { name: 'Add {W}{R}', exact: true })).toBeVisible();
  await ask.getByRole('button', { name: 'Add {W}{R}', exact: true }).click();
  await expect(ask).toBeHidden();
  // The half was paid, the combination was made: white and red in the pool, nothing else.
  await expect(pool(page)).toHaveAttribute('data-pool', 'WR');
  await expect(field(page, 0, 'SYNTHETIC Filter Land').first()).toHaveClass(/is-tapped/);
  expect(errors).toEqual([]);
});

test('manual payment: a filter land asks the combination and the badge names it', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(game(S_MANUAL));
  await playUntil(
    page,
    async () => {
      const knight = page.locator('.board-hand .is-clickable', { hasText: 'Youthful Knight' });
      return (await filterAndBasic(page)()) && (await knight.count()) > 0;
    },
    FILTER_LANDS,
  );
  const toggle = page.getByRole('button', { name: 'Manual mana' });
  if ((await toggle.getAttribute('aria-pressed')) === 'false') await toggle.click();

  await page.locator('.board-hand .is-clickable', { hasText: 'Youthful Knight' }).first().click();
  const pay = page.getByRole('region', { name: 'Payment' });
  await expect(pay).toBeVisible();
  const basic = usable(page, 'Mountain').or(usable(page, 'Plains')).first();
  await basic.click();
  await expect(basic.locator('.board-ibadge')).toHaveText('1');
  const filter = usable(page, 'SYNTHETIC Filter Land').first();
  // First click: its plain colorless tap. Second click: the filter, which asks.
  await filter.click();
  await filter.click();
  const ask = page.getByRole('group', { name: 'Add {R}{R}, {W}{R} or {W}{W}?' });
  await expect(ask).toBeVisible();
  await ask.getByRole('button', { name: 'Add {W}{R}', exact: true }).click();
  await expect(filter.locator('.board-ibadge')).toHaveText('2 (WR)');
  await page.locator('[data-dec-primary]').click();
  await expect(log(page)).toContainText('You cast Youthful Knight');
  expect(errors).toEqual([]);
});

test("an Orchard-like land offers only the colors of the opponent's lands", async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(game(S_ORCHARD));
  await playUntil(
    page,
    async () =>
      (await usable(page, 'SYNTHETIC Orchard').count()) > 0 &&
      (await field(page, 1, 'Swamp').count()) > 0 &&
      (await field(page, 1, 'Forest').count()) > 0,
    ORCHARD_LANDS,
  );
  await usable(page, 'SYNTHETIC Orchard').first().click();
  const ask = page.getByRole('group', { name: 'Choose mana' });
  await expect(ask).toBeVisible();
  // Black and green and nothing else: the opponent has Swamps and Forests (and a Command Tower for
  // a black commander).
  await expect(ask.getByRole('button', { name: /^Add / })).toHaveCount(2);
  await expect(ask.getByRole('button', { name: 'Add B', exact: true })).toBeVisible();
  await expect(ask.getByRole('button', { name: 'Add G', exact: true })).toBeVisible();
  await ask.getByRole('button', { name: 'Add G', exact: true }).click();
  await expect(pool(page)).toHaveAttribute('data-pool', 'G');
  expect(errors).toEqual([]);
});
