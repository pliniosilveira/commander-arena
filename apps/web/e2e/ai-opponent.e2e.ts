import { expect, type Page, test } from '@playwright/test';
import { installedPrecons } from './harness/precons';

/** The turn banner reads "Your turn 3" or "Opponent's turn 3": the player, then the round (D-153). */
async function banner(page: Page): Promise<string | null> {
  const text = await page.getByTestId('game').innerText();
  const match = /(Your|Opponent's) turn (\d+)/.exec(text);
  return match === null ? null : `${match[1]}-${match[2]}`;
}

const primary = (page: Page) => page.locator('[data-dec-primary]');
const installed = installedPrecons();

/** Starts from the menu (the heuristic opponent), then keeps pressing the primary button for a few turns. */
async function playFromMenu(page: Page): Promise<void> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/');
  expect(installed.length).toBeGreaterThan(0);
  await page.getByLabel('Seed').fill('7');
  await page.getByRole('button', { name: 'Start game' }).click();
  await expect(page.getByText('Your opening hand')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Keep', exact: true }).click();
  await expect(primary(page)).toBeVisible({ timeout: 15_000 });

  // Press the primary button until three turns of the opponent and the player have gone by: the
  // autopilot passes for the player, so a click is a land, a spell, a block or a pass.
  const seen = new Set<string>();
  for (let guard = 0; guard < 80 && seen.size < 5; guard++) {
    const shown = await banner(page);
    if (shown !== null) seen.add(shown);
    const button = primary(page);
    await button.waitFor({ timeout: 20_000 });
    if (await button.isDisabled()) {
      const cards = page.getByRole('dialog').locator('[aria-pressed]');
      for (let i = 0; i < 4 && (await button.isDisabled()); i++) await cards.nth(i).click();
    }
    await button.click();
    await page.waitForTimeout(150);
  }
  const last = await banner(page);
  if (last !== null) seen.add(last);
  expect(seen.size).toBeGreaterThanOrEqual(5);
  // No error toast, no page error, and the AI never had to be replaced by the watchdog.
  await expect(page.locator('.dec-toast')).toHaveCount(0);
  await expect(page.getByText(/AI fallback/)).toHaveCount(0);
  expect(errors).toEqual([]);
}

test('a menu game against the heuristic opponent advances without an error', async ({ page }) => {
  await playFromMenu(page);
});

test('the menu has no difficulty setting', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Start game' })).toBeVisible();
  await expect(page.getByTestId('ai-level')).toHaveCount(0);
});

test('?autostart plays the casual opponent unless ai= names another', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // `&ai=easy` is a stale link of the removed Easy level (D-168): it plays as the default.
  for (const ai of ['', '&ai=normal', '&ai=easy']) {
    await page.goto(`/?autostart=white-knights,swamp-forest&seed=3${ai}`);
    await expect(page.getByText('Your opening hand')).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Keep', exact: true }).click();
    await expect(primary(page)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/AI fallback/)).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});
