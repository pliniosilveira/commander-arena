import { expect, type Locator, type Page, test } from '@playwright/test';
import { settled } from './harness/settle';

/**
 * Scry, surveil and putting cards on top of the library (CR 701.22, 701.25, D-091). The listed
 * test decks hold no such card, so these games use the hidden SYNTHETIC deck `synthetic-library`
 * (game/precons.ts: invented cards, not real ones) against the listed deck "Rats and Spiders". A
 * scripted player, with Full Control on, plays lands, Sol Rings and one kind of SYNTHETIC card (the
 * rest stay in the hand) until the decision under test is on screen. The engine and the AI are
 * seeded, so a given seed reaches it at the same point every time; the loop only waits for the
 * page to settle.
 */
const game = (seed: number) => `/?autostart=synthetic-library,swamp-forest&seed=${seed}`;

// Seed 4 draws an Island early for the Seers and the Brainstorm; seed 1 does for the Watchers.
const SEED = { scry: 4, surveil: 1, putOnTop: 4 };
const LANDS = 'Island|Swamp|Sol Ring';

const primary = (page: Page) => page.locator('.dec-bar [data-dec-primary]');
/** Presses the bar's primary button if there is an enabled one right now; never waits for it. */
const press = (page: Page) =>
  primary(page)
    .click({ timeout: 150 })
    .catch(() => undefined);
const discardDialog = (page: Page) => page.getByRole('dialog', { name: /^Discard/ });
const logText = (page: Page) => page.getByRole('log');
const arrangeDialog = (page: Page, prompt: RegExp) => page.getByRole('dialog', { name: prompt });
const pile = (dialog: Locator, which: 'top' | 'other') =>
  dialog.locator(`[data-pile="${which}"] [data-arrange-card]`);
const confirm = (dialog: Locator) => dialog.getByRole('button', { name: 'Confirm' });
const graveyard = (page: Page) =>
  page.getByRole('button', { name: /^Open You graveyard, \d+ cards$/ });

/** The number in "Open You graveyard, 3 cards". */
async function graveyardCount(page: Page): Promise<number> {
  const label = (await graveyard(page).getAttribute('aria-label')) ?? '';
  return Number(/(\d+) cards/.exec(label)?.[1] ?? Number.NaN);
}

/** Plays on until `ready` holds; only the cards in `cast` (and lands) are ever played. */
async function playUntil(page: Page, cast: string, ready: () => Promise<boolean>): Promise<void> {
  const keepButton = page.getByRole('button', { name: 'Keep', exact: true });
  const play = new RegExp(`${LANDS}|${cast}`);
  for (let step = 0; step < 600; step += 1) {
    await settled(page);
    if (await keepButton.isVisible()) {
      await keepButton.click();
    } else if (await discardDialog(page).isVisible()) {
      // The hand is over its limit (the other cards are kept): discard one of those.
      const cards = discardDialog(page).locator('.dec-card-button');
      const spare = cards.filter({ hasNotText: play });
      await ((await spare.count()) > 0 ? spare : cards).first().click();
      await discardDialog(page).getByRole('button', { name: 'Confirm' }).click();
    } else if (await ready()) {
      return;
    } else if (await page.getByRole('dialog', { name: /^You (win|lose)/ }).isVisible()) {
      throw new Error('the game ended before it reached the situation');
    } else {
      const cards = page.locator('.board-hand .is-clickable').filter({ hasText: play });
      if ((await cards.count()) > 0) {
        await cards.first().click();
      } else {
        await press(page);
      }
    }
  }
  throw new Error('the game never reached the situation');
}

/** Starts the game with Full Control on, so our own spells and triggers stay on the stack. */
async function start(page: Page, seed: number): Promise<void> {
  await page.goto(game(seed));
  await page.getByRole('button', { name: 'Keep', exact: true }).click();
  await page.getByRole('button', { name: 'Full Control' }).click();
}

const SCRY = /^Scry 2/;
const SURVEIL = /^Surveil 2/;

test('a scry from an enters trigger: the keyboard moves a card to the bottom and Enter confirms', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await start(page, SEED.scry);
  const seer = 'SYNTHETIC Seer Of The Door';
  await playUntil(page, seer, async () => (await arrangeDialog(page, SCRY).count()) > 0);

  const dialog = arrangeDialog(page, SCRY);
  await expect(dialog).toContainText(
    'Scry 2: choose the cards to put on the bottom and the order.',
  );
  // The default is everything on top in the order looked at; there is no way out.
  await expect(dialog.getByRole('region', { name: 'Top pile' })).toBeVisible();
  await expect(dialog.getByRole('region', { name: 'Bottom pile' })).toBeVisible();
  await expect(pile(dialog, 'top')).toHaveCount(2);
  await expect(pile(dialog, 'other')).toHaveCount(0);
  await expect(dialog).toContainText('2 on top, 0 on the bottom.');
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toHaveCount(0);
  await expect(confirm(dialog)).toBeEnabled();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();

  // The first card has the focus. Right moves it behind the other one, Down sends it to the bottom.
  const first = pile(dialog, 'top').first();
  const id = await first.getAttribute('data-arrange-card');
  const card = dialog.locator(`[data-arrange-card="${id}"]`);
  await expect(card).toBeFocused();
  await expect(card).toHaveAttribute('aria-label', /Top pile, 1 of 2$/);
  await page.keyboard.press('ArrowRight');
  await expect(card).toHaveAttribute('aria-label', /Top pile, 2 of 2$/);
  await expect(card).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(pile(dialog, 'top')).toHaveCount(1);
  await expect(pile(dialog, 'other')).toHaveCount(1);
  await expect(card).toHaveAttribute('aria-label', /Bottom pile, 1 of 1$/);
  await expect(card).toContainText('Bottom card');
  await expect(card).toBeFocused();
  await expect(dialog).toContainText('1 on top, 1 on the bottom.');

  // Up takes it back, Down sends it again; Enter on the card confirms.
  await page.keyboard.press('ArrowUp');
  await expect(pile(dialog, 'other')).toHaveCount(0);
  await page.keyboard.press('ArrowDown');
  await expect(pile(dialog, 'other')).toHaveCount(1);
  await page.keyboard.press('Enter');

  await expect(dialog).toHaveCount(0);
  await expect(logText(page)).toContainText('You scry 2: 1 on top, 1 on the bottom.');
  // The cards are not named by the log: they did not change zones.
  await expect(logText(page)).not.toContainText(': library to');
  expect(errors).toEqual([]);
});

test('a scry by mouse: click a card, the buttons and a drag arrange the piles; Confirm sends them', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await start(page, SEED.scry);
  await playUntil(
    page,
    'SYNTHETIC Seer Of The Door',
    async () => (await arrangeDialog(page, SCRY).count()) > 0,
  );

  const dialog = arrangeDialog(page, SCRY);
  const [a, b] = await pile(dialog, 'top').evaluateAll((els) =>
    els.map((el) => el.getAttribute('data-arrange-card') ?? ''),
  );
  const first = dialog.locator(`[data-arrange-card="${a}"]`);
  const second = dialog.locator(`[data-arrange-card="${b}"]`);
  await expect(first).toContainText('1st from top');
  await expect(second).toContainText('2nd from top');

  // A click on a card sends it to the other pile and again brings it back.
  await second.click();
  await expect(pile(dialog, 'other')).toHaveCount(1);
  await expect(dialog).toContainText('1 on top, 1 on the bottom.');
  await second.click();
  await expect(pile(dialog, 'top')).toHaveCount(2);
  await expect(dialog).toContainText('2 on top, 0 on the bottom.');

  // The buttons: later in the pile, then to the bottom.
  await first.getByRole('button', { name: /earlier/ }).isDisabled();
  await expect(first.getByRole('button', { name: /earlier/ })).toBeDisabled();
  await first.getByRole('button', { name: /later in the Top pile/ }).click();
  await expect(first).toContainText('2nd from top');
  await first.getByRole('button', { name: /to the Bottom pile/ }).click();
  await expect(pile(dialog, 'other')).toHaveCount(1);

  // Drag it back to the top pile, before the other card.
  await first.dragTo(second);
  await expect(pile(dialog, 'top')).toHaveCount(2);
  await expect(dialog).toContainText('2 on top, 0 on the bottom.');
  // And drag the other card onto the empty bottom pile.
  await second.dragTo(dialog.locator('[data-pile="other"] .dec-arrange-row'));
  await expect(pile(dialog, 'other')).toHaveCount(1);
  await expect(dialog).toContainText('1 on top, 1 on the bottom.');

  await confirm(dialog).click();
  await expect(dialog).toHaveCount(0);
  await expect(logText(page)).toContainText('You scry 2: 1 on top, 1 on the bottom.');
  expect(errors).toEqual([]);
});

test('a surveil puts a card into the graveyard and the log says so', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await start(page, SEED.surveil);
  await playUntil(
    page,
    'SYNTHETIC Grave Watcher',
    async () => (await arrangeDialog(page, SURVEIL).count()) > 0,
  );

  const dialog = arrangeDialog(page, SURVEIL);
  await expect(dialog).toContainText(
    'Surveil 2: choose the cards to put into your graveyard and the order of the rest.',
  );
  await expect(dialog.getByRole('region', { name: 'Graveyard pile' })).toBeVisible();
  await expect(dialog.getByRole('region', { name: 'Bottom pile' })).toHaveCount(0);
  const before = await graveyardCount(page);
  const first = pile(dialog, 'top').first();
  await first.getByRole('button', { name: /to the Graveyard pile/ }).click();
  await expect(pile(dialog, 'other')).toHaveCount(1);
  await expect(dialog).toContainText('1 on top, 1 into the graveyard.');
  await confirm(dialog).click();

  await expect(dialog).toHaveCount(0);
  await expect(logText(page)).toContainText('You surveil 2: 1 on top, 1 into the graveyard.');
  expect(await graveyardCount(page)).toBe(before + 1);
  expect(errors).toEqual([]);
});

test('Brainstorm shape: the picks are numbered from the top and the log counts the cards', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await start(page, SEED.putOnTop);
  const panel = page.getByRole('region', { name: 'Cards to put on top' });
  await playUntil(page, 'SYNTHETIC Brainstorm Like', async () => (await panel.count()) > 0);

  await expect(page.locator('.dec-prompt')).toContainText(
    'Put two cards from your hand on top of your library in any order.',
  );
  await expect(primary(page)).toBeDisabled();
  const rows = panel.locator('.dec-pick');
  const firstName = (await rows.nth(0).locator('.dec-pick-name').innerText()).replace(/ ×\d+$/, '');
  const secondName = (await rows.nth(1).locator('.dec-pick-name').innerText()).replace(
    / ×\d+$/,
    '',
  );
  // Pick the second row first: it becomes the top card.
  await rows.nth(1).click();
  await expect(rows.nth(1)).toContainText('1st from top');
  await rows.nth(0).click();
  await expect(rows.nth(0)).toContainText('2nd from top');
  await expect(panel.getByRole('list', { name: 'Your picks, in order' })).toContainText(
    `1st ${secondName}`,
  );
  await expect(page.locator('.board-hand')).toContainText('1st from top');
  await expect(page.locator('.board-hand')).toContainText('2nd from top');
  await expect(primary(page)).toBeEnabled();
  await primary(page).click();

  await expect(panel).toHaveCount(0);
  await expect(logText(page)).toContainText('You put 2 cards on top of your library.');
  expect(errors).toEqual([]);
  // The log never lists the cards that went back (the zone moves are one line with a count).
  await expect(logText(page)).not.toContainText('hand to library');
  void firstName;
});
