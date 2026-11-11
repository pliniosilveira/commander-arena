import { expect, type Page, test } from '@playwright/test';
import { settled } from './harness/settle';

/**
 * Playtest issue 35: after blockers are declared the player is asked before combat damage (CR 509.2,
 * 117.4), so an ability can still be used. Full Control is on, as the owner had it; the engine and the
 * AI are seeded and every click answers a settled page (e2e/harness/settle.ts).
 */
const bar = (page: Page) => page.locator('.dec-bar');
const primary = (page: Page) => page.locator('.dec-bar [data-dec-primary]');
const log = (page: Page) => page.getByRole('log');
const mine = (page: Page) => page.locator('[data-field-seat="0"] .board-tile.is-clickable');
const theirs = (page: Page) => page.locator('[data-field-seat="1"] .board-tile.is-clickable');

const damageLines = async (page: Page): Promise<number> =>
  ((await log(page).innerText()).match(/combat damage/g) ?? []).length;

test('after blocking, the player has priority in the declare blockers step before damage', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?autostart=white-knights,swamp-forest&seed=2');
  await page.getByRole('button', { name: 'Keep', exact: true }).click();
  await page.getByRole('button', { name: 'Full Control' }).click();

  const blocking = bar(page).getByText('Click a creature, then the attacker it blocks.');
  for (let step = 0; step < 900; step += 1) {
    await settled(page);
    if (await page.getByRole('dialog', { name: /^You (win|lose)/ }).isVisible()) {
      throw new Error('the game ended before a block was possible');
    }
    if (await page.getByRole('dialog', { name: /^Discard/ }).isVisible()) {
      throw new Error('a discard is open');
    }
    if (await blocking.isVisible()) break;
    const land = page.locator('.board-hand .is-clickable', { hasText: 'Land' });
    const spell = page.locator('.board-hand .is-clickable');
    if ((await land.count()) > 0) await land.first().click();
    else if ((await spell.count()) > 0) await spell.first().click();
    else if ((await primary(page).count()) > 0 && (await primary(page).isEnabled())) {
      await primary(page).click();
    }
  }
  await expect(blocking).toBeVisible();

  // Block the first attacker with the first creature that can block, and confirm.
  const before = await damageLines(page);
  await mine(page).first().click();
  await theirs(page).first().click();
  await primary(page).click();
  await settled(page);

  // The game is waiting for us in the declare blockers step: nothing has been dealt, and the button passes.
  await expect(page.locator('.pnl-step-current')).toHaveText('Blockers');
  await expect(bar(page)).toContainText("Opponent's turn, Blockers");
  await expect(primary(page)).toHaveText(/^To (First Strike|Combat) Damage$/);
  expect(await damageLines(page)).toBe(before);

  // Passing is what lets combat damage happen.
  await primary(page).click();
  await settled(page);
  await expect.poll(() => damageLines(page)).toBeGreaterThan(before);
  expect(errors).toEqual([]);
});

test('with the default stops, holding an ability, the player is still asked before damage', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // The hidden SYNTHETIC deck of activated abilities (game/precons.ts): invented pump creatures.
  await page.goto('/?autostart=synthetic-abilities,swamp-forest&seed=2');
  await page.getByRole('button', { name: 'Keep', exact: true }).click();

  const blocking = bar(page).getByText('Click a creature, then the attacker it blocks.');
  for (let step = 0; step < 900; step += 1) {
    await settled(page);
    if (await page.getByRole('dialog', { name: /^You (win|lose)/ }).isVisible()) {
      throw new Error('the game ended before a block was possible');
    }
    if (await blocking.isVisible()) break;
    const land = page.locator('.board-hand .is-clickable', { hasText: 'Land' });
    // A sacrifice outlet and creatures only: the cards that need no choice to cast.
    const cast = page.locator('.board-hand .is-clickable', {
      hasText: /SYNTHETIC Altar|SYNTHETIC Pump Bear|Grizzly Bears/,
    });
    if ((await land.count()) > 0) await land.first().click();
    else if ((await cast.count()) > 0) await cast.first().click();
    else if ((await primary(page).count()) > 0 && (await primary(page).isEnabled())) {
      await primary(page).click();
    }
  }
  await expect(blocking).toBeVisible();
  const before = await damageLines(page);
  await mine(page).first().click();
  await theirs(page).first().click();
  await primary(page).click();
  await settled(page);

  // No stop was set and Full Control is off: an ability we can use is why we are asked.
  await expect(page.locator('.pnl-step-current')).toHaveText('Blockers');
  await expect(bar(page)).toContainText("Opponent's turn, Blockers");
  expect(await damageLines(page)).toBe(before);
  // Something we control has an ability to use.
  await expect(mine(page).first()).toBeVisible();
  expect(errors).toEqual([]);
});
