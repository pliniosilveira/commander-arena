import { expect, type Page, test } from '@playwright/test';
import { settled } from './harness/settle';

/**
 * Library search and discard (M5). The listed test decks hold none, so these games use the hidden
 * SYNTHETIC deck `synthetic-search` (game/precons.ts): invented cards, not real ones. A scripted
 * player plays lands and casts spells until the game asks the question under test. The engine and
 * the AI are seeded, so a given seed asks it at the same point every time; the loop only waits for
 * the page to settle.
 */
const GAME = '/?autostart=synthetic-search,swamp-forest';

const finder = (page: Page) => page.getByRole('region', { name: 'Cards to find' });
const discarder = (page: Page) => page.getByRole('region', { name: 'Cards to discard' });
const primary = (page: Page) => page.locator('[data-dec-primary]');

/**
 * Plays on until a search question of up to `max` cards is on screen. Another search on the way is
 * answered with Find nothing and a discard with its first card; a land or spell in hand is played whenever one is playable; otherwise the primary button
 * (pass, no attack, no blocks) is pressed.
 */
async function playUntilSearch(page: Page, max: 'one' | 'two'): Promise<void> {
  const keep = page.getByRole('button', { name: 'Keep', exact: true });
  for (let step = 0; step < 500; step += 1) {
    await settled(page);
    if (await finder(page).isVisible()) {
      const prompt = await page.locator('.dec-prompt').first().innerText();
      if (prompt.startsWith(`Choose up to ${max} `)) return;
      await primary(page).click();
    } else if (await discarder(page).isVisible()) {
      await discarder(page).locator('button[aria-pressed]').first().click();
      await primary(page).click();
    } else if (await keep.isVisible()) {
      await keep.click();
    } else if ((await page.locator('.board-hand .is-clickable').count()) > 0) {
      await page.locator('.board-hand .is-clickable').first().click();
    } else if ((await primary(page).count()) > 0 && (await primary(page).isEnabled())) {
      await primary(page).click();
    }
  }
  throw new Error('the game never asked for a search');
}

test('a search lists the library cards, the choice keeps its order, and the log shows the result', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${GAME}&seed=1`);
  await playUntilSearch(page, 'two');

  const panel = finder(page);
  await expect(panel).toContainText('Search your library');
  const rows = panel.locator('button.dec-pick');
  expect(await rows.count()).toBeGreaterThan(1);
  // The bar repeats the decision's words, and an empty answer is allowed.
  await expect(page.getByText(/^Choose up to .* cards?; /)).toBeVisible();
  await expect(primary(page)).toHaveText('Find nothing');
  await expect(primary(page)).toBeEnabled();

  // Pick by clicking two different rows: the order shows as 1st and 2nd, in click order.
  const second = await rows.nth(1).locator('.dec-pick-name').innerText();
  await rows.nth(1).click();
  await rows.nth(0).click();
  await expect(rows.nth(1).locator('.dec-pick-order')).toHaveText('1st');
  await expect(rows.nth(0).locator('.dec-pick-order')).toHaveText('2nd');
  await expect(panel).toContainText('2 of up to 2 chosen');
  await expect(primary(page)).toHaveText('Confirm');

  // Taking a pick back from the list moves the other one up.
  await panel.getByRole('button', { name: /^Take back 1st/ }).click();
  await expect(rows.nth(0).locator('.dec-pick-order')).toHaveText('1st');
  await rows.nth(1).click();
  await expect(rows.nth(1).locator('.dec-pick-order')).toHaveText('2nd');

  const log = page.getByRole('log');
  await page.keyboard.press('Enter');
  await expect(panel).toBeHidden();
  await expect(log).toContainText('You search your library and find 2 cards.');
  await expect(log).toContainText('You reveal ');
  expect(second).not.toBe('');
  expect(errors).toEqual([]);
});

test('Find nothing ends the search without moving a card', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${GAME}&seed=1`);
  await playUntilSearch(page, 'one');
  await primary(page).click();
  await expect(finder(page)).toBeHidden();
  await expect(page.getByRole('log')).toContainText('You search your library and find nothing.');
  expect(errors).toEqual([]);
});
