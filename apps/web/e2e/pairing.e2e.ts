import { expect, type Page, test } from '@playwright/test';
import { reachBlocks as reach } from './harness/blocks';
import { settled } from './harness/settle';

/**
 * Block pairing (owner playtest: "3 of my 4 zombies were blocked but I didn't know what card was blocking what
 * token"). Both players play the hidden SYNTHETIC deck `synthetic-hasty-goblins` (game/precons.ts): identical
 * Goblins with haste. A scripted player, with Full Control on, plays lands and Goblins and passes until the
 * opponent attacks with several Goblins and the declare blockers question opens. The engine and the AI are seeded
 * and every click answers a settled page (e2e/harness/settle.ts), so a seed reaches the same game every time.
 */
const SEED = Number(process.env.PAIR_SEED ?? 1);
const game = (seed: number) =>
  `/?autostart=synthetic-hasty-goblins,synthetic-hasty-goblins&seed=${seed}`;
const SHOTS = process.env.SHOTS_DIR;

const primary = (page: Page) => page.locator('.dec-bar [data-dec-primary]');
const mine = (page: Page) => page.locator('[data-field-seat="0"] .board-tile.is-clickable');
const theirs = (page: Page) => page.locator('[data-field-seat="1"] .board-tile');

const reachBlocks = (page: Page, attackers: number, blockers: number) =>
  reach(page, attackers, blockers, shot);

const shot = async (page: Page, name: string) => {
  if (SHOTS !== undefined) await page.screenshot({ path: `${SHOTS}/${name}.png` });
};

const pair = (page: Page, n: number) => page.locator(`.board-tile[data-pairs="${n}"]`);

test('pairing badges: a blocked attacker and each blocker share a number, an unblocked one is open', async ({
  page,
}) => {
  test.setTimeout(150_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(game(SEED));
  await page.getByRole('button', { name: 'Keep', exact: true }).click();
  await page.getByRole('button', { name: 'Full Control' }).click();
  await reachBlocks(page, 4, 3);

  // While choosing, every attacker has a number; picking a block pairs the blocker with it.
  const attackers = theirs(page).locator('xpath=self::*[contains(@class,"is-attacking")]');
  await expect(attackers.locator('.board-pair-open')).toHaveCount(await attackers.count());
  const blockers = mine(page);
  for (const [i, n] of [1, 2, 4].entries()) {
    await blockers.nth(i).click();
    await page.locator(`[data-field-seat="1"] .board-tile[data-pairs="${n}"]`).click();
  }
  await shot(page, 'choosing-blocks');
  // The declare blockers dock is in the column of the stack: it overlaps nothing on the board.
  expect(
    await page.evaluate(() => {
      const dock = document.querySelector('.dec-dock')?.getBoundingClientRect();
      const board = document.querySelector('.board')?.getBoundingClientRect();
      return dock !== undefined && board !== undefined && dock.left >= board.right - 0.5;
    }),
  ).toBe(true);
  // The tall declare blockers dock leaves the commander tile reachable.
  expect(
    await page.evaluate(() => {
      const tiles = [...document.querySelectorAll('.board-cmdr')];
      const box = tiles[tiles.length - 1]?.getBoundingClientRect();
      if (box === undefined) return false;
      const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      return hit !== null && (tiles[tiles.length - 1]?.contains(hit) ?? false);
    }),
  ).toBe(true);
  for (const n of [1, 2, 4]) await expect(pair(page, n)).toHaveCount(2);
  await expect(pair(page, 3)).toHaveCount(1);

  // Declared: the same numbers on both ends, the unblocked attacker in outline.
  await primary(page).click();
  await settled(page);
  await shot(page, 'declared-blocks');
  for (const n of [1, 2, 4]) {
    await expect(pair(page, n)).toHaveCount(2);
    await expect(pair(page, n).locator(`.board-pair.pair-c${n}`)).toHaveCount(2);
  }
  await expect(pair(page, 3)).toHaveCount(1);
  await expect(pair(page, 3).locator('.board-pair-open')).toHaveCount(1);
  await expect(pair(page, 3)).toHaveAttribute('aria-label', /unblocked \(#3\)/);
  await expect(page.locator('[data-field-seat="0"] .board-tile[data-pairs="2"]')).toHaveAttribute(
    'aria-label',
    /Blocking Raging Goblin \(#2\)/,
  );
  await expect(page.getByRole('log')).toContainText('Raging Goblin blocks Raging Goblin (#2)');

  // Hovering a blocker lights its attacker, and the preview names the pair.
  const blocker = page.locator('[data-field-seat="0"] .board-tile[data-pairs="2"]');
  await blocker.hover();
  await expect(page.locator('[data-field-seat="1"] .board-tile[data-pairs="2"]')).toHaveClass(
    /is-pair-hot/,
  );
  await expect(page.locator('[data-field-seat="1"] .board-tile[data-pairs="4"]')).not.toHaveClass(
    /is-pair-hot/,
  );
  await expect(page.locator('.board-preview')).toContainText('Blocking Raging Goblin (#2)');
  await shot(page, 'hover-blocker');
  expect(errors).toEqual([]);
});
