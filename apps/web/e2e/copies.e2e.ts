import { expect, type Page, test } from '@playwright/test';
import { handCard } from './harness/locators';
import { settled } from './harness/settle';

/**
 * Copies of spells, Storm and Replicate (D-129). The listed decks hold none, so these games use the
 * hidden SYNTHETIC decks `synthetic-storm` and `synthetic-replicate` (game/precons.ts): invented
 * cards, not real ones. Every click answers a settled page (e2e/harness/settle.ts), so a seed reaches
 * the same situation however slow the machine is. Full Control keeps each spell on the stack.
 */
const game = (human: string, seed: number) => `/?autostart=${human},swamp-forest&seed=${seed}`;

const primary = (page: Page) => page.locator('.dec-bar [data-dec-primary]');
const bar = (page: Page) => page.locator('.dec-bar');
const stack = (page: Page) => page.getByRole('region', { name: 'Stack' });
const stackItems = (page: Page) => stack(page).locator('.pnl-stack-item');
const targets = (page: Page) => page.getByRole('region', { name: 'Legal targets' });

async function untappedLands(page: Page): Promise<number> {
  return page
    .locator('[data-field-seat="0"] .board-tile:not(.is-tapped)')
    .filter({ has: page.locator('.board-tile-name', { hasText: /^Mountain$/ }) })
    .count();
}

/** Plays lands and passes until the hand and the board are ready, with no dialog and an empty stack. */
async function playUntil(page: Page, card: string, spells: number, lands: number): Promise<void> {
  const discard = page.getByRole('dialog', { name: /^Discard/ });
  for (let step = 0; step < 1200; step += 1) {
    await settled(page);
    const noDialog = (await page.locator('.dec-overlay').count()) === 0;
    if (
      noDialog &&
      (await stackItems(page).count()) === 0 &&
      (await handCard(page, card).count()) >= spells &&
      (await untappedLands(page)) >= lands
    ) {
      return;
    }
    if (await page.getByRole('dialog', { name: /^You (win|lose)/ }).isVisible()) {
      throw new Error('the game ended before it reached the situation');
    }
    if (await page.getByRole('button', { name: 'Keep', exact: true }).isVisible()) {
      await page.getByRole('button', { name: 'Keep', exact: true }).click();
    } else if (await discard.isVisible()) {
      await discard.locator('.dec-card-button').first().click();
      await discard.getByRole('button', { name: 'Confirm' }).click();
    } else if (!noDialog) {
      throw new Error('an unexpected dialog is open');
    } else if (
      (await page.locator('.board-hand .is-clickable', { hasText: 'Basic Land' }).count()) > 0
    ) {
      await page.locator('.board-hand .is-clickable', { hasText: 'Basic Land' }).first().click();
    } else if ((await primary(page).count()) > 0 && (await primary(page).isEnabled())) {
      await primary(page).click();
    }
  }
  throw new Error('the game never reached the situation');
}

/** Casts one copy of `card` at the opponent (the first target question), leaving the count dialog to the caller. */
async function castAtOpponent(page: Page, card: string): Promise<void> {
  await handCard(page, card).first().click();
  await settled(page);
}

async function chooseOpponent(page: Page): Promise<void> {
  await expect(bar(page)).toContainText('Choose a target for');
  await targets(page).getByRole('button', { name: 'Opponent' }).click();
  await bar(page).getByRole('button', { name: 'Confirm' }).click();
  await settled(page);
}

test('Storm: the third spell copies twice; the copies are on the stack and ask for new targets', async ({
  page,
}) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const bolt = 'SYNTHETIC Storm Bolt';
  await page.goto(game('synthetic-storm', 1));
  await playUntil(page, bolt, 3, 3);
  await page.getByRole('button', { name: 'Full Control' }).click();

  // The hint of the storm count shows while a storm card is in hand.
  await expect(page.locator('[data-spells-cast]')).toContainText('Spells cast this turn');

  for (let cast = 0; cast < 2; cast += 1) {
    await castAtOpponent(page, bolt);
    await chooseOpponent(page);
    await expect(stackItems(page).first()).toContainText(bolt);
  }
  await expect(page.locator('[data-spells-cast]')).toHaveAttribute('data-spells-cast', '2');

  // The third spell: its storm trigger goes on the stack above it.
  await castAtOpponent(page, bolt);
  await chooseOpponent(page);
  await expect(stack(page).locator('[data-copy-wording]').first()).toContainText(
    'Copy this spell for each other spell cast before it this turn.',
  );
  await expect(stack(page)).toContainText('When you cast this spell');
  await primary(page).click();
  await settled(page);

  // First copy: the question keeps the target (it is preselected; no cancel).
  await expect(bar(page)).toContainText('Choose new targets for the copy of');
  await expect(bar(page).getByRole('button', { name: 'Cancel' })).toHaveCount(0);
  await expect(targets(page).getByRole('button', { name: 'Opponent' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await bar(page).getByRole('button', { name: 'Keep the targets' }).click();
  await settled(page);

  // Second copy: change the target to yourself.
  await expect(bar(page)).toContainText('Choose new targets for the copy of');
  await targets(page).getByRole('button', { name: 'Opponent' }).click();
  await targets(page).getByRole('button', { name: 'You', exact: true }).click();
  await bar(page).getByRole('button', { name: 'Confirm' }).click();
  await settled(page);

  // Two copies on the stack, marked, above the three spells' triggers and cards.
  await expect(stack(page).locator('[data-copy]')).toHaveCount(2);
  await expect(stackItems(page).first()).toContainText('copy');
  await expect(page.getByRole('log')).toContainText('You copy SYNTHETIC Storm Bolt');
  expect(errors).toEqual([]);
});

test('Replicate: the count dialog, the cost, and a copy for each time it was paid', async ({
  page,
}) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const bolt = 'SYNTHETIC Replicate Bolt';
  await page.goto(game('synthetic-replicate', 1));
  await playUntil(page, bolt, 1, 3);
  await page.getByRole('button', { name: 'Full Control' }).click();

  await handCard(page, bolt).first().click();
  const dialog = page.getByRole('dialog', { name: 'Replicate' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Replicate {R}: how many times?');
  await expect(dialog.getByRole('button', { name: "Don't replicate" })).toBeVisible();
  await dialog.getByRole('button', { name: 'More copies' }).click();
  await dialog.getByRole('button', { name: 'More copies' }).click();
  await expect(dialog).toContainText('Replicated 2 times: {R} × 2 added to the cost.');
  await dialog.getByRole('button', { name: 'Replicate 2 times' }).click();
  await settled(page);
  await chooseOpponent(page);

  await expect(page.getByRole('log')).toContainText('replicated 2 times');
  await expect(stackItems(page).filter({ hasText: 'replicated 2 times' })).toHaveCount(1);
  await expect(stack(page).locator('[data-copy-wording]').first()).toContainText(
    'Copy this spell 2 times.',
  );
  await primary(page).click();
  await settled(page);

  for (let copy = 0; copy < 2; copy += 1) {
    await expect(bar(page)).toContainText('Choose new targets for the copy of');
    await bar(page).getByRole('button', { name: 'Keep the targets' }).click();
    await settled(page);
  }
  await expect(stack(page).locator('[data-copy]')).toHaveCount(2);
  expect(errors).toEqual([]);
});
