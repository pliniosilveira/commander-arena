import { expect, type Page, test } from '@playwright/test';

/**
 * Mana and lands (D-072). The listed test decks hold none of these cards, so the games use the
 * hidden SYNTHETIC deck `synthetic-mana` (game/precons.ts): invented cards, not real ones. With
 * seed 1 the human goes first and the opening hand holds a Dual Land, a Shock Land and a Shock
 * Rock, so both tests play turn one without searching.
 */
const GAME = '/?autostart=synthetic-mana,swamp-forest&seed=1';

const optional = (page: Page) => page.getByRole('dialog', { name: 'Optional ability' });
const hand = (page: Page) => page.locator('.board-hand [data-object-id]');

async function keepHand(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Keep', exact: true }).click();
  await expect(page.locator('.board-hand .is-clickable').first()).toBeVisible({ timeout: 15_000 });
}

test('a shock land asks "Pay 2 life?"; Don\'t pay enters it tapped and the log says so', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(GAME);
  await keepHand(page);
  await hand(page).filter({ hasText: 'SYNTHETIC Shock Land' }).first().click();

  const dialog = optional(page);
  await expect(dialog).toContainText('SYNTHETIC Shock Land');
  await expect(dialog).toContainText('Pay 2 life?');
  await expect(dialog).toContainText("If you don't, SYNTHETIC Shock Land enters tapped.");
  await expect(dialog.getByRole('button', { name: 'Pay', exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: "Don't pay" })).toBeVisible();
  // Still in the hand: nothing has happened yet.
  await expect(hand(page).filter({ hasText: 'SYNTHETIC Shock Land' })).toHaveCount(1);

  await dialog.getByRole('button', { name: "Don't pay" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('log')).toContainText(
    "You don't pay; SYNTHETIC Shock Land enters tapped.",
  );
  await expect(
    page.locator('.board-field [data-object-id]', { hasText: 'Shock Land' }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test('manual mana: a two-colour land offers its two colors, and a Shock Rock asks "Pay 3 life?"', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(GAME);
  await keepHand(page);
  await page.getByRole('button', { name: 'Manual mana' }).click();

  await hand(page).filter({ hasText: 'SYNTHETIC Dual Land' }).first().click();
  const land = page.locator('.board-field [data-object-id]', { hasText: 'SYNTHETIC Dual Land' });
  await expect(land).toBeVisible({ timeout: 15_000 });

  // {1}: the land is the only source, and it asks which of its two colors.
  await hand(page).filter({ hasText: 'SYNTHETIC Shock Rock' }).first().click();
  const pay = page.getByRole('region', { name: 'Payment' });
  await expect(pay).toBeVisible();
  await land.click();
  const colors = page.getByRole('group', { name: 'Choose a color of mana' });
  await expect(colors.getByRole('button', { name: /^Add / })).toHaveCount(2);
  await expect(colors.getByRole('button', { name: 'Add U', exact: true })).toBeVisible();
  await expect(colors.getByRole('button', { name: 'Add B', exact: true })).toBeVisible();
  await colors.getByRole('button', { name: 'Add B', exact: true }).click();
  await expect(land.locator('.board-ibadge')).toHaveText('1 (B)');
  await page.locator('[data-dec-primary]').click();

  // The artifact asks as it resolves: the spell is on the stack, not an ability.
  const dialog = optional(page);
  await expect(dialog).toContainText('Pay 3 life?');
  await dialog.getByRole('button', { name: 'Pay', exact: true }).click();
  await expect(dialog).toBeHidden();
  const log = page.getByRole('log');
  await expect(log).toContainText('You cast SYNTHETIC Shock Rock');
  await expect(log).toContainText('You pay 3 life.');
  expect(errors).toEqual([]);
});
