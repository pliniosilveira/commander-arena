import { expect, test } from '@playwright/test';
import { startDefaultGame, startFromVersus, versusScreen } from './harness/menu';

test('a game from the menu opens on the versus screen, before the mulligan', async ({ page }) => {
  await page.goto('/');
  await startDefaultGame(page, '7', true);
  const versus = versusScreen(page);
  await expect(versus).toBeVisible({ timeout: 30_000 });
  await expect(versus.locator('[data-versus-side="you"]')).toContainText(/Commander: \S/);
  await expect(versus.locator('[data-versus-side="opponent"]')).toContainText(/Commander: \S/);
  await expect(page.getByText('Your opening hand')).toHaveCount(0);
  await startFromVersus(page);
  await expect(page.getByText('Your opening hand')).toBeVisible();
});

test('Cancel on the versus screen goes back to the menu', async ({ page }) => {
  await page.goto('/');
  await startDefaultGame(page, '7', true);
  await versusScreen(page).getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('button', { name: 'Start game' })).toBeVisible();
});
