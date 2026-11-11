import { expect, type Page, test } from '@playwright/test';
import { installedPrecons } from './harness/precons';
import { untilHandPlayable } from './harness/resolve';

/** The turn banner reads "Your turn 3" or "Opponent's turn 3": the player, then the round (D-153). */
async function banner(page: Page): Promise<{ round: number; mine: boolean }> {
  const text = await page.getByTestId('game').innerText();
  const match = /(Your|Opponent's) turn (\d+)/.exec(text);
  if (match?.[2] === undefined) throw new Error(`no turn banner in: ${text.slice(0, 200)}`);
  return { round: Number(match[2]), mine: match[1] === 'Your' };
}

const primary = (page: Page) => page.locator('[data-dec-primary]');

const installed = installedPrecons();

test('the menu starts the installed precon', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Commander Arena' })).toBeVisible();
  await expect(page.getByText(/No precon is installed yet/)).toHaveCount(0);
  await expect(page.getByText(/not real precons/i)).toHaveCount(0);
  await expect(page.getByRole('radio')).toHaveCount(2 * installed.length);
  await page.getByLabel('Seed').fill('7');
  await page.getByRole('button', { name: 'Start game' }).click();
  await expect(page.getByText('Your opening hand')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Keep', exact: true }).click();
  await expect(primary(page)).toBeVisible({ timeout: 15_000 });
  expect(errors).toEqual([]);
});

test('autostart to a playable game: keep, play a land, pass turns without extra clicks', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/?autostart=white-knights,swamp-forest&seed=7');

  // The first real question is the mulligan.
  await expect(page.getByText('Your opening hand')).toBeVisible();
  await page.getByRole('button', { name: 'Keep', exact: true }).click();

  // Play a land on my first main phase.
  await expect(primary(page)).toBeVisible({ timeout: 15_000 });
  const hand = page.locator('.board-hand [data-object-id]');
  // The primary button is already visible during the opponent's first turn: wait until a hand card
  // is actually playable (my own main phase) before clicking one.
  await untilHandPlayable(page);
  // Seven cards, or eight after the draw on a turn that is not the first.
  await expect.poll(() => hand.count()).toBeGreaterThanOrEqual(7);
  await hand.filter({ hasText: 'Basic Land' }).first().click();
  await expect(page.locator('.board-log, [role=log]')).toContainText('You play');

  // Play four more turns by clicking only the primary button. During the opponent's turn the
  // autopilot passes for me, so a click there is only ever an answer to a block decision (A18).
  const clicks: { round: number; mine: boolean; label: string }[] = [];
  // Every turn is one banner (a player and a round): five of them mean four turns went by.
  const seen = new Set<string>();
  const note = async () => {
    const shown = await banner(page);
    seen.add(`${shown.round}-${shown.mine}`);
    return shown;
  };
  await note();
  for (let guard = 0; guard < 60; guard++) {
    await note();
    if (seen.size >= 5) break;
    const button = primary(page);
    await button.waitFor({ timeout: 15_000 });
    // Read the label first, then the banner: the autopilot may move the turn while we wait.
    const label = (await button.innerText()).replace(/\s+/g, ' ').trim();
    const { round, mine } = await note();
    clicks.push({ round, mine, label });
    if (await button.isDisabled()) {
      // A choose-cards prompt (discard to hand size): pick cards until Confirm enables.
      const cards = page.getByRole('dialog').locator('[aria-pressed]');
      for (let i = 0; i < 4 && (await button.isDisabled()); i++) await cards.nth(i).click();
    }
    await button.click();
    await page.waitForTimeout(150);
  }
  await note();
  expect(seen.size).toBeGreaterThanOrEqual(5);

  const opponentClicks = clicks.filter((c) => !c.mine);
  for (const c of opponentClicks) expect(c.label, JSON.stringify(c)).toMatch(/block|resolve/i);
  // A turn with lands and creatures to cast costs a handful of clicks, not dozens.
  expect(clicks.length).toBeLessThan(40);
  expect(errors).toEqual([]);
});

test('conceding from the Settings menu ends the game with a game-over dialog', async ({ page }) => {
  await page.goto('/?autostart=white-knights,swamp-forest&seed=3');
  await page.getByRole('button', { name: 'Keep', exact: true }).click();
  await expect(primary(page)).toBeVisible({ timeout: 15_000 });
  // Concede is not in the action bar (issue 43): it is in the Settings menu, behind a confirm step.
  await expect(page.getByRole('button', { name: /^Concede/ })).toHaveCount(0);
  await page.getByRole('button', { name: /Settings/ }).click();
  await page.getByRole('button', { name: 'Concede game', exact: true }).click();
  // Keeping playing closes the question and nothing is sent.
  await page.getByRole('button', { name: 'Keep playing', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Concede game', exact: true }).click();
  await page.getByRole('button', { name: 'Yes, concede', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText(/you lose/i);
  await expect(page.getByRole('button', { name: 'Back to menu' })).toBeVisible();
});
