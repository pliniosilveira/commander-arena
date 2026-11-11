import { expect, type Page, test } from '@playwright/test';
import { handCard, mine } from './harness/locators';
import { settled } from './harness/settle';

/**
 * Lords, a cost that taps other permanents, and a card cast from the graveyard (D-133). The listed test
 * decks hold none, so these games use the hidden SYNTHETIC deck `synthetic-subjects` (game/precons.ts):
 * invented cards, not real ones, against "Rats and Spiders" (a quiet opponent). A scripted player plays
 * lands and the cards the test wants in play and keeps the rest in the hand until the card under test can
 * be used. The engine and the AI are seeded, so a given seed reaches it at the same point every time; the
 * loop acts only on a settled page.
 */
const game = (seed: number) => `/?autostart=synthetic-subjects,swamp-forest&seed=${seed}`;

// Seeds found by running this script's loop against the store (the same clicks, the same autopilot). Any seed
// that reaches the situation passes; these reach it early.
const S_TAP = 1;
const S_LORD = 3;
const S_GRAVEYARD = 1;

const primary = (page: Page) => page.locator('.dec-bar [data-dec-primary]');
const prompt = (page: Page) => page.locator('.dec-prompt');
const logText = (page: Page) => page.getByRole('log');
const discardDialog = (page: Page) => page.getByRole('dialog', { name: /^Discard/ });
const life = (page: Page, seat: 0 | 1) =>
  page.locator(`.board-life[data-seat="${seat}"] .board-life-total`);

/** Mana the player's untapped Swamps make. */
const swamps = (page: Page) =>
  page.locator('[data-field-seat="0"] .board-tile:not(.is-tapped)', {
    has: page.locator('.board-tile-name', { hasText: /^Swamp$/ }),
  });

/**
 * Plays on until `ready` holds; cards matching `keep` stay in the hand. When the hand is over its limit the
 * script discards a kept card that is not `need`ed first, then anything else.
 */
async function playUntil(
  page: Page,
  ready: () => Promise<boolean>,
  { keep, need }: { keep: RegExp; need: RegExp },
): Promise<void> {
  const keepButton = page.getByRole('button', { name: 'Keep', exact: true });
  for (let step = 0; step < 600; step += 1) {
    await settled(page);
    if (await keepButton.isVisible()) {
      await keepButton.click();
    } else if (await discardDialog(page).isVisible()) {
      const cards = discardDialog(page).locator('.dec-card-button');
      const spare = cards.filter({ hasText: keep }).filter({ hasNotText: need });
      await ((await spare.count()) > 0 ? spare : cards).first().click();
      await discardDialog(page).getByRole('button', { name: 'Confirm' }).click();
    } else if ((await page.locator('.dec-overlay').count()) === 0 && (await ready())) {
      return;
    } else {
      const cards = page.locator('.board-hand .is-clickable').filter({ hasNotText: keep });
      if ((await cards.count()) > 0) {
        await cards.first().click();
      } else if ((await primary(page).count()) > 0 && (await primary(page).isEnabled())) {
        await primary(page).click();
      }
    }
  }
  throw new Error('the game never reached the situation');
}

/** Passes priority until the stack is empty again, so the spell or ability on it has resolved. */
async function resolveStack(page: Page): Promise<void> {
  const items = page.getByRole('region', { name: 'Stack' }).locator('.pnl-stack-item');
  for (let step = 0; step < 20; step += 1) {
    await settled(page);
    if ((await items.count()) === 0) return;
    if ((await primary(page).count()) > 0 && (await primary(page).isEnabled())) {
      await primary(page).click();
    }
  }
  throw new Error('the stack never emptied');
}

test('a cost that taps two artifacts asks which ones; Cancel takes the activation back', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(game(S_TAP));
  const ledger = 'SYNTHETIC Clockwork Ledger';
  await playUntil(
    page,
    async () =>
      (await handCard(page, ledger).count()) > 0 &&
      (await mine(page, 'SYNTHETIC Brass Trinket').count()) >= 2 &&
      (await swamps(page).count()) >= 2,
    { keep: /SYNTHETIC (Clockwork|Plain|Bone|Stubborn|Restless|Undead)/, need: /Clockwork/ },
  );
  await handCard(page, ledger).first().click();
  await resolveStack(page);
  const trinkets = await mine(page, 'SYNTHETIC Brass Trinket').count();
  const hand = await page.locator('.board-hand-card').count();

  // Three or more artifacts could pay: the player chooses (the Ledger may tap itself).
  await mine(page, ledger).first().click();
  const panel = page.getByRole('region', { name: 'Permanents to tap' });
  await expect(panel).toBeVisible();
  await expect(prompt(page)).toHaveText(
    'Choose 2 untapped artifacts you control to tap as a cost.',
  );
  await expect(panel.locator('h3')).toHaveText(`Tap to pay for ${ledger}`);
  await expect(panel.getByRole('button')).toHaveCount(trinkets + 1);
  await expect(primary(page)).toBeDisabled();

  // Cancel rewinds the whole activation: nothing is tapped, nothing is drawn.
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(panel).toBeHidden();
  await settled(page);
  await expect(logText(page)).not.toContainText('You tap ');
  await expect(
    page.locator('[data-field-seat="0"] .board-tile.is-tapped', { hasText: /Trinket|Ledger/ }),
  ).toHaveCount(0);

  // Again: two chosen, confirmed, tapped, and the card is drawn.
  await mine(page, ledger).first().click();
  const chips = panel.getByRole('button', { name: /^SYNTHETIC Brass Trinket/ });
  await chips.nth(0).click();
  await chips.nth(1).click();
  await expect(primary(page)).toBeEnabled();
  await primary(page).click();
  await expect(panel).toBeHidden();
  await expect(logText(page)).toContainText(
    /You tap SYNTHETIC Brass Trinket \d? ?and SYNTHETIC Brass Trinket/,
  );
  await resolveStack(page);
  await expect(
    page.locator('[data-field-seat="0"] .board-tile.is-tapped', { hasText: 'Trinket' }),
  ).toHaveCount(2);
  expect(await page.locator('.board-hand-card').count()).toBe(hand + 1);
  expect(errors).toEqual([]);
});

test('a lord of Skeletons: its bonus shows on the Skeleton and the preview says it in words', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(game(S_LORD));
  const baron = 'SYNTHETIC Bone Baron';
  const skeleton = 'SYNTHETIC Plain Skeleton';
  await playUntil(
    page,
    async () => (await mine(page, baron).count()) > 0 && (await mine(page, skeleton).count()) > 0,
    { keep: /SYNTHETIC (Clockwork|Brass|Stubborn|Restless|Undead)/, need: /^$/ },
  );
  // A Skeleton is a 1/1 on its own; with the Baron it is 2/2 (and the Baron, a Zombie, is not "other").
  for (const tile of await mine(page, skeleton).all()) {
    await expect(tile.locator('.board-stat')).toHaveText('2/2');
  }
  await expect(mine(page, baron).first().locator('.board-stat')).toHaveText('2/2');

  await mine(page, baron).first().hover();
  await expect(page.locator('.board-preview [data-play-rules]')).toHaveText(
    'Skeletons you control and other Zombies you control get +1/+1. Skeletons you control and other Zombies you control have deathtouch.',
  );
  expect(errors).toEqual([]);
});

test('a sorcery that may be cast from the graveyard: a chip, a second cast, two life lost', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(game(S_GRAVEYARD));
  const shade = 'SYNTHETIC Stubborn Shade';
  await playUntil(
    page,
    async () => (await handCard(page, shade).count()) > 0 && (await swamps(page).count()) >= 4,
    { keep: /SYNTHETIC/, need: /Stubborn Shade/ },
  );
  const foe = Number(await life(page, 1).textContent());
  await handCard(page, shade).first().click();
  await resolveStack(page);
  await expect(life(page, 1)).toHaveText(String(foe - 1));

  // The resolved sorcery is in the graveyard, and its own text lets the player cast it from there.
  const strip = page.getByRole('region', { name: 'Cast from your graveyard' });
  await expect(strip).toBeVisible();
  const chip = strip.getByRole('button', { name: `Cast from graveyard: ${shade}` });
  await expect(chip).toContainText('Cast from graveyard');
  await chip.click();
  await expect(logText(page)).toContainText(`You cast ${shade}.`);
  await resolveStack(page);
  await expect(life(page, 1)).toHaveText(String(foe - 2));
  expect(errors).toEqual([]);
});
