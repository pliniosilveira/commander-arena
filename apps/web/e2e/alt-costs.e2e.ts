import { expect, type Page, test } from '@playwright/test';
import { handCard, mine } from './harness/locators';
import { settled } from './harness/settle';

/**
 * Overload, Evoke and Dash (D-117, D-121). The listed test decks hold none, so these games use the
 * hidden SYNTHETIC decks `synthetic-overload`, `synthetic-evoke`, `synthetic-dash` and
 * `synthetic-dash-commander` (game/precons.ts): invented cards, not real ones, against "Rats and
 * Spiders". A scripted player plays lands and passes, and never casts a spell until the card under
 * test can be used. The engine and the AI are seeded, so a given seed reaches it at the same point
 * every time; the loop only waits for the page to settle and acts once on what is on screen.
 */
const game = (deck: string, seed: number) => `/?autostart=${deck},swamp-forest&seed=${seed}`;

const primary = (page: Page) => page.locator('.dec-bar [data-dec-primary]');
const logText = (page: Page) => page.getByRole('log');
const chooser = (page: Page) => page.getByRole('group', { name: 'Choose an ability' });
/** The menu's items: every button of the chooser but its close button. */
const options = (page: Page) => chooser(page).locator('button:not([aria-label="Close"])');
const stack = (page: Page) => page.getByRole('region', { name: 'Stack' });
const discardDialog = (page: Page) => page.getByRole('dialog', { name: /^Discard/ });

/** Untapped lands of the player. */
async function lands(page: Page): Promise<number> {
  return page
    .locator('[data-field-seat="0"] .board-tile:not(.is-tapped)')
    .filter({
      has: page.locator('.board-tile-name', { hasText: /^(Plains|Island|Swamp|Mountain|Forest)$/ }),
    })
    .count();
}

/** Plays on (lands, passes) until `ready` holds; no spell is ever cast by the script. */
async function playUntil(page: Page, ready: () => Promise<boolean>): Promise<void> {
  const keepButton = page.getByRole('button', { name: 'Keep', exact: true });
  for (let step = 0; step < 600; step += 1) {
    await settled(page);
    if (await keepButton.isVisible()) {
      await keepButton.click();
    } else if (await discardDialog(page).isVisible()) {
      // The hand is over its limit: a spell goes first, so the cards in the way are not the lands.
      await discardDialog(page).locator('.dec-card-button').first().click();
      await discardDialog(page).getByRole('button', { name: 'Confirm' }).click();
    } else if ((await page.locator('.dec-overlay').count()) === 0 && (await ready())) {
      return;
    } else {
      const land = page.locator('.board-hand .is-clickable').filter({ hasText: 'Basic Land' });
      if ((await land.count()) > 0) {
        await land.first().click();
      } else if ((await primary(page).count()) > 0 && (await primary(page).isEnabled())) {
        await primary(page).click();
      }
    }
  }
  throw new Error('the game never reached the situation');
}

test('Overload: the menu lists "Cast X" and "Overload {3}{R}{R}"; the log and the stack badge say overloaded', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const name = 'SYNTHETIC Overload Bolt';
  await page.goto(game('synthetic-overload', 1));
  await playUntil(
    page,
    async () => (await handCard(page, name).count()) > 0 && (await lands(page)) >= 5,
  );

  // Full Control keeps the spell on the stack, so its badge can be read there.
  await page.getByRole('button', { name: 'Full Control', exact: true }).click();
  await handCard(page, name).first().click();
  const menu = chooser(page);
  await expect(menu).toBeVisible();
  const buttons = options(page);
  await expect(buttons).toHaveCount(2);
  await expect(buttons.nth(0)).toHaveText(`Cast ${name}`);
  await expect(buttons.nth(1)).toHaveText('Overload {3}{R}{R}');
  await buttons.nth(1).click();

  await expect(logText(page)).toContainText(`You cast ${name} for its overload cost.`);
  await expect(stack(page)).toContainText(name);
  await expect(stack(page).getByText('overloaded', { exact: true })).toBeVisible();
  // Overloaded, it has no targets: nothing asked for them and the spell is on the stack.
  await expect(page.getByRole('region', { name: 'Targets' })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('Evoke: "Evoke {W}" is asked about, the sacrifice trigger is worded on the stack, the creature is evoked and sacrificed', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const name = 'SYNTHETIC Evoke Martyr';
  await page.goto(game('synthetic-evoke', 1));
  // One or two lands pay Evoke {W} but not the ordinary {2}{W}: the evoke cast is the only option.
  await playUntil(
    page,
    async () =>
      (await handCard(page, name).count()) > 0 &&
      (await lands(page)) >= 1 &&
      (await lands(page)) <= 2,
  );

  await page.getByRole('button', { name: 'Full Control', exact: true }).click();
  await handCard(page, name).first().click();
  // A single alternative is not cast unasked: the button says what it is.
  const menu = chooser(page);
  await expect(menu).toBeVisible();
  await expect(options(page)).toHaveCount(1);
  await expect(menu.getByRole('button', { name: 'Evoke {W}' })).toBeVisible();
  await menu.getByRole('button', { name: 'Evoke {W}' }).click();

  await expect(logText(page)).toContainText(`You cast ${name} for its evoke cost.`);
  await expect(stack(page).getByText('evoked', { exact: true })).toBeVisible();

  // Resolve the spell: the creature enters and the sacrifice trigger waits on the stack.
  await settled(page);
  await primary(page).click();
  await settled(page);
  await expect(mine(page, name).locator('.board-flag[data-alternative="evoke"]')).toHaveAttribute(
    'title',
    'Evoked: sacrificed when it enters.',
  );
  const trigger = stack(page).locator('.pnl-stack-item.pnl-triggered');
  await expect(trigger).toContainText(name);
  await expect(trigger.locator('.pnl-stack-when')).toHaveText(
    `Whenever ${name} enters, sacrifice this creature`,
  );

  await primary(page).click();
  await expect(logText(page)).toContainText(`You sacrifice ${name}.`);
  await expect(mine(page, name)).toHaveCount(0);
  // The sacrifice made its dies ability trigger: resolve it.
  await settled(page);
  await primary(page).click();
  await expect(logText(page)).toContainText('Your life: 40 to 43.');
  expect(errors).toEqual([]);
});

test('Dash: "Dash {1}{R}" casts with haste, the badges say dashed and the creature returns to the hand at the end step', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const name = 'SYNTHETIC Dash Raider';
  await page.goto(game('synthetic-dash', 1));
  await playUntil(
    page,
    async () => (await handCard(page, name).count()) > 0 && (await lands(page)) >= 2,
  );

  await page.getByRole('button', { name: 'Full Control', exact: true }).click();
  await handCard(page, name).first().click();
  const menu = chooser(page);
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('button', { name: 'Dash {1}{R}' })).toBeVisible();
  await menu.getByRole('button', { name: 'Dash {1}{R}' }).click();

  await expect(logText(page)).toContainText(`You cast ${name} for its dash cost.`);
  await expect(stack(page).getByText('dashed', { exact: true })).toBeVisible();
  await settled(page);
  await primary(page).click();
  await settled(page);
  const tile = mine(page, name);
  await expect(tile).toHaveCount(1);
  await expect(tile.locator('.board-flag[data-alternative="dash"]')).toHaveAttribute(
    'title',
    /returns to its owner’s hand at the beginning of the next end step/,
  );
  const inHand =
    (await page.locator('.board-hand [data-object-id]', { hasText: name }).count()) + 1;

  // Pass to the end step: the delayed trigger (no printed text) is worded on the stack and returns it.
  let worded = false;
  for (let step = 0; step < 40 && (await mine(page, name).count()) > 0; step += 1) {
    await settled(page);
    const trigger = stack(page).locator('.pnl-stack-item.pnl-triggered');
    if ((await trigger.count()) > 0 && !worded) {
      await expect(trigger.locator('.pnl-stack-when')).toHaveText(
        "At the beginning of each end step, return this creature to its owner's hand",
      );
      worded = true;
    }
    if ((await primary(page).count()) > 0 && (await primary(page).isEnabled())) {
      await primary(page).click();
    }
  }
  expect(worded).toBe(true);
  await settled(page);
  await expect(mine(page, name)).toHaveCount(0);
  await expect(page.locator('.board-hand [data-object-id]', { hasText: name })).toHaveCount(inHand);
  await expect(logText(page)).toContainText(`${name} triggers.`);
  expect(errors).toEqual([]);
});

test('Dash on a commander: Undo takes the cast back; at the end step the owner is asked about the command zone', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const name = 'SYNTHETIC Dash Raider';
  await page.goto(game('synthetic-dash-commander', 1));
  const commander = page.locator('.board-cmdr.is-clickable');
  await playUntil(page, async () => (await commander.count()) > 0 && (await lands(page)) >= 2);

  const undo = page.getByRole('button', { name: /^Undo/ });
  const fullControl = page.getByRole('button', { name: 'Full Control', exact: true });
  // With Full Control the spell stays on the stack, so the cast can still be taken back.
  await fullControl.click();
  await commander.first().click();
  await expect(chooser(page).getByRole('button', { name: 'Dash {1}{R}' })).toBeVisible();
  await chooser(page).getByRole('button', { name: 'Dash {1}{R}' }).click();
  await expect(logText(page)).toContainText(`You cast ${name} for its dash cost.`);
  await settled(page);
  await expect(undo).toBeEnabled();
  // Undo takes back one small step at a time (the cast, then each mana payment): until the commander
  // is in the command zone again, with nothing on the stack and nothing in the log.
  for (let step = 0; step < 6 && (await commander.count()) === 0; step += 1) {
    if (await undo.isEnabled()) await undo.click();
    await settled(page);
  }
  await expect(commander.first()).toBeVisible();
  await expect(logText(page)).not.toContainText('for its dash cost');
  await expect(mine(page, name)).toHaveCount(0);
  await expect(stack(page)).toContainText('Stack is empty');

  // Dash it again and let the turn pass: the autopilot stops at the question and nowhere before.
  await fullControl.click();
  await commander.first().click();
  await chooser(page).getByRole('button', { name: 'Dash {1}{R}' }).click();
  await expect(logText(page)).toContainText(`You cast ${name} for its dash cost.`);
  const question = page.getByText(`Move ${name} to the command zone?`);
  for (let step = 0; step < 40 && (await question.count()) === 0; step += 1) {
    await settled(page);
    if ((await question.count()) === 0 && (await primary(page).count()) > 0) {
      if (await primary(page).isEnabled()) await primary(page).click();
    }
  }
  await expect(question).toBeVisible();
  // The creature is still on the battlefield while the replacement is asked about (CR 903.9b).
  await expect(page.getByRole('dialog', { name: 'Command zone' })).toContainText(
    `${name} would be put into your hand.`,
  );
  // The pass that got here cleared the history: the question has no Undo button, and Ctrl+Z does nothing.
  await expect(undo).toHaveCount(0);
  await page.keyboard.press('Control+z');
  await settled(page);
  await expect(question).toBeVisible();
  await page.getByRole('button', { name: 'Yes', exact: true }).click();
  await settled(page);
  await expect(question).toHaveCount(0);
  await expect(logText(page)).toContainText('returns to the command zone');
  expect(errors).toEqual([]);
});
