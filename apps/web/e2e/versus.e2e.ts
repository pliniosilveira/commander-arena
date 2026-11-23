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

test('the versus screen and the board draw the commander in the deck’s own printing and search for no other', async ({
  page,
}) => {
  // Scryfall answers at once with nothing, so a search the screen made would show here within the wait.
  const searches: string[] = [];
  await page.route('https://api.scryfall.com/**', (route) => {
    if (route.request().url().includes('/cards/search')) searches.push(route.request().url());
    return route.fulfill({
      status: 404,
      headers: { 'access-control-allow-origin': '*' },
      contentType: 'application/json',
      body: JSON.stringify({
        object: 'error',
        status: 404,
        code: 'not_found',
        details: 'No match.',
      }),
    });
  });
  await page.goto('/');
  await startDefaultGame(page, '7', true);
  const versus = versusScreen(page);
  await expect(versus).toBeVisible({ timeout: 30_000 });
  await expect(versus.locator('[data-versus-side="you"]')).toContainText(/Commander: \S/);
  await page.waitForTimeout(3000);
  expect(searches).toEqual([]);
  // The board draws the commander the same way: the deck's own printing, no search.
  await startFromVersus(page);
  await expect(page.getByText('Your opening hand')).toBeVisible();
  await page.waitForTimeout(3000);
  expect(searches).toEqual([]);
});
