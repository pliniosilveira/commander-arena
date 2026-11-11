import { expect, type Page, test } from '@playwright/test';
import { handCard, handLand, mine } from './harness/locators';
import { settled } from './harness/settle';

/**
 * The play rules of D-125: looking at the top card of your library, an additional land drop, the cost
 * of attacking and the optional untap. The listed decks hold none of them, so these games use the hidden
 * SYNTHETIC decks `synthetic-top-card`, `synthetic-extra-land`, `synthetic-hasty-goblins` (against
 * `synthetic-attack-tax`) and `synthetic-optional-untap` (game/precons.ts): invented cards, not real ones.
 * A scripted player plays lands and the named cards and passes; the engine and the AI are seeded, so a
 * seed reaches the situation at the same point every time, and the loop only waits for the page to settle
 * and acts once on what is on screen.
 */
const game = (human: string, ai: string, seed: number) => `/?autostart=${human},${ai}&seed=${seed}`;

const primary = (page: Page) => page.locator('.dec-bar [data-dec-primary]');
const logText = (page: Page) => page.getByRole('log');
const theirs = (page: Page, name: string | RegExp) =>
  page.locator('[data-field-seat="1"] .board-tile', { hasText: name });
const topCard = (page: Page) => page.locator('[data-library-top]');

/**
 * Plays lands first, then casts the named cards, passes otherwise, and returns as soon as `ready`
 * holds on a settled page with no modal open (or, with `modal`, with that dialog open).
 */
async function playUntil(
  page: Page,
  ready: () => Promise<boolean>,
  cast: readonly string[] = [],
): Promise<void> {
  const keepButton = page.getByRole('button', { name: 'Keep', exact: true });
  const discard = page.getByRole('dialog', { name: /^Discard/ });
  for (let step = 0; step < 900; step += 1) {
    await settled(page);
    if (await keepButton.isVisible()) {
      await keepButton.click();
    } else if (await discard.isVisible()) {
      await discard.locator('.dec-card-button').first().click();
      await discard.getByRole('button', { name: 'Confirm' }).click();
    } else if (await ready()) {
      return;
    } else if ((await page.locator('.dec-overlay').count()) > 0) {
      throw new Error('an unexpected dialog is open');
    } else if ((await handLand(page).count()) > 0) {
      await handLand(page).first().click();
    } else {
      let cast1 = false;
      for (const name of cast) {
        if ((await handCard(page, name).count()) > 0) {
          await handCard(page, name).first().click();
          cast1 = true;
          break;
        }
      }
      if (!cast1 && (await primary(page).count()) > 0 && (await primary(page).isEnabled())) {
        await primary(page).click();
      }
    }
  }
  throw new Error('the game never reached the situation');
}

/** Presses the primary button until `done` holds, on a settled page every time. */
async function passUntil(page: Page, done: () => Promise<boolean>, max = 120): Promise<void> {
  for (let step = 0; step < max; step += 1) {
    await settled(page);
    if (await done()) return;
    if ((await primary(page).count()) > 0 && (await primary(page).isEnabled())) {
      await primary(page).click();
    }
  }
  throw new Error('the game never got there');
}

test('the top card shows for you, never for the opponent, and hovers like any card', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const lens = 'SYNTHETIC Seer Lens';
  // Both decks hold the Lens: the opponent will have its own, and still none of its top card is shown.
  await page.goto(game('synthetic-top-card', 'synthetic-top-card', 1));
  await playUntil(page, async () => (await mine(page, lens).count()) > 0, [lens]);
  await settled(page);

  const strip = page.locator('.board-strip-me');
  await expect(strip.locator('[data-library-top]')).toHaveCount(1);
  await expect(page.locator('.board-strip-opp [data-library-top]')).toHaveCount(0);
  const id = await topCard(page).getAttribute('data-library-top');
  const label = (await topCard(page).getAttribute('aria-label')) ?? '';
  expect(label).toMatch(/^Top card of your library: /);

  // Hovering it shows the card in the preview panel.
  await topCard(page).hover();
  await expect(page.locator('.board-preview-card')).toHaveAttribute('data-preview-id', id ?? '');
  await page.mouse.move(0, 0);

  // The Lens says what it does in the preview panel.
  await mine(page, lens).first().hover();
  await expect(page.locator('.board-preview [data-play-rules]')).toHaveText(
    'You may look at the top card of your library any time.',
  );

  // The opponent casts its own Lens: still no top card of theirs on the board, and the count of cards
  // shown stays one (the next card of ours after each draw).
  await passUntil(page, async () => (await theirs(page, lens).count()) > 0, 200);
  await expect(page.locator('[data-library-top]')).toHaveCount(1);
  await expect(page.locator('.board-strip-opp [data-library-top]')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('an additional land drop: the counter and a second land play', async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const scout = 'SYNTHETIC Wandering Scout';
  await page.goto(game('synthetic-extra-land', 'swamp-forest', 1));
  // The Scout is on the battlefield, one land is played this turn and another waits in the hand.
  await playUntil(
    page,
    async () =>
      (await mine(page, scout).count()) > 0 &&
      (await page.locator('.board-strip-me [data-land-plays="1/2"]').count()) > 0 &&
      (await handLand(page).count()) > 0,
    [scout],
  );
  await expect(page.locator('.board-strip-me [data-land-plays]')).toHaveAttribute(
    'title',
    'Lands played this turn, and how many may be played',
  );
  const lands = await mine(page, 'Forest').count();
  await handLand(page).first().click();
  await expect(logText(page)).toContainText('You play Forest');
  await settled(page);
  await expect(page.locator('.board-strip-me [data-land-plays="2/2"]')).toHaveCount(1);
  expect(await mine(page, 'Forest').count()).toBe(lands + 1);
  // The limit is reached: no land in the hand can be played now.
  await expect(handLand(page)).toHaveCount(0);

  // The Scout explains itself in the preview.
  await mine(page, scout).first().hover();
  await expect(page.locator('.board-preview [data-play-rules]')).toHaveText(
    'You may play an additional land on each of your turns.',
  );
  expect(errors).toEqual([]);
});

test('the cost of attacking: the cost per target, the payment, Choose other attackers, paying', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const goblin = 'Raging Goblin';
  const costs = page.getByRole('region', { name: 'Cost of attacking' });
  await page.goto(game('synthetic-hasty-goblins', 'synthetic-attack-tax', 1));
  // The declaration is open, the Gate is the opponent's and the mana covers two attackers.
  await playUntil(page, async () => {
    if ((await costs.count()) === 0 || (await theirs(page, 'SYNTHETIC Tax Gate').count()) === 0) {
      return false;
    }
    const text = (await costs.textContent()) ?? '';
    return Number(text.match(/covers (\d+) creatures? now/)?.[1] ?? 0) >= 2;
  }, [goblin]);
  const bar = page.locator('.dec-bar');
  await expect(costs).toContainText('Attacking Opponent costs {2} for each creature.');
  await expect(bar).toContainText('Declare attackers.');

  // The hasty goblins are the candidates: choose two. The bar and the panel add up the cost.
  const attackers = page.locator('[data-field-seat="0"] .board-tile.is-clickable', {
    hasText: goblin,
  });
  await attackers.nth(0).click();
  await attackers.nth(1).click();
  await expect(primary(page)).toHaveText('Declare attackers (2)');
  await expect(bar).toContainText('This attack costs {4}.');
  await expect(costs).toContainText('2 chosen');

  // The cost is paid by hand: Manual mana shows the payment instead of paying it.
  await page.getByRole('button', { name: 'Manual mana' }).click();
  await primary(page).click();
  await settled(page);
  await expect(bar).toContainText(
    'Pay {2} per attacking creature (4 total) so these creatures can attack: tap your mana sources.',
  );
  const payment = page.getByRole('region', { name: 'Payment' });
  await expect(payment).toContainText('will attack once this is paid');
  await expect(payment).toContainText('The cost is from SYNTHETIC Tax Gate.');

  // Choose other attackers: back to the declaration, nothing paid and nothing declared.
  await bar.getByRole('button', { name: 'Choose other attackers' }).click();
  await settled(page);
  await expect(bar).toContainText('Declare attackers.');
  await expect(costs).toBeVisible();
  await expect(logText(page)).not.toContainText('You attack');
  await expect(primary(page)).toHaveText('No Attack');

  // Again, and this time pay it.
  await attackers.nth(0).click();
  await attackers.nth(1).click();
  await primary(page).click();
  await settled(page);
  await expect(bar).toContainText('Pay {2} per attacking creature (4 total)');
  await bar.getByRole('button', { name: 'Auto-pay' }).click();
  await settled(page);
  await expect(logText(page)).toContainText('You attack');
  await expect(page.getByRole('region', { name: 'Payment' })).toHaveCount(0);
  await expect(logText(page)).toContainText('Opponent');
  expect(errors).toEqual([]);
});

test('the optional untap: a checklist, one permanent left tapped, the log line', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const land = 'SYNTHETIC Drowsy Land';
  const rod = 'SYNTHETIC Drowsy Rod';
  const dialog = page.getByRole('dialog', { name: 'Untap step' });
  await page.goto(game('synthetic-optional-untap', 'swamp-forest', 1));
  // Two lands tapped to cast the Rod, then the next untap step asks.
  const keepButton = page.getByRole('button', { name: 'Keep', exact: true });
  for (let step = 0; step < 900; step += 1) {
    await settled(page);
    if (await dialog.isVisible()) break;
    if (await keepButton.isVisible()) {
      await keepButton.click();
    } else if (await page.getByRole('dialog', { name: /^Discard/ }).isVisible()) {
      const discard = page.getByRole('dialog', { name: /^Discard/ });
      await discard.locator('.dec-card-button').first().click();
      await discard.getByRole('button', { name: 'Confirm' }).click();
    } else if ((await handLand(page).count()) > 0) {
      await handLand(page).first().click();
    } else if ((await handCard(page, rod).count()) > 0) {
      await handCard(page, rod).first().click();
    } else if ((await primary(page).count()) > 0 && (await primary(page).isEnabled())) {
      await primary(page).click();
    }
  }
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(
    'Untap during your untap step: choose which of these stay tapped.',
  );
  const boxes = dialog.getByRole('checkbox');
  const count = await boxes.count();
  expect(count).toBeGreaterThanOrEqual(2);
  // Every permanent starts checked: the default untaps them all.
  for (let i = 0; i < count; i += 1) await expect(boxes.nth(i)).toBeChecked();
  await expect(dialog.getByRole('button', { name: 'Untap all' })).toBeVisible();
  // Nothing in the dialog is the sacrifice wording.
  await expect(dialog).not.toContainText('Sacrifice');

  // Leave the last one tapped.
  await boxes.nth(count - 1).uncheck();
  await expect(dialog).toContainText('1 of');
  await expect(
    dialog.getByRole('button', { name: `Untap ${count - 1} of ${count}` }),
  ).toBeVisible();
  await dialog.getByRole('button', { name: `Untap ${count - 1} of ${count}` }).click();
  await settled(page);
  await expect(dialog).toHaveCount(0);
  await expect(logText(page)).toContainText(`You left ${land} tapped.`);
  await expect(
    page.locator('[data-field-seat="0"] .board-tile.is-tapped', { hasText: land }),
  ).toHaveCount(1);
  expect(errors).toEqual([]);
});
