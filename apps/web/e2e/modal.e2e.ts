import { expect, type Page, test } from '@playwright/test';
import { handCard } from './harness/locators';
import { settled } from './harness/settle';

/**
 * Modal spells (CR 700.2, D-114): the mode chooser, the target prompt grouped by mode, Cancel and a
 * choice made for the player. The listed test decks hold none, so these games use the hidden
 * SYNTHETIC deck `synthetic-modal` (game/precons.ts): invented cards, not real ones. A scripted
 * player plays lands and Sol Rings (and, for the tests that want a creature to aim at, Goblins and
 * Knights) and keeps the invented spells in hand until the spell under test can be cast. The engine
 * and the AI are seeded, so a given seed reaches it at the same point every time; the loop only
 * waits for the page to settle and acts once on what is on screen.
 */
const game = (seed: number) => `/?autostart=synthetic-modal,swamp-forest&seed=${seed}`;

// Any seed that reaches the situation passes. Seed 6: a Mountain and a Plains by turn 5 and no
// creature on either side, so "target creature" has no target. Seed 3: a creature to aim at.
const SEED_NO_CREATURE = 6;
const SEED_CREATURE = 3;

// The seeded games are long: playing to the spell takes many settled steps.
test.describe.configure({ timeout: 150_000 });

const primary = (page: Page) => page.locator('[data-dec-primary]');
const logText = (page: Page) => page.getByRole('log');
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Choose modes' });
const card = (page: Page, mode: number) =>
  dialog(page).locator(`[data-mode-card][data-mode="${mode}"]`);
const creatures = (page: Page) => page.locator('.board-tile:has(.board-stat-pt)');
const hand = (page: Page) => page.getByRole('region', { name: /^Your hand, \d+ cards$/ });

/** What the spell costs, as the sources it needs (a Sol Ring makes two of any kind but colored). */
interface Need {
  readonly red: number;
  readonly white: number;
  readonly total: number;
}
const THREE_WAY: Need = { red: 1, white: 0, total: 2 }; // {1}{R}
const TWIN: Need = { red: 1, white: 1, total: 3 }; // {1}{R}{W}

/** Whether the player's untapped lands and Sol Rings can pay `need`. */
async function canPay(page: Page, need: Need): Promise<boolean> {
  const untapped = page.locator('[data-field-seat="0"] .board-tile:not(.is-tapped)');
  const named = (name: RegExp) =>
    untapped.filter({ has: page.locator('.board-tile-name', { hasText: name }) }).count();
  const [red, white, forest, rings] = await Promise.all([
    named(/^Mountain$/),
    named(/^Plains$/),
    named(/^Forest$/),
    named(/^Sol Ring$/),
  ]);
  return red >= need.red && white >= need.white && red + white + forest + 2 * rings >= need.total;
}

/**
 * Plays on until the spell can be paid for. The invented spells stay in the hand; lands and Sol Ring
 * are played, and Goblins and Knights too unless `creatureless` (the spell is then wanted on a board
 * with no creature to aim at, and the test checks that it is so: a seed that fails the check is the
 * wrong seed). Otherwise it waits for a creature on the battlefield, to aim at.
 */
async function playUntil(
  page: Page,
  spell: string,
  need: Need,
  opts: { creatureless?: boolean } = {},
) {
  const keepButton = page.getByRole('button', { name: 'Keep', exact: true });
  const discard = page.getByRole('dialog', { name: /^Discard/ });
  const skip = opts.creatureless === true ? /SYNTHETIC|Raging Goblin|Youthful Knight/ : /SYNTHETIC/;
  for (let step = 0; step < 600; step += 1) {
    await settled(page);
    if (await keepButton.isVisible()) {
      await keepButton.click();
    } else if (await discard.isVisible()) {
      // Too many cards: throw away a creature, never the spell under test.
      const spare = discard.getByRole('button').filter({ hasNotText: spell });
      await spare.first().click();
      await primary(page).click();
    } else if (
      (await page.locator('.dec-overlay').count()) === 0 &&
      (await handCard(page, spell).count()) > 0 &&
      (await canPay(page, need)) &&
      (opts.creatureless === true || (await creatures(page).count()) > 0)
    ) {
      return;
    } else {
      const cards = page.locator('.board-hand .is-clickable').filter({ hasNotText: skip });
      if ((await cards.count()) > 0) {
        await cards.first().click();
      } else if ((await primary(page).count()) > 0 && (await primary(page).isEnabled())) {
        await primary(page).click();
      }
    }
  }
  throw new Error('the game never reached the situation');
}

test('"choose one": an illegal mode is disabled, a pick is required, the pick runs and the stack says so', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(game(SEED_NO_CREATURE));
  await playUntil(page, 'SYNTHETIC Three Way Charm', THREE_WAY, { creatureless: true });
  // No creature on either side: "Deals 3 damage to target creature" has no target.
  await expect(creatures(page)).toHaveCount(0);
  // Full Control keeps the spell on the stack, so what was chosen can be read there.
  await page.getByRole('button', { name: 'Full Control' }).click();
  const handBefore = await hand(page).getAttribute('aria-label');

  await handCard(page, 'SYNTHETIC Three Way Charm').first().click();
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page)).toContainText('SYNTHETIC Three Way Charm');
  await expect(dialog(page)).toContainText('Choose one —');
  await expect(dialog(page).getByRole('radio')).toHaveCount(3);
  await expect(dialog(page).getByRole('radio', { name: /Deals 3 damage/ })).toBeDisabled();
  await expect(card(page, 0)).toContainText('No legal target');
  // Nothing is picked: the player must choose.
  await expect(dialog(page).getByRole('radio', { checked: true })).toHaveCount(0);
  await expect(primary(page)).toBeDisabled();
  await page.keyboard.press('Enter');
  await expect(dialog(page)).toBeVisible();
  // The illegal mode ignores its digit; the digit of a legal one picks it (a radio button).
  await page.keyboard.press('1');
  await expect(primary(page)).toBeDisabled();
  await page.keyboard.press('3');
  await expect(dialog(page).getByRole('radio', { name: /You gain 3 life/ })).toBeChecked();
  await card(page, 1).click();
  await expect(dialog(page).getByRole('radio', { name: /Draw a card/ })).toBeChecked();
  await expect(dialog(page).getByRole('radio', { name: /You gain 3 life/ })).not.toBeChecked();
  await expect(primary(page)).toBeEnabled();
  await page.keyboard.press('Enter');
  await expect(dialog(page)).toBeHidden();

  await expect(logText(page)).toContainText('You choose: Draw a card.');
  await expect(logText(page)).toContainText('You cast SYNTHETIC Three Way Charm.');
  const stack = page.getByRole('region', { name: 'Stack' });
  await expect(stack).toContainText('Chosen: Draw a card');
  await primary(page).click();
  await expect(stack).toContainText('Stack is empty');
  // The spell left the hand, the mode drew a card: the hand is the size it was.
  await expect(hand(page)).toHaveAttribute('aria-label', handBefore ?? '');
  expect(errors).toEqual([]);
});

test('a mode with a target: the prompt and the dock show the mode, and its effect happens', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(game(SEED_CREATURE));
  await playUntil(page, 'SYNTHETIC Three Way Charm', THREE_WAY);
  await page.getByRole('button', { name: 'Full Control' }).click();

  await handCard(page, 'SYNTHETIC Three Way Charm').first().click();
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page).getByRole('radio', { name: /Deals 3 damage/ })).toBeEnabled();
  await card(page, 0).click();
  await primary(page).click();
  await expect(dialog(page)).toBeHidden();

  // The targets come next, under the heading of the mode.
  const prompt =
    'Mode 1: Deals 3 damage to target creature. Choose a target for SYNTHETIC Three Way Charm.';
  await expect(page.getByText(prompt)).toBeVisible();
  const dock = page.getByRole('region', { name: 'Legal targets' });
  await expect(
    dock.getByRole('heading', { name: 'Mode 1: Deals 3 damage to target creature' }),
  ).toBeVisible();
  await dock.getByRole('button').first().click();
  await primary(page).click();

  await expect(logText(page)).toContainText('You choose: Deals 3 damage to target creature.');
  const stack = page.getByRole('region', { name: 'Stack' });
  await expect(stack).toContainText('Chosen: Deals 3 damage to target creature');
  await primary(page).click();
  await expect(logText(page)).toContainText('deals 3 damage');
  expect(errors).toEqual([]);
});

test('"choose two": Cancel and Esc rewind the cast, two modes are needed, the digits pick them, targets follow per mode', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(game(SEED_CREATURE));
  await playUntil(page, 'SYNTHETIC Twin Charm', TWIN);
  await page.getByRole('button', { name: 'Full Control' }).click();
  const handBefore = await hand(page).getAttribute('aria-label');

  await handCard(page, 'SYNTHETIC Twin Charm').first().click();
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page)).toContainText('Choose two —');
  await expect(dialog(page).getByRole('checkbox')).toHaveCount(3);
  await expect(dialog(page).getByRole('checkbox', { checked: true })).toHaveCount(0);
  await expect(primary(page)).toBeDisabled();
  await card(page, 0).click();
  await expect(primary(page)).toBeDisabled();
  await expect(dialog(page)).toContainText('1 of 2 chosen');
  await card(page, 1).click();
  await expect(primary(page)).toBeEnabled();
  // A third pick is not taken while two are chosen: clear one first.
  await card(page, 2).click();
  await expect(dialog(page).getByRole('checkbox', { checked: true })).toHaveCount(2);
  await expect(dialog(page).getByRole('checkbox', { name: /Draw a card/ })).not.toBeChecked();

  // Cancel rewinds the cast.
  await dialog(page).getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog(page)).toBeHidden();
  await expect(hand(page)).toHaveAttribute('aria-label', handBefore ?? '');
  await expect(handCard(page, 'SYNTHETIC Twin Charm').first()).toBeVisible();
  await expect(logText(page)).not.toContainText('You choose');

  // Again: the dialog starts empty (not with the old picks), Esc cancels too.
  await handCard(page, 'SYNTHETIC Twin Charm').first().click();
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page).getByRole('checkbox', { checked: true })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toBeHidden();
  await expect(hand(page)).toHaveAttribute('aria-label', handBefore ?? '');

  // The digits pick modes 1 and 3; Enter confirms. The creature and the draw: the damage mode's
  // target is asked, under its heading.
  await handCard(page, 'SYNTHETIC Twin Charm').first().click();
  await expect(dialog(page)).toBeVisible();
  await page.keyboard.press('1');
  await page.keyboard.press('3');
  await expect(dialog(page).getByRole('checkbox', { checked: true })).toHaveCount(2);
  await page.keyboard.press('Enter');
  await expect(dialog(page)).toBeHidden();
  await expect(
    page.getByText(
      'Mode 1: Deals 2 damage to target creature. Choose a target for SYNTHETIC Twin Charm.',
    ),
  ).toBeVisible();
  await page.getByRole('region', { name: 'Legal targets' }).getByRole('button').first().click();
  await primary(page).click();
  await expect(logText(page)).toContainText(
    'You choose: Deals 2 damage to target creature and Draw a card.',
  );
  await expect(page.getByRole('region', { name: 'Stack' })).toContainText(
    'Chosen: Deals 2 damage to target creature; Draw a card',
  );
  expect(errors).toEqual([]);
});

test('one legal set is chosen without a dialog: "choose two" with only two modes possible', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(game(SEED_NO_CREATURE));
  await playUntil(page, 'SYNTHETIC Twin Charm', TWIN, { creatureless: true });
  await expect(creatures(page)).toHaveCount(0);
  await page.getByRole('button', { name: 'Full Control' }).click();

  await handCard(page, 'SYNTHETIC Twin Charm').first().click();
  // No dialog: the engine chose "Target player gains 3 life" and "Draw a card"; the first of them
  // asks for its target, under its heading.
  await settled(page);
  await expect(dialog(page)).toBeHidden();
  await expect(
    page.getByText('Mode 2: Target player gains 3 life. Choose a target for SYNTHETIC Twin Charm.'),
  ).toBeVisible();
  await page.locator('.board-life[data-seat="0"]').click();
  await primary(page).click();
  // The log says the choice was made for the player (a detail line).
  await page
    .getByRole('group', { name: 'Log detail' })
    .getByRole('button', { name: 'All' })
    .click();
  await expect(logText(page)).toContainText(
    'You choose: Target player gains 3 life and Draw a card (the only legal choice).',
  );
  await expect(page.getByRole('region', { name: 'Stack' })).toContainText(
    'Chosen: Target player gains 3 life; Draw a card',
  );
  expect(errors).toEqual([]);
});
