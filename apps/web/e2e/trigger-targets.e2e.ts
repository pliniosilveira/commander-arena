import { expect, type Page, test } from '@playwright/test';
import { settled } from './harness/settle';

/**
 * Triggered abilities that choose targets as they go on the stack (CR 603.3d, D-089). The listed
 * test decks hold none, so these games use the hidden SYNTHETIC deck `synthetic-trigger-targets`
 * (game/precons.ts: invented cards, not real ones) against the listed deck "Rats and Spiders". A
 * scripted player, with Full Control on, plays lands, Sol Rings and SYNTHETIC Reaper Imps (the
 * other Imps stay in the hand) until the situation under test is on screen. The engine and the AI
 * are seeded, so a given seed reaches it at the same point every time; the loop only waits for the
 * page to settle.
 */
const game = (seed: number) => `/?autostart=synthetic-trigger-targets,swamp-forest&seed=${seed}`;

// Seed 2: the opponent has two creatures when our first Reaper Imp enters, so its trigger asks for
// a target. Seed 6: the opponent has none then, so the trigger is removed (CR 603.3d).
const S_ASK = 2;
const S_NONE = 6;
const REAPER = 'SYNTHETIC Reaper Imp';

const primary = (page: Page) => page.locator('.dec-bar [data-dec-primary]');
/** Presses the bar's primary button if there is an enabled one right now; never waits for it. */
const press = (page: Page) =>
  primary(page)
    .click({ timeout: 150 })
    .catch(() => undefined);
const discardDialog = (page: Page) => page.getByRole('dialog', { name: /^Discard/ });
const logText = (page: Page) => page.getByRole('log');
const prompt = (page: Page) => page.locator('.dec-prompt');
const legalTargets = (page: Page) =>
  page.getByRole('region', { name: 'Legal targets' }).getByRole('button');
const askedForTrigger = (page: Page) =>
  prompt(page).filter({ hasText: `Choose a target for ${REAPER}'s ability` });

/** What the script casts and plays; every other card stays in the hand. */
const PLAY = /Swamp|Sol Ring|SYNTHETIC Reaper Imp/;

/** Plays on until `ready` holds. A trigger target question that is not the one wanted is answered. */
async function playUntil(page: Page, ready: () => Promise<boolean>): Promise<void> {
  const keepButton = page.getByRole('button', { name: 'Keep', exact: true });
  for (let step = 0; step < 600; step += 1) {
    await settled(page);
    if (await keepButton.isVisible()) {
      await keepButton.click();
    } else if (await discardDialog(page).isVisible()) {
      // The hand is over its limit (the other Imps are kept): discard one of those.
      const cards = discardDialog(page).locator('.dec-card-button');
      const spare = cards.filter({ hasNotText: PLAY });
      await ((await spare.count()) > 0 ? spare : cards).first().click();
      await discardDialog(page).getByRole('button', { name: 'Confirm' }).click();
    } else if (await ready()) {
      return;
    } else if ((await askedForTrigger(page).count()) > 0) {
      await legalTargets(page).first().click();
      await primary(page).click();
    } else {
      const cards = page.locator('.board-hand .is-clickable').filter({ hasText: PLAY });
      if ((await cards.count()) > 0) {
        await cards.first().click();
      } else {
        await press(page);
      }
    }
  }
  throw new Error('the game never reached the situation');
}

/** Starts the game with Full Control on, so our own trigger stays on the stack to be read. */
async function start(page: Page, seed: number): Promise<void> {
  await page.goto(game(seed));
  await page.getByRole('button', { name: 'Keep', exact: true }).click();
  await page.getByRole('button', { name: 'Full Control' }).click();
}

test('an enters trigger asks for its target with no Cancel; the arrow is on the stack and it resolves', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await start(page, S_ASK);
  await playUntil(page, async () => (await askedForTrigger(page).count()) > 0);

  // The prompt names the trigger and says what it does; the only legal targets are the opponent's
  // creatures, and there is no way out: no Cancel button, and Esc changes nothing.
  await expect(prompt(page)).toContainText(
    `Choose a target for ${REAPER}'s ability (whenever ${REAPER} enters): Destroy target creature an opponent controls.`,
  );
  await expect(page.getByRole('button', { name: 'Cancel' })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Stack' })).toContainText('Triggered ability');
  await page.keyboard.press('Escape');
  await expect(askedForTrigger(page)).toHaveCount(1);
  await expect(primary(page)).toBeDisabled();

  // Click the opponent's creature on the board, then Confirm.
  const victim = page
    .locator('[data-field-seat="1"] .board-tile.is-clickable')
    .filter({ hasNotText: REAPER })
    .first();
  const victimName = (await victim.locator('.board-tile-name').first().innerText()).trim();
  const victimId = await victim.getAttribute('data-object-id');
  await victim.click();
  await expect(page.locator('.board-ibadge', { hasText: 'Target' })).toHaveCount(1);
  await primary(page).click();

  // The trigger is on the stack with its target and an arrow to it, until it resolves.
  const item = page.locator('.pnl-stack-item.pnl-triggered', { hasText: REAPER });
  await expect(item).toHaveCount(1);
  await expect(item.locator('.pnl-stack-targets')).toContainText(victimName);
  await expect(page.locator('.pnl-arrow')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Cancel' })).toHaveCount(0);

  // The stack is in the controls column (issue 47) and the target on the battlefield: the arrow
  // starts at the stack item, at the edge that faces the board, and its tip is at the target's tile.
  // With the column on the right that edge is the item's left one; with it on the left, the right one.
  const reach = () =>
    page.evaluate(
      ([id]) => {
        const numbers = (s: string | null) => (s ?? '').match(/-?\d+(\.\d+)?/g)?.map(Number) ?? [];
        const [x0 = 0, y0 = 0] = numbers(
          document.querySelector('.pnl-arrow .pnl-arrow-shaft')?.getAttribute('d') ?? null,
        );
        const [tipX = 0, tipY = 0] = numbers(
          document.querySelector('.pnl-arrow .pnl-arrow-head')?.getAttribute('points') ?? null,
        );
        const gap = (r: DOMRect, x: number, y: number) =>
          Math.hypot(Math.max(r.left - x, 0, x - r.right), Math.max(r.top - y, 0, y - r.bottom));
        const from = document
          .querySelector('[data-testid="game-side-controls"] .pnl-stack-item')
          ?.getBoundingClientRect();
        const to = document.querySelector(`[data-object-id="${id}"]`)?.getBoundingClientRect();
        if (from === undefined || to === undefined) return null;
        return {
          start: gap(from, x0, y0),
          tip: gap(to, tipX, tipY),
          // How far the start is from the item's left and right edges.
          fromLeft: Math.abs(x0 - from.left),
          fromRight: Math.abs(x0 - from.right),
        };
      },
      [victimId],
    );
  const right = await reach();
  expect(right).not.toBeNull();
  expect(right?.start).toBeLessThanOrEqual(2);
  expect(right?.tip).toBeLessThanOrEqual(8);
  expect(right?.fromLeft).toBeLessThanOrEqual(2);
  // The dock is under the stack, in the same column, at the foot of it (D-146): the stack stays at
  // the top and the buttons do not move with it.
  const stackBox = await page.getByRole('region', { name: 'Stack' }).boundingBox();
  const barBox = await page.locator('.dec-dock').boundingBox();
  expect(barBox?.x).toBeCloseTo(stackBox?.x ?? -1, 0);
  expect((stackBox?.y ?? 0) + (stackBox?.height ?? 0)).toBeLessThanOrEqual((barBox?.y ?? 0) + 0.5);

  // Swap the columns: the stack is on the left now, the arrow leaves its right edge, same tip.
  await page.getByRole('button', { name: /Settings/ }).click();
  await page
    .getByRole('group', { name: 'Stack and controls side' })
    .getByRole('button', { name: 'Left', exact: true })
    .click();
  await expect(page.locator('html')).toHaveAttribute('data-side-panel', 'left');
  await expect.poll(async () => (await reach())?.fromRight ?? 99).toBeLessThanOrEqual(2);
  const left = await reach();
  expect(left?.start).toBeLessThanOrEqual(2);
  expect(left?.tip).toBeLessThanOrEqual(8);
  await page
    .getByRole('group', { name: 'Stack and controls side' })
    .getByRole('button', { name: 'Right', exact: true })
    .click();
  await page.getByRole('button', { name: /Settings/ }).click();

  for (let step = 0; step < 12; step += 1) {
    await settled(page);
    if ((await item.count()) === 0) break;
    await press(page);
  }
  await expect(item).toHaveCount(0);
  await expect(page.locator('.pnl-arrow')).toHaveCount(0);
  await expect(logText(page)).toContainText(`${victimName} dies.`);
  expect(errors).toEqual([]);
});

test('an enters trigger with no legal target is removed and the log says so', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await start(page, S_NONE);
  const removed = `${REAPER}'s ability has no legal target and is removed.`;
  await playUntil(page, async () => (await logText(page).innerText()).includes(removed));

  await expect(logText(page)).toContainText(removed);
  // It never reached the stack and nothing asked for a target.
  await expect(page.locator('.pnl-stack-item.pnl-triggered', { hasText: REAPER })).toHaveCount(0);
  await expect(askedForTrigger(page)).toHaveCount(0);
  expect(errors).toEqual([]);
});
