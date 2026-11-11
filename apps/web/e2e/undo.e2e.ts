import { expect, test } from '@playwright/test';
import { untilHandPlayable } from './harness/resolve';

async function toMainWithHand(page: import('@playwright/test').Page) {
  await page.goto('/?autostart=white-knights,swamp-forest&seed=7');
  await page.getByRole('button', { name: 'Keep', exact: true }).click();
  await expect(page.locator('[data-dec-primary]')).toBeVisible({ timeout: 15_000 });
  // Wait for my own main phase: a hand card is playable only then (the opponent's spells are resolved on the way).
  await untilHandPlayable(page);
}

test('Undo takes a land back to the hand, from the button and with Ctrl+Z', async ({ page }) => {
  await toMainWithHand(page);
  const hand = page.locator('.board-hand [data-object-id]');
  const lands = page.locator('.board-field [data-object-id]', { hasText: 'Plains' });
  const undo = page.getByRole('button', { name: /^Undo/ });
  await expect(undo).toBeDisabled();

  const before = await hand.count();
  await hand.filter({ hasText: 'Basic Land' }).first().click();
  await expect(lands).toHaveCount(1);
  await expect(hand).toHaveCount(before - 1);
  await expect(undo).toBeEnabled();

  await undo.click();
  await expect(lands).toHaveCount(0);
  await expect(hand).toHaveCount(before);
  await expect(page.getByRole('log')).not.toContainText('You play Plains');
  await expect(undo).toBeDisabled();

  // The same again with the keyboard.
  await hand.filter({ hasText: 'Basic Land' }).first().click();
  await expect(lands).toHaveCount(1);
  await page.keyboard.press('Control+z');
  await expect(lands).toHaveCount(0);
  await expect(hand).toHaveCount(before);
});

test('passing the turn clears the undo history', async ({ page }) => {
  await toMainWithHand(page);
  await page.locator('.board-hand [data-object-id]', { hasText: 'Basic Land' }).first().click();
  await expect(page.getByRole('button', { name: /^Undo/ })).toBeEnabled();
  await page.locator('[data-dec-primary]').click(); // Pass Turn (nothing can attack): the autopilot and the AI move on
  await expect(page.getByRole('button', { name: /^Undo/ })).toBeDisabled({ timeout: 15_000 });
});

test('clicking a land tapped for mana, with the mana unspent, untaps it', async ({ page }) => {
  await toMainWithHand(page);
  await page.locator('.board-hand [data-object-id]', { hasText: 'Basic Land' }).first().click();
  const plains = page.locator('.board-field [data-object-id]', { hasText: 'Plains' });
  await expect(plains).toHaveCount(1);
  // Tap it for mana, then click it again: the tap is taken back and the land is played still.
  await plains.click();
  await expect(plains).toHaveClass(/is-tapped/);
  await expect(plains).toHaveClass(/is-clickable/);
  await plains.click();
  await expect(plains).not.toHaveClass(/is-tapped/);
  await expect(plains).toHaveCount(1);
});
