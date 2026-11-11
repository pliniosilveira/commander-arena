import { expect, type Page, test } from '@playwright/test';
import { settled } from './harness/settle';

/**
 * Planeswalkers (D-200, D-203): the loyalty abilities in the ability chooser, the loyalty in the corner of the tile and of the card in the hand, and the
 * mark "used" once a loyalty ability was activated this turn. The hidden SYNTHETIC deck `synthetic-planeswalkers` (game/precons.ts) holds invented
 * planeswalkers (src/cards/fixtures/synthetic-planeswalkers.ts of the engine), not real cards. A scripted player plays lands and casts the walker; the engine
 * and the AI are seeded, so a given seed reaches the walker at the same point every time.
 */
const game = (seed: number) => `/?autostart=synthetic-planeswalkers,swamp-forest&seed=${seed}`;
const WALKER = 'SYNTHETIC Loyalty Walker';

const primary = (page: Page) => page.locator('[data-dec-primary]');
const handCards = (page: Page) => page.locator('.board-hand [data-object-id]');
const field = (page: Page, name: string) =>
  page.locator('.board-field [data-object-id]', { hasText: name });
const chooser = (page: Page) => page.locator('.dec-ability-chooser');
const logText = (page: Page) => page.getByRole('log');

/** Plays on (lands, then the walker) until `ready` holds. */
async function playUntil(page: Page, ready: () => Promise<boolean>): Promise<void> {
  const keepButton = page.getByRole('button', { name: 'Keep', exact: true });
  for (let step = 0; step < 500; step += 1) {
    await settled(page);
    if (await keepButton.isVisible()) {
      await keepButton.click();
    } else if (await ready()) {
      return;
    } else if (await chooser(page).isVisible()) {
      await chooser(page).getByRole('button').first().click();
    } else {
      const cards = page.locator('.board-hand .is-clickable');
      if ((await cards.count()) > 0) {
        await cards.first().click();
      } else if ((await primary(page).count()) > 0 && (await primary(page).isEnabled())) {
        await primary(page).click();
      }
    }
  }
  throw new Error('the game never reached the situation');
}

test('a planeswalker in the hand shows its printed loyalty, on the battlefield its counters, and a click lists its loyalty abilities', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(game(1));
  // The walker in the hand: the corner shows its printed loyalty, 4 (CR 306.5a).
  await playUntil(
    page,
    async () => (await handCards(page).filter({ hasText: WALKER }).count()) > 0,
  );
  await expect(
    handCards(page).filter({ hasText: WALKER }).first().locator('.board-stat'),
  ).toHaveText(/Loyalty 4/);

  // Cast it: it enters with 4 loyalty counters (CR 306.5b).
  await playUntil(page, async () => (await field(page, WALKER).count()) > 0);
  await expect(field(page, WALKER).first().locator('.board-stat')).toHaveText('4');

  // A click on the walker opens the chooser with its loyalty abilities, their costs as the cards write them. The [-2] needs a creature to aim at, and
  // nobody has one yet, so the engine does not list it (CR 602.2b, 601.2c): two items, +1 and 0.
  await field(page, WALKER).first().click();
  await expect(chooser(page)).toBeVisible();
  const items = chooser(page).getByRole('button').filter({ hasNotText: '\u00d7' });
  await expect(items).toHaveCount(2);
  await expect(items.nth(0)).toContainText('+1: You gain 2 life');
  await expect(items.nth(1)).toContainText('0: You draw a card');

  // Activate the plus ability: the loyalty goes up and the walker is marked as used for the turn (CR 606.3).
  await items.nth(0).click();
  await expect(logText(page)).toContainText(`You activate ${WALKER}'s ability.`);
  await expect.poll(() => field(page, WALKER).first().locator('.board-stat').innerText()).toBe('5');
  await expect(field(page, WALKER).first().locator('[data-loyalty-used]')).toBeVisible();
  expect(errors).toEqual([]);
});
