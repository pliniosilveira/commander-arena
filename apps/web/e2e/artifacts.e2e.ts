import { expect, type Page, test } from '@playwright/test';
import { handCard } from './harness/locators';
import { settled } from './harness/settle';

/**
 * The questions of the Artifacts slice (D-139): look at the top cards and take an artifact card, discard two cards
 * unless you discard an artifact card, and tap any number of creatures as a creature attacks. The listed test decks
 * hold none, so these games use the hidden SYNTHETIC deck `synthetic-artifacts` (game/precons.ts): invented cards, not
 * real ones, against "Rats and Spiders". A scripted player plays lands, casts the cards the test wants on the
 * battlefield and keeps the others in the hand until the question is on screen. The engine and the AI are seeded, so
 * a given seed reaches it at the same point every time; the loop acts only on a settled page.
 */
const game = (seed: number) => `/?autostart=synthetic-artifacts,swamp-forest&seed=${seed}`;

// Seeds found by running this script's loop (the same clicks, the same autopilot). Any seed that reaches the
// situation passes; these reach it early.
const S_LOOK = 1;
const S_DISCARD = 2;
const S_TAP = 1;

const primary = (page: Page) => page.locator('.dec-bar [data-dec-primary]');
const prompt = (page: Page) => page.locator('.dec-prompt');
const logText = (page: Page) => page.getByRole('log');
const handSize = (page: Page) => page.locator('.board-hand-card').count();
const endDiscard = (page: Page) => page.getByRole('dialog', { name: /^Discard/ });

interface Play {
  /** True when the situation is on screen; asked only when no dialog is open. */
  readonly ready: () => Promise<boolean>;
  /** Cards matching this stay in the hand (lands and every other card are played when they can be). */
  readonly keep: RegExp;
  /** The cards the cleanup step's discard gives up first (the card under test is never one). */
  readonly fodder?: RegExp;
  /** A creature of the player's to attack with alone, at each declaration. */
  readonly attacker?: string;
}

/** Plays on until `ready` holds. */
async function playUntil(page: Page, play: Play, steps = 900): Promise<void> {
  const keepButton = page.getByRole('button', { name: 'Keep', exact: true });
  const attackers =
    play.attacker === undefined
      ? null
      : page.locator('[data-field-seat="0"] .board-tile.is-clickable', { hasText: play.attacker });
  for (let step = 0; step < steps; step += 1) {
    await settled(page);
    if (await keepButton.isVisible()) {
      await keepButton.click();
      continue;
    }
    if (await endDiscard(page).isVisible()) {
      // The hand is over its maximum at the cleanup step: the cards that are not kept go first.
      const cards = endDiscard(page).locator('.dec-card-button');
      const spare = cards.filter(
        play.fodder === undefined ? { hasNotText: play.keep } : { hasText: play.fodder },
      );
      await ((await spare.count()) > 0 ? spare : cards).first().click();
      await endDiscard(page).getByRole('button', { name: 'Confirm' }).click();
      continue;
    }
    if ((await page.locator('.dec-overlay').count()) === 0 && (await play.ready())) return;
    const label = (await primary(page).count()) > 0 ? (await primary(page).innerText()).trim() : '';
    if (attackers !== null && /^(No Attack|Attack)/.test(label) && (await attackers.count()) > 0) {
      await attackers.first().click();
      await primary(page).click();
      continue;
    }
    const cards = page.locator('.board-hand .is-clickable').filter({ hasNotText: play.keep });
    if ((await cards.count()) > 0) {
      await cards.first().click();
    } else if ((await primary(page).count()) > 0 && (await primary(page).isEnabled())) {
      await primary(page).click();
    }
  }
  throw new Error('the game never reached the situation');
}

/** Passes priority until `region` is on screen (the spell or ability resolving asks its question). */
async function passUntil(page: Page, region: ReturnType<Page['getByRole']>): Promise<void> {
  for (let step = 0; step < 20; step += 1) {
    await settled(page);
    if (await region.isVisible()) return;
    if ((await primary(page).count()) > 0 && (await primary(page).isEnabled())) {
      await primary(page).click();
    }
  }
  throw new Error('the question never came');
}

test('Look at the top six: the artifact cards may be taken, the others are shown apart, the log names no card', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(game(S_LOOK));
  const sketch = 'SYNTHETIC Artifact Sketch';
  await playUntil(page, {
    keep: /SYNTHETIC/,
    fodder: /SYNTHETIC (?!Artifact Sketch)/,
    ready: async () => (await handCard(page, sketch).count()) > 0,
  });
  await handCard(page, sketch).first().click();
  const panel = page.getByRole('region', { name: 'Cards looked at' });
  await passUntil(page, panel);
  const hand = await handSize(page);

  await expect(prompt(page)).toHaveText(
    /^Look at the top 6 cards of your library\. You may reveal a card that matches and put it into your hand; the rest go on the bottom of your library in a random order \(SYNTHETIC Artifact Sketch\)\.$/,
  );
  await expect(panel.locator('h3')).toHaveText('Top 6 cards of your library');
  await expect(panel).toContainText('Only you see these cards.');
  // Nothing chosen is an answer: the button says so.
  await expect(primary(page)).toHaveText('Take none');
  await expect(primary(page)).toBeEnabled();
  // Every card looked at is listed: the ones that may be taken (equal names are one row, "×2"), then the others.
  const takeable = panel.locator('button.dec-pick');
  const others = panel.getByRole('list', { name: 'Other cards looked at' }).locator('li');
  const names = await takeable.locator('.dec-pick-name').allInnerTexts();
  const copies = names.reduce((sum, n) => sum + Number(/ ×(\d+)$/.exec(n)?.[1] ?? 1), 0);
  expect(copies + (await others.count())).toBe(6);

  const picked = (await takeable.first().locator('.dec-pick-name').innerText()).replace(
    / ×\d+$/,
    '',
  );
  await takeable.first().click();
  await expect(primary(page)).toHaveText('Put into hand');
  await primary(page).click();
  await settled(page);
  // The card taken is revealed (CR 701.20); the look itself is a detail line that names no card.
  await expect(logText(page)).toContainText(`You reveal ${picked}.`);
  await page
    .getByRole('group', { name: 'Log detail' })
    .getByRole('button', { name: 'All' })
    .click();
  await expect(logText(page)).toContainText('You look at the top 6 cards of your library.');
  expect(await handSize(page)).toBe(hand + 1);
  expect(errors).toEqual([]);
});

test('Discard unless: two cards, or one artifact card alone', async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(game(S_DISCARD));
  const rite = 'SYNTHETIC Study Rite';
  await playUntil(page, {
    keep: /SYNTHETIC/,
    fodder: /SYNTHETIC (?!Study Rite)/,
    ready: async () => (await handCard(page, rite).count()) > 0,
  });
  await handCard(page, rite).first().click();
  const panel = page.getByRole('region', { name: 'Cards to discard' });
  await passUntil(page, panel);

  await expect(prompt(page)).toHaveText(
    'Discard 2 cards, or one card marked “enough alone” instead, for SYNTHETIC Study Rite.',
  );
  await expect(primary(page)).toHaveText('Discard');
  await expect(primary(page)).toBeDisabled();
  const alone = panel.locator('button.dec-pick', { has: page.locator('.dec-pick-alone') });
  const plain = panel.locator('button.dec-pick:not(:has(.dec-pick-alone))');
  expect(await alone.count()).toBeGreaterThan(0);
  // One card that is not an artifact card is not enough.
  if ((await plain.count()) > 0) {
    await plain.first().click();
    await expect(primary(page)).toBeDisabled();
    await plain.first().click();
  }
  const hand = await handSize(page);
  await alone.first().click();
  await expect(primary(page)).toBeEnabled();
  await primary(page).click();
  await settled(page);
  expect(await handSize(page)).toBe(hand - 1);
  await expect(logText(page)).toContainText(/You discard SYNTHETIC/);
  expect(errors).toEqual([]);
});

test('Tap any number: the attack trigger asks, Confirm works with none, the chosen creature is tapped', async ({
  page,
}) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(game(S_TAP));
  const scribe = 'SYNTHETIC Idle Scribe';
  const panel = page.getByRole('region', { name: 'Permanents to tap' });
  await playUntil(page, {
    keep: /SYNTHETIC (?!Idle Scribe|Copper Myr)/,
    attacker: scribe,
    ready: async () => panel.isVisible(),
  });

  await expect(prompt(page)).toHaveText(
    `Tap any number of untapped creatures you control for ${scribe}.`,
  );
  await expect(panel.locator('h3')).toHaveText(`Tap for ${scribe}`);
  await expect(primary(page)).toHaveText('Confirm');
  await expect(primary(page)).toBeEnabled();
  const chip = panel.getByRole('button', { name: /^SYNTHETIC Copper Myr/ }).first();
  await chip.click();
  await expect(panel).toContainText('1 of up to');
  await primary(page).click();
  await settled(page);
  await expect(logText(page)).toContainText(
    `You tap SYNTHETIC Copper Myr for ${scribe}'s ability.`,
  );
  expect(errors).toEqual([]);
});
