import { expect, type Page, test } from '@playwright/test';
import { handCard } from './harness/locators';
import { settled } from './harness/settle';

/**
 * X in costs (CR 107.3a, 601.2b, D-103, D-107). The listed test decks hold none, so these games use
 * the hidden SYNTHETIC deck `synthetic-x` (game/precons.ts): invented cards, not real ones, against
 * "Rats and Spiders" (a quiet opponent). A scripted player plays lands and plain creatures and keeps
 * the invented spells in hand until the card under test can be used. The engine and the AI are
 * seeded, so a given seed reaches it at the same point every time; the loop only waits for the page
 * to settle and acts once on what is on screen.
 */
const game = (seed: number) => `/?autostart=synthetic-x,swamp-forest&seed=${seed}`;

// Any seed that reaches the situation passes; these reach it early.
const SEED = 2;

const primary = (page: Page) => page.locator('[data-dec-primary]');
const logText = (page: Page) => page.getByRole('log');
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Choose X' });
const field = (page: Page) => dialog(page).getByLabel('X', { exact: true });
const life = (page: Page, seat: 0 | 1) =>
  page.locator(`.board-life[data-seat="${seat}"] .board-life-total`);

/** Mana the player's untapped lands and Sol Rings make: a land makes one, a Sol Ring two. */
async function sources(page: Page): Promise<number> {
  const untapped = page.locator('[data-field-seat="0"] .board-tile:not(.is-tapped)');
  const rings = await untapped.filter({ hasText: 'Sol Ring' }).count();
  const lands = await untapped
    .filter({
      has: page.locator('.board-tile-name', { hasText: /^(Mountain|Forest|Island)$/ }),
    })
    .count();
  return lands + 2 * rings;
}

/**
 * Plays on until the spell can be cast with at least `mana` sources untapped; the invented spells
 * stay in the hand, lands, Sol Ring and Goblins are played.
 */
async function playUntil(page: Page, spell: string, mana: number): Promise<void> {
  const keepButton = page.getByRole('button', { name: 'Keep', exact: true });
  for (let step = 0; step < 600; step += 1) {
    await settled(page);
    if (await keepButton.isVisible()) {
      await keepButton.click();
    } else if (
      (await page.locator('.dec-overlay').count()) === 0 &&
      (await handCard(page, spell).count()) > 0 &&
      (await sources(page)) >= mana
    ) {
      return;
    } else {
      const cards = page.locator('.board-hand .is-clickable').filter({ hasNotText: 'SYNTHETIC' });
      if ((await cards.count()) > 0) {
        await cards.first().click();
      } else if ((await primary(page).count()) > 0 && (await primary(page).isEnabled())) {
        await primary(page).click();
      }
    }
  }
  throw new Error('the game never reached the situation');
}

/** Picks the opponent as the target of an "any target" spell and confirms. */
async function targetOpponent(page: Page): Promise<void> {
  await settled(page);
  await page.locator('.board-life[data-seat="1"]').click();
  await primary(page).click();
}

test('an X burn spell: the dialog offers the right maximum, X is typed and stepped by keyboard, the stack shows X, the damage matches', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(game(SEED));
  await playUntil(page, 'SYNTHETIC X Burn', 4);
  const max = (await sources(page)) - 1; // the {R} of {X}{R}
  const foe = Number(await life(page, 1).textContent());
  // Full Control keeps the spell on the stack, so its X can be read there.
  await page.getByRole('button', { name: 'Full Control' }).click();

  await handCard(page, 'SYNTHETIC X Burn').first().click();
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page)).toContainText(
    `Choose X for SYNTHETIC X Burn. Each X costs {1}; you can afford up to X = ${max}.`,
  );
  // The field has the focus and starts at 1; typing replaces it, the arrows step it, Max jumps.
  await expect(field(page)).toBeFocused();
  await expect(field(page)).toHaveValue('1');
  await page.keyboard.press('2');
  await expect(field(page)).toHaveValue('2');
  await page.keyboard.press('ArrowUp');
  await expect(field(page)).toHaveValue('3');
  await expect(primary(page)).toHaveText('Choose X = 3');
  await expect(dialog(page)).toContainText('X = 3 pays {3} of the cost.');
  await page.keyboard.press('Enter');
  await expect(dialog(page)).toBeHidden();

  await targetOpponent(page);
  await expect(logText(page)).toContainText('You cast SYNTHETIC X Burn with X = 3.');
  const stack = page.getByRole('region', { name: 'Stack' });
  await expect(stack).toContainText('SYNTHETIC X Burn');
  await expect(stack.locator('[data-x="3"]')).toHaveText('X = 3');
  // The cost on the stack is what was paid: {3}{R}.
  await expect(stack.getByLabel('3 mana')).toBeVisible();
  // Issues 82 and 107: with nothing hovered the highlight box already shows the spell on top of the
  // stack, with the X written into its text, so there is no trip with the pointer to read it.
  const preview = page.getByRole('complementary', { name: 'Card preview' });
  await expect(preview.locator('[data-preview-stack]')).toBeVisible();
  await expect(preview).toContainText('Deals X (3) damage to any target.');
  await stack.locator('.pnl-stack-item').first().hover();
  await expect(preview).toContainText('3 (mana cost paid: {3}{R})');

  await primary(page).click();
  await expect(life(page, 1)).toHaveText(String(foe - 3));
  expect(errors).toEqual([]);
});

test('Max, the steppers and the digits stay within the range; Cancel and Esc rewind the cast', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(game(SEED));
  await playUntil(page, 'SYNTHETIC X Burn', 3);
  const max = (await sources(page)) - 1;

  await handCard(page, 'SYNTHETIC X Burn').first().click();
  await expect(dialog(page)).toBeVisible();
  await dialog(page).getByRole('button', { name: 'Max' }).click();
  await expect(field(page)).toHaveValue(String(max));
  await expect(primary(page)).toHaveText(`Choose X = ${max}`);
  await expect(dialog(page).getByRole('button', { name: 'More X' })).toBeDisabled();
  await dialog(page).getByRole('button', { name: 'Less X' }).click();
  await expect(field(page)).toHaveValue(String(max - 1));
  // More than the most the player can pay is kept at the maximum.
  await field(page).fill('99');
  await expect(field(page)).toHaveValue(String(max));
  await field(page).fill('0');
  await expect(primary(page)).toHaveText('Choose X = 0');
  await expect(dialog(page).getByRole('button', { name: 'Less X' })).toBeDisabled();

  // The Cancel button takes the cast back: the card is in the hand, nothing was cast.
  await dialog(page).getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog(page)).toBeHidden();
  await settled(page);
  await expect(handCard(page, 'SYNTHETIC X Burn').first()).toBeVisible();
  await expect(logText(page)).not.toContainText('You cast SYNTHETIC X Burn');
  await expect(page.getByRole('region', { name: 'Stack' })).toContainText('Stack is empty');

  // Casting again asks again; Esc in the field cancels as well.
  await handCard(page, 'SYNTHETIC X Burn').first().click();
  await expect(dialog(page)).toBeVisible();
  await expect(field(page)).toHaveValue('1');
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toBeHidden();
  await settled(page);
  await expect(handCard(page, 'SYNTHETIC X Burn').first()).toBeVisible();
  await expect(logText(page)).not.toContainText('You cast SYNTHETIC X Burn');
  expect(errors).toEqual([]);
});

test('"pay X life": each X costs 1 life, the prompt says so, and the life and the damage match', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(game(SEED));
  await playUntil(page, 'SYNTHETIC Blood Burn', 1);
  const mine = Number(await life(page, 0).textContent());
  const foe = Number(await life(page, 1).textContent());
  await page.getByRole('button', { name: 'Full Control' }).click();

  await handCard(page, 'SYNTHETIC Blood Burn').first().click();
  // CR 119.4 (Life): a payment is allowed when the life total is greater than or equal to it, so the
  // whole life total can be paid (the state-based action then ends the game, CR 704.5a): the
  // maximum X is the life total itself, not one less. The engine tests pin the same number.
  await expect(dialog(page)).toContainText(
    `Choose X for SYNTHETIC Blood Burn. Each X costs 1 life; you can afford up to X = ${mine}.`,
  );
  await expect(dialog(page)).toContainText('X = 1 pays 1 life of the cost.');
  await page.keyboard.press('5');
  await expect(dialog(page)).toContainText('X = 5 pays 5 life of the cost.');
  await page.keyboard.press('Enter');
  await targetOpponent(page);
  await expect(logText(page)).toContainText('You cast SYNTHETIC Blood Burn with X = 5.');
  await expect(life(page, 0)).toHaveText(String(mine - 5));
  await expect(page.getByRole('region', { name: 'Stack' }).locator('[data-x="5"]')).toBeVisible();

  await primary(page).click();
  await expect(life(page, 1)).toHaveText(String(foe - 5));
  expect(errors).toEqual([]);
});
