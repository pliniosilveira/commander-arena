import { expect, type Page, test } from '@playwright/test';
import { handCard, handLand, mine } from './harness/locators';
import { settled } from './harness/settle';

/**
 * Echo, Cumulative upkeep and the monarch (D-127). The listed decks hold none of them, so these games
 * use the hidden SYNTHETIC decks `synthetic-echo`, `synthetic-cumulative` and `synthetic-monarch`
 * (game/precons.ts): invented cards, not real ones. The monarch's loss in combat needs an attacker, so
 * the opponent plays `synthetic-hasty-goblins`. A scripted player, with Full Control on, plays lands and
 * casts the one card under test once; the engine and the AI are seeded and every click answers a
 * settled page (e2e/harness/settle.ts), so a seed reaches the same situation however slow the machine is.
 */
const game = (human: string, ai: string, seed: number) => `/?autostart=${human},${ai}&seed=${seed}`;

const primary = (page: Page) => page.locator('.dec-bar [data-dec-primary]');
const bar = (page: Page) => page.locator('.dec-bar');
const logText = (page: Page) => page.getByRole('log');
const stack = (page: Page) => page.getByRole('region', { name: 'Stack' });
const unlessDialog = (page: Page) => page.getByRole('dialog', { name: 'Unless you pay' });
const handCount = async (page: Page): Promise<number> =>
  Number(await page.locator('.board-strip-me [title="Cards in hand"] b').innerText());

/** Keeps the hand and turns Full Control on, so triggers stay on the stack for us to see. */
async function start(page: Page, human: string, ai: string, seed: number): Promise<void> {
  await page.goto(game(human, ai, seed));
  await page.getByRole('button', { name: 'Keep', exact: true }).click();
  await page.getByRole('button', { name: 'Full Control' }).click();
}

/**
 * Plays on until `ready` holds on a settled page: lands first, then `cast` once while none of it is on
 * the battlefield, and the primary button otherwise. A hand over its limit discards its first card.
 */
async function playUntil(
  page: Page,
  ready: () => Promise<boolean>,
  cast: string | null = null,
): Promise<void> {
  const discard = page.getByRole('dialog', { name: /^Discard/ });
  for (let step = 0; step < 900; step += 1) {
    await settled(page);
    if (await ready()) return;
    if (await page.getByRole('dialog', { name: /^You (win|lose)/ }).isVisible()) {
      throw new Error('the game ended before it reached the situation');
    }
    if (await discard.isVisible()) {
      // The monarch's extra card can put the hand two over the limit: choose until Confirm opens.
      const confirm = discard.getByRole('button', { name: 'Confirm' });
      const cards = discard.locator('.dec-card-button');
      for (let i = 0; i < 4 && (await confirm.isDisabled()); i += 1) {
        await cards.nth(i).click();
      }
      await confirm.click();
    } else if ((await page.locator('.dec-overlay').count()) > 0) {
      throw new Error('an unexpected dialog is open');
    } else if ((await handLand(page).count()) > 0) {
      await handLand(page).first().click();
    } else if (
      cast !== null &&
      (await mine(page, cast).count()) === 0 &&
      (await handCard(page, cast).count()) > 0
    ) {
      await handCard(page, cast).first().click();
    } else if ((await primary(page).count()) > 0 && (await primary(page).isEnabled())) {
      await primary(page).click();
    }
  }
  throw new Error('the game never reached the situation');
}

const onBoard = (page: Page, name: string) => async () =>
  (await mine(page, name).count()) > 0 &&
  (await stack(page).locator('.pnl-stack-item').count()) === 0;

test('Echo paid by hand: the question, the payment, the permanent stays', async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const hound = 'SYNTHETIC Echo Hound';
  await start(page, 'synthetic-echo', 'synthetic-echo', 1);
  await playUntil(page, onBoard(page, hound), hound);
  // From here on mana is paid by hand, so the payment step of the question shows.
  await page.getByRole('button', { name: 'Manual mana' }).click();
  await playUntil(page, async () => unlessDialog(page).isVisible());

  const dialog = unlessDialog(page);
  await expect(dialog.locator('.dec-sub').last()).toHaveText(
    `Echo: pay {1}{R} or sacrifice ${hound}?`,
  );
  await expect(dialog.getByRole('button', { name: 'Pay', exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Sacrifice it', exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: "Don't pay" })).toHaveCount(0);
  // The ability on the stack says what it does.
  await expect(stack(page)).toContainText(`sacrifice this creature unless you pay {1}{R}`);

  await dialog.getByRole('button', { name: 'Pay', exact: true }).click();
  await settled(page);
  await expect(bar(page)).toContainText(
    `Echo: pay {1}{R} or sacrifice ${hound}: tap your mana sources.`,
  );
  await expect(bar(page).getByRole('button', { name: 'Sacrifice it' })).toBeVisible();
  await bar(page).getByRole('button', { name: 'Auto-pay' }).click();
  await settled(page);
  await expect(logText(page)).toContainText('You pay {1}{R}.');
  await expect(logText(page)).not.toContainText("You don't pay");
  await expect(mine(page, hound)).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('Echo declined: "Sacrifice it" sacrifices the permanent', async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const hound = 'SYNTHETIC Echo Hound';
  await start(page, 'synthetic-echo', 'synthetic-echo', 1);
  await playUntil(page, async () => unlessDialog(page).isVisible(), hound);
  await expect(mine(page, hound)).toHaveCount(1);

  await unlessDialog(page).getByRole('button', { name: 'Sacrifice it', exact: true }).click();
  await settled(page);
  await expect(unlessDialog(page)).toBeHidden();
  await expect(logText(page)).toContainText("You don't pay.");
  await expect(mine(page, hound)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('Cumulative upkeep: age counters grow, the cost repeats, backing out of the payment sacrifices', async ({
  page,
}) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const wall = 'SYNTHETIC Aging Wall';
  await start(page, 'synthetic-cumulative', 'synthetic-cumulative', 1);
  await playUntil(page, async () => unlessDialog(page).isVisible(), wall);

  // The first upkeep: one age counter, paid {1}.
  const dialog = unlessDialog(page);
  await expect(dialog.locator('.dec-sub').last()).toHaveText(
    `Cumulative upkeep: pay {1} (1 age counter) or sacrifice ${wall}?`,
  );
  await expect(mine(page, wall).locator('.board-counter')).toHaveText('age 1');
  await dialog.getByRole('button', { name: 'Pay', exact: true }).click();
  await settled(page);
  await expect(logText(page)).toContainText('You pay {1}.');
  await expect(mine(page, wall)).toHaveCount(1);

  // The next one: two age counters, the whole {1}{1} or nothing. Pay it by hand and back out.
  await page.getByRole('button', { name: 'Manual mana' }).click();
  await playUntil(page, async () => unlessDialog(page).isVisible());
  await expect(dialog.locator('.dec-sub').last()).toHaveText(
    `Cumulative upkeep: pay {1}{1} (2 age counters) or sacrifice ${wall}?`,
  );
  await expect(mine(page, wall).locator('.board-counter')).toHaveText('age 2');
  await dialog.getByRole('button', { name: 'Pay', exact: true }).click();
  await settled(page);
  await expect(bar(page)).toContainText(
    `Cumulative upkeep: pay {1}{1} (2 age counters) or sacrifice ${wall}: tap your mana sources.`,
  );
  await bar(page).getByRole('button', { name: 'Sacrifice it' }).click();
  await settled(page);
  await expect(logText(page)).toContainText("You don't pay.");
  await expect(mine(page, wall)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('the monarch: the crown, the end-step draw on the stack as "The monarch"', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const herald = 'SYNTHETIC Court Herald';
  const draw = 'At the beginning of your end step, draw a card.';
  await start(page, 'synthetic-monarch', 'synthetic-hasty-goblins', 1);
  await playUntil(page, async () => (await page.locator('[data-monarch]').count()) > 0, herald);

  // The crown is on our strip only, and the log says so.
  await expect(page.locator('.board-strip-me [data-monarch="0"]')).toHaveText(/Monarch/);
  await expect(page.locator('.board-strip-opp [data-monarch]')).toHaveCount(0);
  await expect(logText(page)).toContainText('You become the monarch.');
  // And the top bar says so (issue 34).
  await expect(page.locator('[data-monarch-hud="0"]')).toHaveText(/You are the monarch/);

  // Our end step: the monarch's ability is on the stack, named for what it is, with its words.
  const item = stack(page).locator('.pnl-stack-item', { hasText: 'The monarch' });
  await playUntil(page, async () => (await item.count()) > 0);
  await expect(item).toContainText('Triggered ability');
  await expect(item).toContainText(draw);
  // There is no card behind it: hovering shows nothing in the preview panel.
  await page.mouse.move(0, 0);
  await item.hover();
  await page.waitForTimeout(400);
  await expect(page.locator('.board-preview-card[data-preview-id]')).toHaveCount(0);
  await page.mouse.move(0, 0);

  const before = await handCount(page);
  await primary(page).click();
  await settled(page);
  await expect(logText(page)).toContainText('The monarch triggers.');
  expect(await handCount(page)).toBe(before + 1);
  expect(errors).toEqual([]);
});

test('the monarch: a creature that deals combat damage to us takes the crown', async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // A sorcery, not a creature: a blocker would keep the goblins from attacking.
  const claim = 'SYNTHETIC Crown Claim';
  const steal =
    'Whenever a creature deals combat damage to you, its controller becomes the monarch.';
  await start(page, 'synthetic-monarch', 'synthetic-hasty-goblins', 1);
  await playUntil(page, async () => (await page.locator('[data-monarch]').count()) > 0, claim);
  await expect(page.locator('.board-strip-me [data-monarch="0"]')).toHaveCount(1);

  // The opponent's hasty goblins attack; we do not block. The steal goes on the stack.
  const item = stack(page).locator('.pnl-stack-item', { hasText: 'The monarch' });
  await playUntil(page, async () => (await item.filter({ hasText: steal }).count()) > 0);
  await primary(page).click();
  await settled(page);
  await expect(logText(page)).toContainText('Opponent becomes the monarch.');
  await expect(page.locator('.board-strip-opp [data-monarch="1"]')).toHaveText(/Monarch/);
  await expect(page.locator('.board-strip-me [data-monarch]')).toHaveCount(0);
  expect(errors).toEqual([]);
});
