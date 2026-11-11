import { expect, type Page, test } from '@playwright/test';
import { settled } from './harness/settle';

/**
 * Step triggers and "unless that player pays" (D-108, D-111). The listed test decks hold neither, so
 * these games use the hidden SYNTHETIC deck `synthetic-triggers-more` (game/precons.ts: invented
 * cards, not real ones) against the same deck. A scripted player, with Full Control on, plays lands
 * and casts whatever it can until the situation under test is on screen. The engine and the AI are
 * seeded and every click answers a settled page (e2e/harness/settle.ts), so a seed reaches the same
 * situation however slow the machine is.
 */
const game = (seed: number) =>
  `/?autostart=synthetic-triggers-more,synthetic-triggers-more&seed=${seed}`;

const SEED = { combatTrigger: 2, unlessPays: 2 };

const primary = (page: Page) => page.locator('.dec-bar [data-dec-primary]');
const stack = (page: Page) => page.getByRole('region', { name: 'Stack' });
const unlessDialog = (page: Page) => page.getByRole('dialog', { name: 'Unless you pay' });
const optionalDialog = (page: Page) => page.getByRole('dialog', { name: 'Optional ability' });
const discardDialog = (page: Page) => page.getByRole('dialog', { name: /^Discard/ });
const logText = (page: Page) => page.getByRole('log');

/** Presses the bar's primary button if there is an enabled one right now; never waits for it. */
const press = (page: Page) =>
  primary(page)
    .click({ timeout: 150 })
    .catch(() => undefined);

/** Starts the game with Full Control on, so our own triggers stay on the stack. */
async function start(page: Page, seed: number): Promise<void> {
  await page.goto(game(seed));
  await page.getByRole('button', { name: 'Keep', exact: true }).click();
  await page.getByRole('button', { name: 'Full Control' }).click();
}

/**
 * Plays on until `ready` holds. A hand over its limit discards its first card, a "you may" asks
 * Yes, and everything else is played whenever it can be.
 */
async function playUntil(page: Page, ready: () => Promise<boolean>): Promise<void> {
  for (let step = 0; step < 600; step += 1) {
    await settled(page);
    if (await ready()) return;
    if (await page.getByRole('dialog', { name: /^You (win|lose)/ }).isVisible()) {
      throw new Error('the game ended before it reached the situation');
    }
    if (await discardDialog(page).isVisible()) {
      await discardDialog(page).locator('.dec-card-button').first().click();
      await discardDialog(page).getByRole('button', { name: 'Confirm' }).click();
    } else if (await optionalDialog(page).isVisible()) {
      await optionalDialog(page).getByRole('button', { name: 'Yes' }).click();
    } else if (await unlessDialog(page).isVisible()) {
      await unlessDialog(page)
        .getByRole('button', { name: /^Don't / })
        .click();
    } else {
      const cards = page.locator('.board-hand .is-clickable');
      if ((await cards.count()) > 0) {
        await cards.first().click();
      } else {
        await press(page);
      }
    }
  }
  throw new Error('the game never reached the situation');
}

const WHEN = 'At the beginning of combat on your turn, you gain 1 life';

test('a beginning-of-combat trigger goes on the stack with its wording', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await start(page, SEED.combatTrigger);
  await playUntil(page, async () => (await stack(page).getByText(WHEN).count()) > 0);

  const item = stack(page).locator('.pnl-stack-item', { hasText: WHEN });
  await expect(item).toContainText('SYNTHETIC Step Watcher beginCombat you');
  await expect(item).toContainText('Triggered ability');
  // The trigger is the top of the stack and resolves when we pass; the log names it.
  await press(page);
  await settled(page);
  await expect(logText(page)).toContainText('SYNTHETIC Step Watcher beginCombat you triggers.');
  expect(errors).toEqual([]);
});

/** What the question's prompt says happens if we do not pay, as the log words it. */
function declineLine(prompt: string): string {
  const effect = prompt.replace(/^.* or /, '').replace(/\?$/, '');
  return `You don't pay; ${effect}.`;
}

test('"unless that player pays": decline, and the effect happens', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await start(page, SEED.unlessPays);
  await playUntil(page, async () => unlessDialog(page).isVisible());

  const dialog = unlessDialog(page);
  const prompt = (await dialog.locator('.dec-sub').last().innerText()).trim();
  expect(prompt).toMatch(/^(Pay|Discard) .+ or .+\?$/);
  expect(prompt).not.toMatch(/undefined|\[object/);
  // The ability that asks is on the stack, with what set it off.
  await expect(stack(page)).toContainText('Whenever');
  await expect(dialog.getByRole('button', { name: /^Pay|^Discard/ })).toBeVisible();

  await dialog.getByRole('button', { name: /^Don't / }).click();
  await expect(dialog).toBeHidden();
  await expect(logText(page)).toContainText(declineLine(prompt));
  // It cannot be taken back.
  await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled();
  expect(errors).toEqual([]);
});

test('"unless that player pays": pay, and nothing happens', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await start(page, SEED.unlessPays);
  await playUntil(page, async () => unlessDialog(page).isVisible());

  const dialog = unlessDialog(page);
  const prompt = (await dialog.locator('.dec-sub').last().innerText()).trim();
  const cost = /^Pay (\{[^}]+\}+)/.exec(prompt)?.[1];
  expect(cost, 'a mana cost to pay').toBeDefined();
  // The page pays the mana by itself (the autopilot sends Auto-pay unless Manual mana is on;
  // the manual payment's words are in unless-model.test.ts).
  await dialog.getByRole('button', { name: 'Pay', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(logText(page)).toContainText(`You pay ${cost}.`);
  await expect(logText(page)).not.toContainText("You don't pay");
  expect(errors).toEqual([]);
});
