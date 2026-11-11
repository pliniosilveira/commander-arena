import { expect, type Page, test } from '@playwright/test';
import { settled } from './harness/settle';

/**
 * The turn is named "Your turn 5" / "Opponent's turn 5": the official word, numbered by round
 * (issue 52, D-153), and the active player's whole area is highlighted (the owner's follow-up).
 * The engine's own turn counter is unchanged; only the words and the numbers on screen are.
 * Full Control stops at every step, so each turn is on screen long enough to be read.
 */
const game = '/?autostart=white-knights,swamp-forest&seed=1&freeMulligan=0';
const primary = (page: Page) => page.locator('.dec-bar [data-dec-primary]');
const label = (page: Page) => page.locator('[data-turn-label]');
const field = (page: Page, seat: number) => page.locator(`[data-field-seat="${seat}"]`);

async function start(page: Page): Promise<void> {
  await page.goto(game);
  await page.getByRole('button', { name: 'Keep', exact: true }).click();
  await page.getByRole('button', { name: 'Full Control' }).click();
  await settled(page);
}

test("the top bar and the log read Your turn 1, Opponent's turn 1, Your turn 2; the highlight follows", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await start(page);

  const seen: string[] = [];
  for (let guard = 0; guard < 200 && !seen.includes('Your turn 2'); guard += 1) {
    await settled(page);
    const text = (await label(page).innerText()).trim();
    if (seen[seen.length - 1] !== text) {
      seen.push(text);
      // The area of the player whose turn it is carries the highlight and says so; the other does not.
      const mine = text.startsWith('Your');
      await expect(field(page, 0)).toHaveClass(mine ? /is-active-area/ : /is-idle-area/);
      await expect(field(page, 1)).toHaveClass(mine ? /is-idle-area/ : /is-active-area/);
      await expect(field(page, 0)).toHaveAttribute(
        'aria-label',
        mine ? 'Your battlefield, your turn' : 'Your battlefield',
      );
      await expect(field(page, 1)).toHaveAttribute(
        'aria-label',
        mine ? "Opponent's battlefield" : "Opponent's battlefield, opponent's turn",
      );
      await expect(page.locator('.board-strip.is-active-area')).toHaveCount(1);
      await expect(page.locator('.board-hand')).toHaveClass(
        mine ? /is-active-area/ : /is-idle-area/,
      );
    }
    if ((await primary(page).count()) > 0 && (await primary(page).isEnabled())) {
      await primary(page).click();
    }
  }
  // The human goes first in this seed: both players have turn 1, then it is round 2.
  expect(seen).toEqual(['Your turn 1', "Opponent's turn 1", 'Your turn 2']);

  // The log says the same, in the lines of the new turns and in the headings that group them.
  const log = page.getByRole('log', { name: 'Game events' });
  await expect(log).toContainText('Your turn 1 begins.');
  await expect(log).toContainText("Opponent's turn 1 begins.");
  await expect(log).toContainText('Your turn 2 begins.');
  await expect(log).not.toContainText(/Turn \d+:/);
  await expect(page.locator('.pnl-log-turn')).toHaveText([
    'Setup',
    'Your turn 1',
    "Opponent's turn 1",
    'Your turn 2',
  ]);
  expect(errors).toEqual([]);
});

test('the highlight does not move anything, and the commander tile stays reachable at 1280x720 Large', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 720 });
  await start(page);
  const selectors = [
    '.dec-bar [data-dec-primary]',
    '.board-strip-me',
    '.board-strip-opp',
    '.board-field-me',
    '.board-field-opp',
    '.board-hand',
    '[data-seat-zone="0"] .board-cmdr',
  ];
  const boxes = () =>
    page.evaluate(
      (list) =>
        list.map((sel) => {
          const r = document.querySelector(sel)?.getBoundingClientRect();
          return r === undefined ? null : [r.x, r.y, r.width, r.height];
        }),
      selectors,
    );
  const withHighlight = await boxes();
  // Take the highlight classes off: the same game state, the same boxes.
  await page.evaluate(() => {
    for (const el of document.querySelectorAll('.is-active-area')) {
      el.classList.replace('is-active-area', 'is-idle-area');
    }
  });
  expect(await boxes()).toEqual(withHighlight);
  expect(withHighlight.every((b) => b !== null)).toBe(true);

  const reachable = await page.evaluate(() => {
    const el = document.querySelector('[data-seat-zone="0"] .board-cmdr');
    if (el === null) return false;
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return hit !== null && el.contains(hit);
  });
  expect(reachable).toBe(true);
});
