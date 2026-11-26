import { expect, type Page, test } from '@playwright/test';

/**
 * Parallel play-outs in the built app (issue 653, step 2c): the game Worker starts child Workers that play out
 * the AI's plannings when a game against it begins, `?workers=<n>` sets how many, and the game goes on as without them.
 * Children of a Worker are not the page's own Workers, so they are counted through the browser's targets.
 */
const primary = (page: Page) => page.locator('[data-dec-primary]');

async function playOutWorkers(page: Page): Promise<number> {
  const session = await page.context().newCDPSession(page);
  const { targetInfos } = await session.send('Target.getTargets');
  await session.detach();
  return targetInfos.filter((t) => t.type === 'worker' && t.url.includes('play-out')).length;
}

/** Starts the game against the heuristic opponent with `workers` play-out workers and plays five turns. */
async function playTurns(page: Page, workers: number, seed: number): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(
    `/?autostart=white-knights,swamp-forest&seed=${seed}&freeMulligan=0&ai=normal&workers=${workers}`,
  );
  await page.getByRole('button', { name: 'Keep', exact: true }).click();
  await expect(primary(page)).toBeVisible({ timeout: 30_000 });
  // Press the primary button until turns of both players have gone by: the autopilot passes for the player,
  // so a click is a land, a spell, a block or a pass.
  const turns = new Set<string>();
  for (let guard = 0; guard < 80 && turns.size < 5; guard += 1) {
    const text = await page.getByTestId('game').innerText();
    const match = /(Your|Opponent's) turn (\d+)/.exec(text);
    if (match !== null) turns.add(`${match[1]}-${match[2]}`);
    const button = primary(page);
    await button.waitFor({ timeout: 30_000 });
    if (await button.isDisabled()) {
      const cards = page.getByRole('dialog').locator('[aria-pressed]');
      for (let i = 0; i < 4 && (await button.isDisabled()); i += 1) await cards.nth(i).click();
    }
    await button.click();
    await page.waitForTimeout(150);
  }
  await expect(page.locator('.dec-toast')).toHaveCount(0);
  await expect(page.getByText(/AI fallback/)).toHaveCount(0);
  expect(turns.size).toBeGreaterThanOrEqual(5);
  return errors;
}

test('?workers=2 starts two play-out workers with the game, and the game goes on', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const errors = await playTurns(page, 2, 3);
  expect(errors).toEqual([]);
  expect(await playOutWorkers(page)).toBe(2);
});

test('?workers=0 starts none', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = await playTurns(page, 0, 3);
  expect(errors).toEqual([]);
  expect(await playOutWorkers(page)).toBe(0);
});
