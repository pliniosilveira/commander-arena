import { expect, test } from '@playwright/test';
import { playUntil, primary } from './harness/restrictions-script';

/**
 * Restrictions, requirements and evasion (D-094, D-098). The listed test decks hold none of them,
 * so the games use the hidden SYNTHETIC deck `synthetic-restrictions` (game/precons.ts): invented
 * cards, not real ones, against the same deck. The scripted player plays what it can, never
 * attacks and never blocks, until the situation is on screen. The engine and the AI are seeded
 * and the script acts only on a settled page (harness/settle.ts), so a seed reaches its situation
 * at the same point every time.
 */
const game = (seed: number) =>
  `/?autostart=synthetic-restrictions,synthetic-restrictions&seed=${seed}`;

// Seeds found by scanning games with the scripted player.
const S_MUST = 3;
const S_EVASION = 2;

test('a creature that attacks each combat starts chosen, cannot be taken out and says why', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(game(S_MUST));
  await playUntil(
    page,
    async () => (await page.locator('.board-ibadge', { hasText: 'Must attack' }).count()) > 0,
  );

  const badge = page.locator('.board-ibadge', { hasText: 'Must attack' });
  await expect(badge).toHaveCount(1);
  const tile = page.locator('.board-tile.is-selected', { hasText: 'SYNTHETIC Berserker' });
  await expect(tile).toHaveCount(1);
  // The tile carries the restriction chip; the bar names the requirement.
  await expect(tile.locator('.board-kw-restrict[title="Attacks each combat"]')).toHaveCount(1);
  await expect(page.locator('.dec-bar')).toContainText(
    'SYNTHETIC Berserker must attack each combat if able.',
  );
  await expect(primary(page)).toHaveText('Declare attackers (1)');

  // A click does not take it out of the attack; a message says why.
  await tile.click();
  await expect(page.getByRole('alert')).toContainText(
    'SYNTHETIC Berserker must attack each combat if able.',
  );
  await expect(badge).toHaveCount(1);
  await expect(primary(page)).toHaveText('Declare attackers (1)');

  await primary(page).click();
  await expect(page.getByRole('log')).toContainText('You attack with SYNTHETIC Berserker');
  expect(errors).toEqual([]);
});

test('blocking an evasive attacker: the bar says why the picked creature cannot block it', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(game(S_EVASION));
  const evasive = page.locator('[data-field-seat="1"] .board-tile.is-attacking').filter({
    has: page.locator(
      '.board-kw[title*="blocked" i], .board-kw[title*="walk" i], .board-kw[title="Fear"], .board-kw[title="Intimidate"], .board-kw[title="Shadow"]',
    ),
  });
  const mine = page.locator('[data-field-seat="0"] .board-tile.is-clickable');
  const bar = page.locator('.dec-bar');
  await playUntil(page, async () => {
    if (!(await page.getByText('Declare blockers.').isVisible())) return false;
    if ((await evasive.count()) === 0) return false;
    // Pick up each creature that may block until one cannot block the evasive attacker.
    for (let i = 0; i < (await mine.count()); i += 1) {
      await mine.nth(i).click();
      if ((await bar.innerText()).includes("can't block")) return true;
      await mine.nth(i).click();
    }
    return false;
  });

  await expect(bar).toContainText('selected: click an attacker to block it.');
  await expect(bar).toContainText(
    /can't block .+ \((can't be blocked|islandwalk: you control an Island|nonbasic landwalk: [^)]+|fear: only artifact or black creatures can block it|intimidate: [^)]+|shadow: [^)]+)\)/,
  );
  // Picking the creature up again releases it: the explanation goes with it.
  await page.locator('[data-field-seat="0"] .board-tile.is-selected').click();
  await expect(bar).not.toContainText("can't block");
  expect(errors).toEqual([]);
});
