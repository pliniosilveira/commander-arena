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
// The search opens the Zone Picker (docs/BOARD_COMPONENTS.md): the cards, the question and its buttons are there.
const picker = (page: Page) => page.getByRole('dialog', { name: 'Search your library' });
const pickerPrimary = (page: Page) => picker(page).locator('.board-modal-actions .dec-btn-primary');

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
      await pickerPrimary(page).click();
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

  const dialog = picker(page);
  await expect(dialog).toBeVisible();
  const cards = dialog.locator('.board-zone-card');
  expect(await cards.count()).toBeGreaterThan(1);
  // The picker repeats the decision's words, and an empty answer is allowed.
  await expect(dialog.locator('.board-modal-prompt')).toContainText(/^Choose up to .* cards?; /);
  await expect(pickerPrimary(page)).toHaveText('Find nothing');
  await expect(pickerPrimary(page)).toBeEnabled();

  // Pick two different cards: the order shows as 1st and 2nd, in click order.
  const second = await cards.nth(1).getAttribute('aria-label');
  await cards.nth(1).click();
  await cards.nth(0).click();
  await expect(cards.nth(1).locator('.board-ibadge')).toHaveText('1st');
  await expect(cards.nth(0).locator('.board-ibadge')).toHaveText('2nd');
  await expect(dialog).toContainText('2 of up to 2 chosen');
  await expect(pickerPrimary(page)).toHaveText('Confirm');

  // Taking a pick back moves the other one up.
  await cards.nth(1).click();
  await expect(cards.nth(0).locator('.board-ibadge')).toHaveText('1st');
  await cards.nth(1).click();
  await expect(cards.nth(1).locator('.board-ibadge')).toHaveText('2nd');

  // The picker can be closed to look at the board; the question cannot be confirmed until it is open again.
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(primary(page)).toBeDisabled();
  await page.getByRole('button', { name: 'Open library' }).click();
  await expect(dialog).toBeVisible();
  await expect(cards.nth(0).locator('.board-ibadge')).toHaveText('1st');

  const log = page.getByRole('log');
  await pickerPrimary(page).click();
  await expect(dialog).toBeHidden();
  await expect(finder(page)).toBeHidden();
  await expect(log).toContainText('You search your library and find 2 cards.');
  await expect(log).toContainText('You reveal ');
  expect(second ?? '').not.toBe('');
  expect(errors).toEqual([]);
});

test('Find nothing ends the search without moving a card', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${GAME}&seed=1`);
  await playUntilSearch(page, 'one');
  await pickerPrimary(page).click();
  await expect(finder(page)).toBeHidden();
  await expect(page.getByRole('log')).toContainText('You search your library and find nothing.');
  expect(errors).toEqual([]);
});

// Issue 548: on the board for three or more players the question's picker never opened, and Confirm
// waited for it ("Open library to choose and confirm"), so the game could not go on.
test('a search at a table of four opens the picker and can be answered', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?autostart=synthetic-search,swamp-forest,swamp-forest,swamp-forest&seed=1');
  await playUntilSearch(page, 'two');
  const dialog = picker(page);
  await expect(dialog).toBeVisible();
  await expect(page.locator('[data-testid="table-flow"]')).toBeVisible();
  await expect(pickerPrimary(page)).toBeEnabled();
  await dialog.locator('.board-zone-card').first().click();
  await pickerPrimary(page).click();
  await expect(dialog).toBeHidden();
  expect(errors).toEqual([]);
});
