import { expect, type Page, test } from '@playwright/test';
import { settled } from './harness/settle';

/**
 * Playtest issue 46: "Pass Turn" gets through the rest of the player's turn with one click, stops
 * for what needs the player, and is cancelled by Esc or its Cancel button. The engine and the AI are
 * seeded; the hidden test deck of white-knights has no creature on the first turns, so the first main
 * phase offers the real Pass Turn as the primary button.
 */
const passTurn = (page: Page) =>
  page.getByRole('button', { name: 'Pass turn: skip to the end of my turn' });
const prompt = (page: Page) => page.locator('.dec-bar .dec-prompt');

/**
 * Presses Resolve while the opponent's spells wait on the stack (the player is always shown one, issue
 * 105) until the prompt reads "Your turn, Main 1": nothing else is clicked.
 */
async function resolveUntilFirstMain(page: Page): Promise<void> {
  for (let step = 0; step < 40; step += 1) {
    await settled(page);
    if ((await prompt(page).textContent()) === 'Your turn, Main 1') return;
    const button = page.locator('.dec-bar [data-dec-primary]');
    if ((await button.textContent()) === 'Resolve') await button.click();
  }
}

async function toFirstMain(page: Page): Promise<void> {
  await page.goto('/?autostart=white-knights,swamp-forest&seed=7');
  await page.getByRole('button', { name: 'Keep', exact: true }).click();
  await resolveUntilFirstMain(page);
  await expect(prompt(page)).toHaveText('Your turn, Main 1');
  await expect(passTurn(page)).toBeVisible();
}

/** Records every text the current-step marker of the turn tracker shows from now on. */
async function recordSteps(page: Page): Promise<void> {
  await page.evaluate(() => {
    const seen: string[] = [];
    const w = window as unknown as { __steps: string[] };
    w.__steps = seen;
    const note = () => {
      const text = document.querySelector('.pnl-step-current')?.textContent ?? '';
      if (text !== '' && seen[seen.length - 1] !== text) seen.push(text);
    };
    note();
    new MutationObserver(note).observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
    });
  });
}

const steps = (page: Page) =>
  page.evaluate(() => (window as unknown as { __steps: string[] }).__steps);

test('Pass Turn from the first main phase gets through the turn without more clicks', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await toFirstMain(page);
  // Play a land first, so that the hand is at seven cards at the end of the turn: a discard is a
  // question, and Pass Turn stops for questions (that is what the unit tests pin).
  await page.locator('.board-hand .is-clickable', { hasText: 'Land' }).first().click();
  await settled(page);
  // With nothing able to attack the primary button is the real Pass Turn, never a one-step "Pass Turn".
  await expect(page.locator('.dec-bar [data-dec-primary]')).toHaveText('Pass Turn');
  await recordSteps(page);

  await passTurn(page).click();
  await settled(page);

  // The game went through the second main phase and the end step on its own, into the opponent's
  // turn, and waits again at the player's next first main phase (the opponent's spells wait for a
  // Resolve of the player on the way, issue 105).
  await resolveUntilFirstMain(page);
  const seen = await steps(page);
  expect(seen).toContain('Main 2');
  expect(seen).toContain('End step');
  expect(seen.indexOf('Main 2')).toBeLessThan(seen.indexOf('End step'));
  await expect(prompt(page)).toHaveText('Your turn, Main 1');
  await expect(page.locator('.dec-passturn')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('Esc cancels a running Pass Turn, and the normal stops come back', async ({ page }) => {
  test.setTimeout(120_000);
  await toFirstMain(page);
  await passTurn(page).click();
  await expect(page.locator('.dec-passturn')).toContainText('Passing turn');
  await page.keyboard.press('Escape');
  await settled(page);

  await expect(page.locator('.dec-passturn')).toHaveCount(0);
  // Still the player's turn, waiting at the step the autopilot had reached, with the usual button.
  await expect(prompt(page)).toContainText('Your turn');
  await expect(prompt(page)).not.toHaveText('Your turn, Main 1');
  await expect(page.locator('.dec-bar [data-dec-primary]')).toBeEnabled();
});

test('the P key passes the turn and the Cancel pass button stops it', async ({ page }) => {
  test.setTimeout(120_000);
  await toFirstMain(page);
  await page.keyboard.press('p');
  await expect(page.locator('.dec-passturn')).toContainText('Esc to cancel');
  await page.getByRole('button', { name: 'Cancel pass' }).click();
  await settled(page);
  await expect(page.locator('.dec-passturn')).toHaveCount(0);
  await expect(prompt(page)).toContainText('Your turn');
});
