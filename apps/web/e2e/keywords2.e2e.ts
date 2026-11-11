import { expect, type Locator, type Page, test } from '@playwright/test';
/**
 * Keyword batch 2 (D-116, D-120): the cost-payment question of Convoke and Delve, Cancel rewinding it, and a
 * regeneration shield chip. The listed test decks hold none of these cards, so the games use the hidden
 * SYNTHETIC deck `synthetic-keywords-2` (game/precons.ts): invented cards, not real ones, against "Rats and
 * Spiders" (a quiet opponent). The engine and the AI are seeded and every click answers the settled page, so a
 * given seed reaches the situation at the same point every time.
 */
import {
  bears,
  drive,
  game,
  graveyardSize,
  handCard,
  primary,
  untappedLands,
} from './harness/keywords2-script';
import { settled } from './harness/settle';

// Any seed that reaches the situation passes; these were scanned and reach it early.
const SEED_CONVOKE = 36;
const SEED_DELVE = 22;
const SEED_SHIELD = 28;

const logText = (page: Page) => page.getByRole('log');
const WURM = 'SYNTHETIC Convoke Wurm';
const SPIRIT = 'SYNTHETIC Delve Spirit';
const CHARM = 'SYNTHETIC Regrowth Charm';

/** A cheap invented creature to cast, to use up lands. */
async function spend(page: Page): Promise<Locator | null> {
  const cheap = page.locator('.board-hand .is-clickable', {
    hasText: /SYNTHETIC (Skulk Rogue|Battle Cry Chief|Evolve Whelp)/,
  });
  return (await cheap.count()) > 0 ? cheap.first() : null;
}

/** Plays on until the Wurm can be cast and the lands alone cannot pay for it, so the suggestion is not empty. */
async function reachConvoke(page: Page): Promise<void> {
  await drive(page, {
    keep: [WURM],
    // Cheap creatures are cast to use up lands, until the lands alone cannot pay for the Wurm.
    spare: () => spend(page),
    until: async () =>
      (await handCard(page, WURM).count()) > 0 &&
      (await untappedLands(page)) <= 5 &&
      (await bears(page, true).count()) >= 1,
  });
}

test('Convoke: the panel lists the creatures with the suggestion picked, says what they pay, and taps them', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(game(SEED_CONVOKE));
  await reachConvoke(page);
  const tappedBefore = await bears(page).and(page.locator('.is-tapped')).count();

  await handCard(page, WURM).first().click();
  const panel = page.getByRole('dialog', { name: 'Convoke' });
  await expect(panel).toBeVisible();
  await expect(panel).toContainText(`Convoke: tap creatures to pay for ${WURM} ({4}{G}{G})`);
  const cards = panel.locator('[data-pay-cards] .dec-card-button');
  const picked = panel.locator('[data-pay-cards] .dec-card-button[aria-pressed="true"]');
  const count = await picked.count();
  expect(count).toBeGreaterThan(0);
  expect(await cards.count()).toBeGreaterThanOrEqual(count);
  // The live line says what the picks pay and what is still paid with mana.
  await expect(panel.locator('[data-pay-line]')).toHaveText(
    /^These pay .+; you still pay \{.+\} with mana\.$|^These pay .+; nothing is left to pay with mana\.$/,
  );
  await expect(primary(page)).toHaveText(count === 1 ? 'Tap 1 creature' : `Tap ${count} creatures`);
  await expect(primary(page)).toBeEnabled();

  // Taking one back changes the line and the button; the engine decides whether it is still legal.
  await picked.first().click();
  await expect(panel.locator('[data-pay-detail]')).toContainText(`${count - 1} of up to`);
  await panel.getByRole('button', { name: 'Use suggested' }).click();
  await expect(picked).toHaveCount(count);

  await primary(page).click();
  await expect(panel).toBeHidden();
  await settled(page);
  const names = Array.from({ length: count }, () => 'Grizzly Bears');
  const tapped =
    names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
  await expect(logText(page)).toContainText(`You tap ${tapped} to convoke ${WURM}.`);
  await expect(logText(page)).toContainText(`You cast ${WURM}`);
  // The creatures stay tapped on the board.
  expect(await bears(page).and(page.locator('.is-tapped')).count()).toBe(tappedBefore + count);
  expect(errors).toEqual([]);
});

test('Cancel (and Esc) rewinds the cast; an answer the engine does not list cannot be confirmed', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(game(SEED_CONVOKE));
  await reachConvoke(page);
  const untappedBears = await bears(page, true).count();
  const lands = await untappedLands(page);

  await handCard(page, WURM).first().click();
  const panel = page.getByRole('dialog', { name: 'Convoke' });
  await expect(panel).toBeVisible();
  // Nothing picked means paying all in mana, which the lands cannot: the engine did not list it.
  await panel.getByRole('button', { name: 'Clear' }).click();
  await expect(panel.locator('[data-pay-line]')).toContainText('you pay {4}{G}{G} with mana');
  await expect(primary(page)).toHaveText('Pay all in mana');
  await expect(primary(page)).toBeDisabled();
  await expect(primary(page)).toHaveAttribute('title', /could not pay/);

  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await settled(page);
  // The cast is taken back: the Wurm is in the hand, castable again, nothing was tapped or logged.
  await expect(handCard(page, WURM)).toHaveCount(1);
  expect(await bears(page, true).count()).toBe(untappedBears);
  expect(await untappedLands(page)).toBe(lands);
  await expect(logText(page)).not.toContainText('to convoke');

  await handCard(page, WURM).first().click();
  await expect(panel).toBeVisible();
  await panel.getByRole('button', { name: 'Cancel' }).click();
  await expect(panel).toBeHidden();
  expect(errors).toEqual([]);
});

test('Delve: the graveyard cards are exiled for the generic mana', async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(game(SEED_DELVE));
  await drive(page, {
    keep: [SPIRIT, CHARM],
    // The Charm is cast on a Bear as soon as there is one, so the graveyard has a card to delve.
    cast: async () => {
      const charm = handCard(page, CHARM);
      return (await graveyardSize(page)) === 0 &&
        (await bears(page).count()) > 0 &&
        (await charm.count()) > 0
        ? charm.first()
        : null;
    },
    spare: async () => ((await graveyardSize(page)) > 0 ? spend(page) : null),
    until: async () => {
      return (
        (await handCard(page, SPIRIT).count()) > 0 &&
        (await graveyardSize(page)) > 0 &&
        (await untappedLands(page)) <= 4
      );
    },
  });
  const graveyard = await graveyardSize(page);

  await handCard(page, SPIRIT).first().click();
  const panel = page.getByRole('dialog', { name: 'Delve' });
  await expect(panel).toBeVisible();
  await expect(panel).toContainText(`Delve: exile cards from your graveyard to pay for ${SPIRIT}`);
  const picked = panel.locator('[data-pay-cards] .dec-card-button[aria-pressed="true"]');
  const count = await picked.count();
  expect(count).toBeGreaterThan(0);
  await expect(primary(page)).toHaveText(count === 1 ? 'Exile 1 card' : `Exile ${count} cards`);
  await expect(panel.locator('[data-pay-line]')).toContainText('These pay {');
  await primary(page).click();
  await expect(panel).toBeHidden();
  await settled(page);
  await expect(logText(page)).toContainText(
    `You exile ${count} card${count === 1 ? '' : 's'} to delve ${SPIRIT}.`,
  );
  expect(await graveyardSize(page)).toBe(graveyard - count);
  expect(errors).toEqual([]);
});

test('Regenerate: a Charm gives a Bear a shield, shown as a chip on its tile and a row in the preview', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(game(SEED_SHIELD));
  const chip = page.locator('.board-kw[title="Regeneration shield"]');
  await drive(page, {
    keep: [CHARM],
    // The Charm is cast on a Bear (the first creature the target question offers) as soon as it can be.
    cast: async () => {
      const charm = handCard(page, CHARM);
      return (await bears(page).count()) > 0 && (await charm.count()) > 0 ? charm.first() : null;
    },
    until: async () => (await chip.count()) > 0,
  });
  await expect(logText(page)).toContainText(`You cast ${CHARM}`);
  await expect(chip).toHaveCount(1);
  await expect(chip).toHaveText('Reg');
  // The tile says so in its accessible name, and the preview has a row that explains it.
  const tile = page.locator('[data-field-seat="0"] .board-tile', { has: chip });
  await expect(tile).toHaveAttribute('aria-label', /regeneration shield/);
  await tile.hover();
  const preview = page.getByRole('complementary', { name: 'Card preview' });
  await expect(preview).toContainText('Regeneration shield');
  await expect(preview.locator('[data-regeneration-shield]')).toContainText('1 shield');
  expect(errors).toEqual([]);
});
