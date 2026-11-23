import { expect, test } from '@playwright/test';

/**
 * A game with four players from `?autostart=<human>,<ai>,<ai>,<ai>` (hidden test decks): the table
 * screen with the board for several opponents, the AIs answering in turn, and no error on the way.
 */
test('a four-player game starts on the table board and the AIs play in turn', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?autostart=white-knights,swamp-forest,swamp-forest,swamp-forest&seed=3');
  await expect(page.getByTestId('game-table-board')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.table-opp')).toHaveCount(3);
  await expect(page.getByText('Opponent 3', { exact: true }).first()).toBeVisible();

  await expect(page.getByText('Your opening hand')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Keep', exact: true }).click();
  const primary = page.locator('[data-dec-primary]');
  await expect(primary).toBeVisible({ timeout: 15_000 });

  // Press the primary button until an opponent's turn has been seen on the turn box.
  let sawOpponent = false;
  for (let guard = 0; guard < 120 && !sawOpponent; guard++) {
    const text = await page.getByTestId('table-flow').innerText();
    sawOpponent = /Opponent \d's turn/.test(text);
    if (sawOpponent) break;
    await primary.waitFor({ timeout: 20_000 });
    if (await primary.isDisabled()) {
      const cards = page.getByRole('dialog').locator('[aria-pressed]');
      for (let i = 0; i < 4 && (await primary.isDisabled()); i++) await cards.nth(i).click();
    }
    await primary.click();
    await page.waitForTimeout(150);
  }
  expect(sawOpponent).toBe(true);
  await expect(page.locator('.toast, [role="alert"]')).toHaveCount(0);
  expect(errors).toEqual([]);
});
