import { expect, type Page, test } from '@playwright/test';
import { mine } from './harness/locators';
import { settled } from './harness/settle';

/**
 * Sagas (CR 714). The listed test decks hold no Saga, so this game uses the hidden SYNTHETIC deck
 * `synthetic-sagas` (game/precons.ts: invented cards, not real ones) against the listed deck "Rats
 * and Spiders" (a quiet opponent). A scripted player, with Full Control on, plays lands and casts
 * whatever it can until a SYNTHETIC Rite of Three of ours has entered and its chapter I ability is
 * on the stack. The engine and the AI are seeded, so a given seed reaches it at the same point
 * every time; the loop only waits for the page to settle.
 */
const game = (seed: number) => `/?autostart=synthetic-sagas,swamp-forest&seed=${seed}`;
const SEED = 1;
const RITE = 'SYNTHETIC Rite of Three';

const primary = (page: Page) => page.locator('.dec-bar [data-dec-primary]');
/** Presses the bar's primary button if there is an enabled one right now; never waits for it. */
const press = (page: Page) =>
  primary(page)
    .click({ timeout: 150 })
    .catch(() => undefined);
const discardDialog = (page: Page) => page.getByRole('dialog', { name: /^Discard/ });
// "chapter I" is also the start of "chapter II" and "chapter III": the label ends the line.
const chapterOnStack = (page: Page) =>
  page.locator('.pnl-stack-item .pnl-stack-name', { hasText: new RegExp(`^${RITE} — chapter I$`) });

/** Plays on until one of our Rites is on the battlefield with its chapter I ability on the stack. */
async function playUntilChapterOne(page: Page): Promise<void> {
  const keepButton = page.getByRole('button', { name: 'Keep', exact: true });
  for (let step = 0; step < 600; step += 1) {
    await settled(page);
    if (await keepButton.isVisible()) {
      await keepButton.click();
    } else if (await discardDialog(page).isVisible()) {
      await discardDialog(page).locator('.dec-card-button').first().click();
      await discardDialog(page).getByRole('button', { name: 'Confirm' }).click();
    } else if (
      (await page.locator('.dec-overlay').count()) === 0 &&
      (await mine(page, RITE).count()) > 0 &&
      (await chapterOnStack(page).count()) > 0
    ) {
      return;
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

test('a Saga shows "Lore 1 / 3" when it enters and its chapter I ability is labelled on the stack', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(game(SEED));
  // Without Full Control the page passes over our own abilities on the stack (D-045), so a
  // chapter ability would resolve before it could be read there.
  await page.getByRole('button', { name: 'Keep', exact: true }).click();
  await page.getByRole('button', { name: 'Full Control' }).click();
  await playUntilChapterOne(page);

  const saga = mine(page, RITE).first();
  await expect(saga.locator('.board-lore')).toHaveText('Lore 1 / 3');
  await expect(saga.locator('.board-counter', { hasText: /^lore/ })).toHaveCount(0);
  await expect(chapterOnStack(page)).toHaveCount(1);
  await expect(page.getByRole('log')).toContainText(`${RITE}'s chapter I triggers.`);

  // Hovering the Saga reads it in the preview panel: the chapter lines and the badge.
  await saga.hover();
  const preview = page.getByRole('complementary', { name: 'Card preview' });
  await expect(preview).toContainText('Lore 1 / 3');
  await expect(preview).toContainText('I — You gain 1 life.');
  await expect(preview).toContainText('III — You gain 4 life.');
  expect(errors).toEqual([]);
});
