import { expect, type Page, test } from '@playwright/test';
/**
 * Keyword batch 1 (D-104, D-110). The listed test decks hold none of these cards, so the games use
 * the hidden SYNTHETIC deck `synthetic-keyword-batch` (game/precons.ts): invented cards, not real
 * ones, against "Rats and Spiders" (a quiet opponent). A scripted player plays lands and Sol Rings
 * and keeps the invented spells in hand until the card under test can be cast. The engine and the AI
 * are seeded, so a given seed reaches it at the same point every time; the loop only waits for the
 * page to settle and acts once on what is on screen.
 */
import {
  game,
  handCard,
  life,
  playUntil,
  poisonOpponent,
  primary,
} from './harness/keywords-script';
import { settled } from './harness/settle';

// Any seed that reaches the situation passes; these were scanned and reach it early.
const SEED_MULTIKICKER = 2;
const SEED_SPLIT_SECOND = 4;
const SEED_POISON = 8;

const logText = (page: Page) => page.getByRole('log');
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Multikicker' });
const field = (page: Page) => dialog(page).getByLabel('Times kicked');

/** Picks the opponent as the target of an "any target" spell and confirms. */
async function targetOpponent(page: Page): Promise<void> {
  await settled(page);
  await page.locator('.board-life[data-seat="1"]').click();
  await primary(page).click();
}

test('Multikicker: the dialog asks how many times, the stack shows "kicked 2 times", the damage matches', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(game(SEED_MULTIKICKER));
  await playUntil(page, 'SYNTHETIC Volley Barrage', 3);
  const foe = Number(await life(page, 1).textContent());
  // Full Control keeps the spell on the stack, so its badge can be read there.
  await page.getByRole('button', { name: 'Full Control' }).click();

  await handCard(page, 'SYNTHETIC Volley Barrage').first().click();
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page)).toContainText('SYNTHETIC Volley Barrage');
  await expect(dialog(page)).toContainText(
    /Pay the multikicker cost \{1\} how many times\? You can afford up to \d+\./,
  );
  // Not kicking is the starting answer; the stepper and the keyboard raise it.
  await expect(field(page)).toHaveValue('0');
  await expect(primary(page)).toHaveText("Don't kick");
  await dialog(page).getByRole('button', { name: 'More kicks' }).click();
  await expect(primary(page)).toHaveText('Kick once');
  await page.keyboard.press('ArrowUp');
  await expect(field(page)).toHaveValue('2');
  await expect(primary(page)).toHaveText('Kick 2 times');
  await expect(dialog(page)).toContainText('Kicked 2 times: {1} × 2 added to the cost.');
  await page.keyboard.press('Enter');
  await expect(dialog(page)).toBeHidden();

  await targetOpponent(page);
  await expect(logText(page)).toContainText('You cast SYNTHETIC Volley Barrage, kicked 2 times.');
  const stack = page.getByRole('region', { name: 'Stack' });
  await expect(stack).toContainText('SYNTHETIC Volley Barrage');
  await expect(stack.locator('[data-kicks="2"]')).toHaveText('kicked 2 times');
  await stack.locator('.pnl-stack-item').first().hover();
  await expect(page.getByRole('complementary', { name: 'Card preview' })).toContainText(
    'Kicked 2 times',
  );

  await primary(page).click();
  await expect(life(page, 1)).toHaveText(String(foe - 2));
  expect(errors).toEqual([]);
});

test('Split second: while the spell is on the stack the action bar says why nothing can be cast', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(game(SEED_SPLIT_SECOND));
  await playUntil(page, 'SYNTHETIC Hush Bolt', 2);
  const foe = Number(await life(page, 1).textContent());
  await page.getByRole('button', { name: 'Full Control' }).click();

  await handCard(page, 'SYNTHETIC Hush Bolt').first().click();
  await targetOpponent(page);
  await expect(logText(page)).toContainText('You cast SYNTHETIC Hush Bolt.');
  const bar = page.getByRole('region', { name: 'Actions' });
  await expect(bar).toContainText(
    'Split second: no spells or abilities can be cast or activated until this resolves',
  );
  // Nothing in the hand is castable while it is on the stack.
  await expect(page.locator('.board-hand .is-clickable')).toHaveCount(0);

  await primary(page).click();
  await expect(life(page, 1)).toHaveText(String(foe - 3));
  await expect(bar).not.toContainText('Split second');
  expect(errors).toEqual([]);
});

test('Infect: after an infect creature connects, the opponent strip shows poison counters and the log says so', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(game(SEED_POISON));
  await poisonOpponent(page);

  const flag = page.locator('.board-strip-opp .board-flag-poison');
  await expect(flag).toHaveCount(1);
  await expect(flag).toHaveText(/^\d+ poison$/);
  await expect(flag).toHaveAttribute('title', /ten or more poison counters loses the game/);
  // The human's own strip has none: the flag is only for a total above 0.
  await expect(page.locator('.board-strip-me .board-flag-poison')).toHaveCount(0);
  await expect(logText(page)).toContainText(/Opponent gets \d+ poison counters? \(\d+ of 10\)\./);
  // Poison is not life loss: the opponent's life is still 40.
  await expect(life(page, 1)).toHaveText('40');
  expect(errors).toEqual([]);
});
