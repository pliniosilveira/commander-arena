import { expect, type Page, test } from '@playwright/test';
import { handCard } from './harness/locators';
import { settled } from './harness/settle';

/**
 * "As this enters, choose a creature type / a color" (CR 614.12a, D-100). The listed test decks hold
 * no such card, so these games use the hidden SYNTHETIC deck `synthetic-chosen` (game/precons.ts):
 * invented banners that pump the creatures of the chosen type or color, Raging Goblins (red, Goblin
 * 1/1) and Youthful Knights (white, Human Knight 2/1). A scripted player plays lands and the two
 * creatures, keeping every SYNTHETIC card in the hand, until the banner can be cast; the seed fixes
 * the game and the loop only waits for the page to settle.
 */
// Seed 23 reaches both situations within about 30 clicks.
const game = (seed: number) => `/?autostart=synthetic-chosen,swamp-forest&seed=${seed}`;

const primary = (page: Page) => page.locator('[data-dec-primary]');
const tile = (page: Page, name: string) => page.locator('.board-tile', { hasText: name });
const stat = (page: Page, name: string) => tile(page, name).first().locator('.board-stat');

/** Plays lands and the plain creatures until `lord` can be cast with both creatures out. */
async function playUntilCastable(page: Page, lord: string): Promise<void> {
  const keepButton = page.getByRole('button', { name: 'Keep', exact: true });
  for (let step = 0; step < 600; step += 1) {
    await settled(page);
    if (await keepButton.isVisible()) {
      await keepButton.click();
      continue;
    }
    const out =
      (await tile(page, 'Raging Goblin').count()) > 0 &&
      (await tile(page, 'Youthful Knight').count()) > 0;
    if (out && (await handCard(page, lord).count()) > 0) return;
    const plain = page.locator('.board-hand .is-clickable').filter({ hasNotText: 'SYNTHETIC' });
    if ((await plain.count()) > 0) {
      await plain.first().click();
    } else if ((await primary(page).count()) > 0 && (await primary(page).isEnabled())) {
      await primary(page).click();
    }
  }
  throw new Error('the game never reached the situation');
}

test('a lord asks for a creature type: search, arrow keys, Enter; the chip shows and only Goblins grow', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(game(23));
  await playUntilCastable(page, 'SYNTHETIC Rally Banner');
  // Before the banner: a Goblin is 1/1, a Knight is 2/1.
  await expect(stat(page, 'Raging Goblin')).toHaveText('1/1');
  await expect(stat(page, 'Youthful Knight')).toHaveText('2/1');

  await handCard(page, 'SYNTHETIC Rally Banner').first().click();
  const dialog = page.getByRole('dialog', { name: 'Choose a creature type' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('As SYNTHETIC Rally Banner enters, choose a creature type.');
  // Suggestions first: the types of the player's own creatures and hand.
  await expect(dialog.getByText('Suggested', { exact: true })).toBeVisible();
  await expect(dialog.getByText('All creature types', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('option', { name: 'Goblin' }).first()).toBeVisible();
  // There is no cancel, and Esc does not leave the question.
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();

  // The search box has the focus: type to filter, the arrows move the highlight, Enter chooses.
  const search = dialog.getByRole('combobox', { name: 'Search creature types' });
  await expect(search).toBeFocused();
  await page.keyboard.type('Go');
  const goat = dialog.getByRole('option', { name: 'Goat', exact: true });
  const goblin = dialog.getByRole('option', { name: 'Goblin', exact: true });
  const god = dialog.getByRole('option', { name: 'God', exact: true });
  await expect(goat).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowDown');
  await expect(goblin).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowDown');
  await expect(god).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowUp');
  await expect(goblin).toHaveAttribute('aria-selected', 'true');
  await expect(god).toHaveAttribute('aria-selected', 'false');
  await page.keyboard.type('b');
  await expect(search).toHaveValue('Gob');
  await expect(dialog.getByRole('option')).toHaveCount(1);
  await page.keyboard.press('Enter');
  await expect(dialog).toBeHidden();
  await settled(page);

  await expect(page.getByRole('log')).toContainText(
    'You choose Goblin for SYNTHETIC Rally Banner.',
  );
  const chip = tile(page, 'SYNTHETIC Rally Banner').first().locator('.board-flag-chosen');
  await expect(chip).toHaveText('Goblin');
  await expect(chip).toHaveAttribute('title', 'Chosen type: Goblin');
  // The lord pumps Goblins only: the Goblin is 2/2 and the Knight stays 2/1.
  await expect(stat(page, 'Raging Goblin')).toHaveText('2/2');
  await expect(stat(page, 'Youthful Knight')).toHaveText('2/1');

  // The preview names the choice.
  await tile(page, 'SYNTHETIC Rally Banner').first().hover();
  await expect(page.getByLabel('Card preview')).toContainText('Chosen creature type');
  await expect(page.getByLabel('Card preview').locator('dd[data-chosen]')).toHaveText('Goblin');
  expect(errors).toEqual([]);
});

test('an artifact asks for a color: five buttons; Red pumps the red Goblin only', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(game(23));
  await playUntilCastable(page, 'SYNTHETIC Hue Banner');
  await handCard(page, 'SYNTHETIC Hue Banner').first().click();
  const dialog = page.getByRole('dialog', { name: 'Choose a color' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('As SYNTHETIC Hue Banner enters, choose a color.');
  for (const name of ['White', 'Blue', 'Black', 'Red', 'Green']) {
    await expect(dialog.getByRole('button', { name, exact: true })).toBeVisible();
  }
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();

  await dialog.getByRole('button', { name: 'Red', exact: true }).click();
  await expect(dialog).toBeHidden();
  await settled(page);
  await expect(page.getByRole('log')).toContainText('You choose Red for SYNTHETIC Hue Banner.');
  const chip = tile(page, 'SYNTHETIC Hue Banner').first().locator('.board-flag-chosen');
  await expect(chip).toHaveText('Red');
  await expect(chip).toHaveAttribute('title', 'Chosen color: Red');
  await expect(stat(page, 'Raging Goblin')).toHaveText('2/2');
  await expect(stat(page, 'Youthful Knight')).toHaveText('2/1');

  await tile(page, 'SYNTHETIC Hue Banner').first().hover();
  await expect(page.getByLabel('Card preview')).toContainText('Chosen color');
  expect(errors).toEqual([]);
});
