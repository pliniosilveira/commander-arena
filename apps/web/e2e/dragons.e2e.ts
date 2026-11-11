import { expect, type Page, test } from '@playwright/test';
import { handCard, mine } from './harness/locators';
import { settled } from './harness/settle';

/**
 * The questions of the Dragons slice (D-151): the chapter a Saga with read ahead starts with and the discard of any number of cards it
 * leads to, Behold over cards of the hand and permanents, and a card exiled to be played. The listed test decks hold none of these
 * cards, so the games use the hidden SYNTHETIC deck `synthetic-dragons-early` (game/precons.ts): invented cards, not real ones. A
 * scripted player plays lands, casts the cards that are not kept and keeps the others in the hand until the question is on screen. The
 * engine and the AI are seeded, so a given seed reaches it at the same point every time; the loop acts only on a settled page. A seed
 * list is tried in order, so a change of the AI that moves a game does not need a new seed at once.
 */
const EARLY = 'synthetic-dragons-early';
const EXILE = 'synthetic-dragons-exile';
const game = (seed: number, human: string, ai: string) => `/?autostart=${human},${ai}&seed=${seed}`;

const SHOTS =
  '/tmp/claude-0/-workspace/4fe7b6d7-c54c-5b64-9a0a-fc1007e1684e/scratchpad/dragons-shots';

const primary = (page: Page) => page.locator('.dec-bar [data-dec-primary]');
const prompt = (page: Page) => page.locator('.dec-prompt');
const logText = (page: Page) => page.getByRole('log');
const inHand = (page: Page, name: string) =>
  page.locator('.board-hand .board-hand-card', { hasText: name });
const endDiscard = (page: Page) => page.getByRole('dialog', { name: /^Discard/ });

interface Play {
  /** True when the situation is on screen; asked only when no dialog is open. */
  readonly ready: () => Promise<boolean>;
  /** Cards matching this stay in the hand (lands and every other card are played when they can be). */
  readonly keep: RegExp;
}

/** Plays on until `ready` holds; false when the game ends or `steps` actions did not reach it. */
async function playUntil(page: Page, play: Play, steps = 700): Promise<boolean> {
  const keepButton = page.getByRole('button', { name: 'Keep', exact: true });
  for (let step = 0; step < steps; step += 1) {
    await settled(page);
    if (await keepButton.isVisible()) {
      await keepButton.click();
      continue;
    }
    if (await endDiscard(page).isVisible()) {
      const cards = endDiscard(page).locator('.dec-card-button');
      const spare = cards.filter({ hasNotText: play.keep });
      await ((await spare.count()) > 0 ? spare : cards).first().click();
      await endDiscard(page).getByRole('button', { name: 'Confirm' }).click();
      continue;
    }
    if ((await page.locator('.dec-overlay').count()) === 0 && (await play.ready())) return true;
    if ((await page.getByText(/ wins\.$/).count()) > 0) return false;
    const cards = page.locator('.board-hand .is-clickable').filter({ hasNotText: play.keep });
    if ((await cards.count()) > 0) {
      await cards.first().click();
    } else if ((await primary(page).count()) > 0 && (await primary(page).isEnabled())) {
      await primary(page).click();
    }
  }
  return false;
}

/** Tries each seed in turn until the game reaches the situation. */
async function reach(
  page: Page,
  seeds: readonly number[],
  start: (seed: number) => string,
  play: Play,
): Promise<number> {
  for (const seed of seeds) {
    await page.goto(start(seed));
    if (await playUntil(page, play)) return seed;
  }
  throw new Error(`no seed of ${seeds.join(', ')} reaches the situation`);
}

/** Passes priority until `region` is on screen (the spell or ability resolving asks its question). */
async function passUntil(page: Page, region: ReturnType<Page['locator']>): Promise<void> {
  for (let step = 0; step < 40; step += 1) {
    await settled(page);
    if (await region.isVisible()) return;
    if ((await primary(page).count()) > 0 && (await primary(page).isEnabled())) {
      await primary(page).click();
    }
  }
  throw new Error('the question never came');
}

test('Read ahead: the dialog asks for the chapter with the words of each, and chapter II asks for any number of cards to discard', async ({
  page,
}) => {
  test.setTimeout(420_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const saga = 'SYNTHETIC Reading Rite';
  await reach(page, [2, 3, 4, 5, 6, 7], (seed) => game(seed, EARLY, 'swamp-forest'), {
    keep: /SYNTHETIC (?!Plain Drake)/,
    ready: async () => (await handCard(page, saga).count()) > 0,
  });
  await handCard(page, saga).first().click();
  const dialog = page.getByRole('dialog', { name: 'Choose a chapter' });
  await passUntil(page, dialog);

  await expect(dialog.locator('h2')).toHaveText(saga);
  await expect(dialog.locator('[data-option-prompt]')).toHaveText(
    `Choose a chapter to start with for ${saga}.`,
  );
  await expect(dialog).toContainText('It enters with that many lore counters.');
  await expect(dialog.locator('button[data-option]')).toHaveCount(3);
  await expect(dialog.locator('[data-option="1"]')).toContainText('Chapter I');
  await expect(dialog.locator('[data-option="2"]')).toContainText(
    'Discard any number of cards, then draw that many cards.',
  );
  await page.screenshot({ path: `${SHOTS}/read-ahead-chapter.png` });

  // Chapter II: the Saga enters with two lore counters and its second chapter triggers at once.
  await dialog.locator('[data-option="2"]').click();
  const panel = page.getByRole('region', { name: 'Cards to discard' });
  await passUntil(page, panel);
  await expect(prompt(page)).toContainText('Discard any number of cards (');
  // Nothing chosen is an answer, and the button says what it does.
  await expect(primary(page)).toHaveText('Discard none');
  await expect(primary(page)).toBeEnabled();
  await expect(page.locator('.dec-bar')).toContainText('Confirm to discard none');
  await page.screenshot({ path: `${SHOTS}/read-ahead-discard.png` });

  await primary(page).click();
  await settled(page);
  await expect(panel).toBeHidden();
  await expect(page.locator('.board-tile', { hasText: saga }).first()).toContainText('Lore 2');
  expect(errors).toEqual([]);
});

test('Behold: the dock lists the cards of the hand and the permanents you control, and a permanent chosen is enough', async ({
  page,
}) => {
  test.setTimeout(420_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const scout = 'SYNTHETIC Dragon Scout';
  await reach(page, [2, 3, 4, 5, 6, 7, 8, 9], (seed) => game(seed, EARLY, 'swamp-forest'), {
    // A Dragon stays in the hand (Plain Drake), another goes onto the battlefield (Ember Tyrant), then the Scout is cast.
    keep: /SYNTHETIC (Plain Drake|Dragon Scout|Reading Rite|Impulse Rite|Seer Drake)/,
    ready: async () =>
      (await handCard(page, scout).count()) > 0 &&
      (await inHand(page, 'SYNTHETIC Plain Drake').count()) > 0 &&
      (await mine(page, 'SYNTHETIC Ember Tyrant').count()) > 0,
  });
  await handCard(page, scout).first().click();
  // "When this creature enters, you may behold a Dragon": asked first, with what is beheld.
  const ask = page.getByRole('dialog', { name: 'Optional ability' });
  await passUntil(page, ask);
  await expect(ask).toContainText(
    'Behold a Dragon? Reveal a Dragon card from your hand or choose a Dragon you control on the battlefield.',
  );
  await ask.getByRole('button', { name: 'Behold', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Cards to behold' });
  await settled(page);
  await expect(panel).toBeVisible();

  await expect(panel.locator('h3')).toHaveText('Behold a Dragon');
  await expect(prompt(page)).toHaveText(`Behold a Dragon (${scout}'s ability).`);
  await expect(panel).toContainText(
    'Reveal a Dragon card from your hand or choose a Dragon you control on the battlefield',
  );
  await expect(panel.locator('[data-behold-zone="hand"]')).toHaveText(
    'In your hand, revealed when chosen:',
  );
  await expect(panel.getByRole('list', { name: 'Cards of your hand' })).toContainText(
    'SYNTHETIC Plain Drake',
  );
  await expect(panel.locator('[data-behold-zone="battlefield"]')).toHaveText(
    'On the battlefield, only chosen:',
  );
  await expect(panel.getByRole('list', { name: 'Permanents you control' })).toContainText(
    'SYNTHETIC Ember Tyrant',
  );
  // Nothing is chosen yet: a Behold that is begun is done, so Confirm waits.
  await expect(primary(page)).toHaveText('Behold');
  await expect(primary(page)).toBeDisabled();
  await page.screenshot({ path: `${SHOTS}/behold-dock.png` });

  // The permanent on the battlefield is chosen from the dock; the board marks it.
  await panel.getByRole('button', { name: /SYNTHETIC Ember Tyrant/ }).click();
  await expect(primary(page)).toBeEnabled();
  await expect(mine(page, 'SYNTHETIC Ember Tyrant').first()).toContainText('Behold');
  await page.screenshot({ path: `${SHOTS}/behold-chosen.png` });
  await primary(page).click();
  await settled(page);
  await expect(panel).toBeHidden();
  // "If you do": the Treasure comes either way.
  await passUntil(page, mine(page, 'Treasure').first());
  expect(errors).toEqual([]);
});

test('A card exiled to be played: a chip above the hand says "Cast from exile" or "Play from exile", and a click plays it', async ({
  page,
}) => {
  test.setTimeout(420_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const rite = 'SYNTHETIC Impulse Rite';
  const chip = page
    .getByRole('region', { name: 'Cast from exile' })
    .locator('.board-flashback-chip');
  // The deck is Mountains and Rites, so the top card is nearly always a land; the Rite is cast while the land drop of the turn is still
  // there, so the land it exiles can be played. A seed that exiles a card that cannot be played now is not the one: the next is tried.
  let reached = false;
  for (const seed of [2, 3, 4, 5, 6, 7, 8, 9, 10, 11]) {
    await page.goto(game(seed, EXILE, 'swamp-forest'));
    const ready = await playUntil(page, {
      keep: /SYNTHETIC Impulse Rite/,
      ready: async () =>
        (await handCard(page, rite).count()) > 0 && (await handCard(page, 'Mountain').count()) > 0,
    });
    if (!ready) continue;
    await handCard(page, rite).first().click();
    for (let step = 0; step < 12; step += 1) {
      await settled(page);
      // The spell resolves at once when nothing answers it: the chip may be there already.
      if (await chip.first().isVisible()) break;
      if ((await primary(page).count()) > 0 && (await primary(page).isEnabled())) {
        await primary(page).click();
      }
    }
    await settled(page);
    if (await chip.first().isVisible()) {
      reached = true;
      break;
    }
  }
  expect(reached).toBe(true);
  // The pointer is still over the card that was clicked, which lifts it over the chip: move it away, as a player would.
  await page.mouse.move(700, 300);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

  await expect(chip.first().locator('span')).toHaveText(/^(Cast|Play) from exile$/);
  await expect(logText(page)).toContainText('is exiled from the top of your library.');
  // The card that was lifted under the pointer settles back (a transition).
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${SHOTS}/impulse-chip.png` });

  // The card is in exile with a permission: one click casts the spell or plays the land.
  const name = (await chip.first().locator('b').textContent()) ?? '';
  await chip.first().click();
  await settled(page);
  await expect(page.getByRole('region', { name: 'Cast from exile' })).toBeHidden();
  await expect(logText(page)).toContainText(new RegExp(`You (cast|play) ${name}`));
  expect(errors).toEqual([]);
});
