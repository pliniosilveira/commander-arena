import { expect, type Page, test } from '@playwright/test';
import { handCard } from './harness/locators';
import { settled } from './harness/settle';

/**
 * The questions of the Dinosaurs slice (D-145): damage divided among the targets of a spell, Hideaway (a look at the top cards that
 * must take one, a card exiled face down, played later without paying its mana cost), and a fight. The listed test decks hold none,
 * so these games use the hidden SYNTHETIC deck `synthetic-dinosaurs` (game/precons.ts): invented cards, not real ones, against "Rats
 * and Spiders". A scripted player plays lands, casts the cards that are not SYNTHETIC (Bears and Goblins, to have creatures) and keeps
 * the invented ones in the hand until the question is on screen. The engine and the AI are seeded, so a given seed reaches it at the
 * same point every time; the loop acts only on a settled page.
 */
const game = (seed: number, human = 'synthetic-dinosaurs', ai = 'swamp-forest') =>
  `/?autostart=${human},${ai}&seed=${seed}`;

const SHOTS = '/tmp/claude-0/-workspace/4fe7b6d7-c54c-5b64-9a0a-fc1007e1684e/scratchpad/dino-shots';

const primary = (page: Page) => page.locator('.dec-bar [data-dec-primary]');
const prompt = (page: Page) => page.locator('.dec-prompt');
const logText = (page: Page) => page.getByRole('log');
const endDiscard = (page: Page) => page.getByRole('dialog', { name: /^Discard/ });

interface Play {
  /** True when the situation is on screen; asked only when no dialog is open. */
  readonly ready: () => Promise<boolean>;
  /** Cards matching this stay in the hand (lands and every other card are played when they can be). */
  readonly keep: RegExp;
  /** The cards the cleanup step's discard gives up first (the card under test is never one). */
  readonly fodder?: RegExp;
}

/** Plays on until `ready` holds. */
async function playUntil(page: Page, play: Play, steps = 900): Promise<void> {
  const keepButton = page.getByRole('button', { name: 'Keep', exact: true });
  for (let step = 0; step < steps; step += 1) {
    await settled(page);
    if (await keepButton.isVisible()) {
      await keepButton.click();
      continue;
    }
    if (await endDiscard(page).isVisible()) {
      const cards = endDiscard(page).locator('.dec-card-button');
      const spare = cards.filter(
        play.fodder === undefined ? { hasNotText: play.keep } : { hasText: play.fodder },
      );
      await ((await spare.count()) > 0 ? spare : cards).first().click();
      await endDiscard(page).getByRole('button', { name: 'Confirm' }).click();
      continue;
    }
    if ((await page.locator('.dec-overlay').count()) === 0 && (await play.ready())) return;
    const cards = page.locator('.board-hand .is-clickable').filter({ hasNotText: play.keep });
    if ((await cards.count()) > 0) {
      await cards.first().click();
    } else if ((await primary(page).count()) > 0 && (await primary(page).isEnabled())) {
      await primary(page).click();
    }
  }
  const hand = await page.locator('.board-hand .board-hand-card').allInnerTexts();
  throw new Error(`the game never reached the situation: ${hand.join(' | ').replace(/\n/g, ' ')}`);
}

/** Passes priority until `region` is on screen (the spell or ability resolving asks its question). */
async function passUntil(page: Page, region: ReturnType<Page['locator']>): Promise<void> {
  for (let step = 0; step < 30; step += 1) {
    await settled(page);
    if (await region.isVisible()) return;
    if ((await primary(page).count()) > 0 && (await primary(page).isEnabled())) {
      await primary(page).click();
    }
  }
  throw new Error('the question never came');
}

const SEED_DIVIDE = 2;
const SEED_HIDEAWAY = 2;
const SEED_FIGHT = 2;
const SEED_BACK = 4;

const field = (page: Page, name: string) =>
  page.locator('.board-field [data-object-id]', { hasText: name });

test('Damage divided among the targets: choose two, split it with the steppers, Confirm only when it adds up', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(game(SEED_DIVIDE));
  const volley = 'SYNTHETIC Arc Volley';
  await playUntil(page, {
    keep: /SYNTHETIC/,
    fodder: /SYNTHETIC (?!Arc Volley)/,
    ready: async () => (await handCard(page, volley).count()) > 0,
  });
  await handCard(page, volley).first().click();

  const dock = page.locator('.dec-dock');
  const panel = dock.getByRole('region', { name: 'Legal targets' });
  await expect(panel).toBeVisible();
  await expect(prompt(page)).toHaveText(
    'Choose targets for SYNTHETIC Arc Volley, then divide 3 damage among them.',
  );
  const division = panel.locator('[data-divide]');
  await expect(division).toContainText('Divide 3 damage');
  await expect(division).toContainText('Choose the targets above');
  // Nothing is chosen: Confirm waits for a target.
  await expect(primary(page)).toBeDisabled();

  // Two targets: the opponent and the first other chip. The shares start as an even split, 2 and 1.
  const chips = panel.locator('button.dec-chip').filter({ hasNotText: 'Even split' });
  const first = chips.filter({ hasText: 'Opponent' });
  const second = chips.filter({ hasNotText: /^(Opponent)$/ }).first();
  const secondName = (await second.innerText()).trim();
  await first.click();
  await expect(division.locator('output')).toHaveText(['3']);
  await second.click();
  await expect(division.locator('output')).toHaveText(['2', '1']);
  await expect(division).toContainText('All 3 damage assigned.');
  await expect(primary(page)).toBeEnabled();
  await page.screenshot({ path: `${SHOTS}/divide-even.png` });

  // The stepper: take one from the first target; Confirm is off until the damage is given to the other.
  await division.getByRole('button', { name: 'Less damage to Opponent' }).click();
  await expect(division).toContainText('1 left to assign.');
  await expect(primary(page)).toBeDisabled();
  await expect(division.getByRole('button', { name: 'More damage to Opponent' })).toBeEnabled();
  await division.getByRole('button', { name: `More damage to ${secondName}` }).click();
  await expect(division.locator('output')).toHaveText(['1', '2']);
  await expect(division).toContainText('All 3 damage assigned.');
  await expect(primary(page)).toBeEnabled();
  // "Even split" goes back to 2 and 1.
  await division.getByRole('button', { name: 'Even split' }).click();
  await expect(division.locator('output')).toHaveText(['2', '1']);
  await division.getByRole('button', { name: 'Less damage to Opponent' }).click();
  await division.getByRole('button', { name: `More damage to ${secondName}` }).click();
  await page.screenshot({ path: `${SHOTS}/divide-stepped.png` });

  // The spell is cast with the division; each target is dealt its own share.
  await primary(page).click();
  await expect(logText(page)).toContainText('SYNTHETIC Arc Volley deals 1 damage to Opponent.');
  await expect(logText(page)).toContainText(
    new RegExp(`SYNTHETIC Arc Volley deals 2 damage to ${secondName.replace(/[()]/g, '.')}`),
  );
  expect(errors).toEqual([]);
});

test('Hideaway: the look must take one card, which is exiled face down and played later for free', async ({
  page,
}) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(game(SEED_HIDEAWAY));
  const cache = 'SYNTHETIC Hidden Cache';
  await playUntil(page, {
    keep: /SYNTHETIC/,
    fodder: /SYNTHETIC (?!Hidden Cache)/,
    ready: async () => (await handCard(page, cache).count()) > 0,
  });
  await handCard(page, cache).first().click();
  const panel = page.getByRole('region', { name: 'Cards looked at' });
  await passUntil(page, panel);

  await expect(prompt(page)).toHaveText(
    "Look at the top three cards of your library. Exile one of them face down. Put the rest on the bottom of your library in a random order (SYNTHETIC Hidden Cache's ability).",
  );
  await expect(panel).toContainText('Choose a card to exile face down.');
  await expect(panel).toContainText('Only you see these cards.');
  // A card must be taken: there is no "none", and Confirm waits for one.
  await expect(primary(page)).toHaveText('Exile face down');
  await expect(primary(page)).toBeDisabled();
  await expect(page.getByRole('button', { name: /none/i })).toHaveCount(0);
  await page.screenshot({ path: `${SHOTS}/hideaway-look.png` });
  const picks = panel.locator('button.dec-pick');
  const taken = (await picks.first().locator('.dec-pick-name').innerText()).replace(/ ×\d+$/, '');
  await picks.first().click();
  await expect(primary(page)).toBeEnabled();
  await primary(page).click();
  await settled(page);

  // The log names no card; the card is in exile, face down, marked for its controller, who may look at it.
  await expect(logText(page)).toContainText('You exile a card face down (Hideaway).');
  await expect(logText(page)).not.toContainText(`${taken}: library to exile`);
  const chip = page.locator('.board-exile-chip', { hasText: 'Hideaway' });
  await expect(chip).toHaveCount(1);
  await expect(chip).toContainText(taken);
  await page.screenshot({ path: `${SHOTS}/hideaway-exiled.png` });

  // Later: {2}, {T}: play the exiled card without paying its mana cost. The question names the card.
  await playUntil(page, {
    keep: /SYNTHETIC/,
    fodder: /SYNTHETIC/,
    ready: async () =>
      (await field(page, cache)
        .locator('xpath=self::*[contains(@class, "is-clickable")]')
        .count()) > 0,
  });
  await field(page, cache).first().click();
  const play = page.getByRole('region', { name: 'Cards to cast for free' });
  await passUntil(page, play);
  await expect(play.locator('h3')).toHaveText(`Play for free: ${cache}`);
  await expect(play).toContainText('Choose a card to play without paying its mana cost, or none.');
  await expect(prompt(page)).toHaveText(
    `You may play the exiled card without paying its mana cost (${cache}'s ability).`,
  );
  await expect(primary(page)).toHaveText("Don't play");
  await expect(play.locator('button.dec-pick .dec-pick-name')).toHaveText(taken);
  await page.screenshot({ path: `${SHOTS}/hideaway-play.png` });
  await play.locator('button.dec-pick').first().click();
  await expect(primary(page)).toHaveText('Play it');
  await primary(page).click();
  await settled(page);
  await expect(logText(page)).toContainText(new RegExp(`You (cast|play) ${taken}`));
  expect(errors).toEqual([]);
});

test('Fight: each token fights a different creature, the player chooses which, and the log says so', async ({
  page,
}) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(game(SEED_FIGHT));
  const brawl = 'SYNTHETIC Twin Brawl';
  const theirs = page.locator('[data-field-seat="1"] .board-tile', {
    hasText: /Typhoid Rats|Giant Spider|Grizzly Bears|Llanowar Elves/,
  });
  await playUntil(page, {
    keep: /SYNTHETIC/,
    fodder: /SYNTHETIC (?!Twin Brawl)/,
    ready: async () => (await handCard(page, brawl).count()) > 0 && (await theirs.count()) >= 3,
  });
  await handCard(page, brawl).first().click();
  const panel = page.getByRole('region', { name: 'Creatures to fight' });
  await passUntil(page, panel);
  await expect(prompt(page)).toHaveText(
    'Choose the creature Phyrexian Beast fights for SYNTHETIC Twin Brawl.',
  );
  await expect(panel.locator('h3')).toHaveText('Phyrexian Beast fights');
  await page.screenshot({ path: `${SHOTS}/fight-choice.png` });
  // Two tokens: each is asked in turn, the second among the creatures the first did not take.
  const chosen: string[] = [];
  for (let ask = 0; ask < 2; ask += 1) {
    await expect(panel).toBeVisible();
    const chip = panel.locator('button.dec-chip').first();
    chosen.push((await chip.innerText()).trim().replace(/ \d+$/, ''));
    await chip.click();
    await primary(page).click();
    await settled(page);
  }
  for (const name of chosen) {
    await expect(logText(page)).toContainText(
      `You choose ${name} for Phyrexian Beast to fight (SYNTHETIC Twin Brawl)`,
    );
  }
  await expect(logText(page)).toContainText(/Phyrexian Beast and .+ fight\./);
  expect(errors).toEqual([]);
});

test("The opponent's Hideaway card is a card back with no name, in the strip, the exile viewer and the log", async ({
  page,
}) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // Here the AI plays the invented deck and the human the listed one; the human only plays lands and creatures.
  await page.goto(game(SEED_BACK, 'swamp-forest', 'synthetic-dinosaurs'));
  const chip = page.locator('.board-exile-chip.is-opponent');
  await playUntil(page, {
    keep: /SYNTHETIC/,
    ready: async () => (await chip.count()) > 0,
  });
  await expect(chip.first()).toHaveAttribute('aria-label', /^Face-down card \(face down\)/);
  await expect(chip.first()).not.toContainText('Hideaway');
  await expect(logText(page)).toContainText('Opponent exiles a card face down (Hideaway).');
  await expect(logText(page)).not.toContainText(': library to exile');
  await page.screenshot({ path: `${SHOTS}/hideaway-opponent.png` });
  await page.getByRole('button', { name: /^Open exile/ }).click();
  const viewer = page.getByRole('dialog', { name: /^Exile/ });
  await expect(viewer.getByRole('button', { name: 'Face-down card (face down)' })).toHaveCount(1);
  await expect(viewer.locator('[data-face-down]')).toHaveCount(1);
  await expect(viewer.locator('[data-exile-owner="1"]')).toContainText("Opponent's");
  await page.screenshot({ path: `${SHOTS}/hideaway-opponent-viewer.png` });
  expect(errors).toEqual([]);
});
