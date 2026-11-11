import { expect, type Page, test } from '@playwright/test';
import { handCard, mine } from './harness/locators';
import { settled } from './harness/settle';

/**
 * Additional costs, cost reductions and free casts (D-095, D-101). The listed test decks hold none,
 * so these games use the hidden SYNTHETIC deck `synthetic-costs` (game/precons.ts): invented cards,
 * not real ones, against "Rats and Spiders" (a quiet opponent). A scripted player plays lands and
 * plain creatures and keeps the spells in hand until the card under test can be used. The engine
 * and the AI are seeded, so a given seed reaches it at the same point every time; the loop only
 * waits for the page to settle and acts once on what is on screen.
 */
const game = (seed: number) => `/?autostart=synthetic-costs,swamp-forest&seed=${seed}`;

// Seeds found by running this script's loop against the store (the same clicks, the same autopilot):
// 1 holds two creatures and a Sacrifice Draw, 4 two creatures and a Double Toll, 10 a Giant Discount
// and a Grizzly Bears; 3 puts a Free Colossus and an Always Free in reach of the commander. Any seed
// that reaches the situation passes; these reach it early.
const S_SACRIFICE = 1;
const S_DISCARD = 4;
const S_REDUCED = 10;
const S_FREE = 3;

const primary = (page: Page) => page.locator('.dec-bar [data-dec-primary]');
const prompt = (page: Page) => page.locator('.dec-prompt');
const logText = (page: Page) => page.getByRole('log');
const creatures = (page: Page) => mine(page, /Grizzly Bears|SYNTHETIC Doomed Scout/);
const discardDialog = (page: Page) => page.getByRole('dialog', { name: /^Discard/ });
const chooser = (page: Page) => page.getByRole('group', { name: 'Choose an ability' });

/** Every invented spell except the plain creature stays in the hand. */
const KEEP_SPELLS = /SYNTHETIC (?!Doomed Scout)/;

/**
 * Plays on until `ready` holds; cards matching `keep` stay in the hand. When the hand is over its
 * limit the script discards a kept card that is not `need`ed first, then anything else, so the cards
 * the scenario is waiting for (creatures to sacrifice, lands) are not thrown away.
 */
async function playUntil(
  page: Page,
  ready: () => Promise<boolean>,
  { keep = KEEP_SPELLS, need = /^$/, commander = false } = {},
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
      const cmdr = page.locator('.board-cmdr.is-clickable');
      if ((await cards.count()) > 0) {
        await cards.first().click();
      } else if (commander && (await cmdr.count()) > 0) {
        await cmdr.first().click();
      } else if ((await primary(page).count()) > 0 && (await primary(page).isEnabled())) {
        await primary(page).click();
      }
    }
  }
  throw new Error('the game never reached the situation');
}

/** Mana the player's untapped lands and Sol Rings make: a land makes one, a Sol Ring two. */
async function sources(page: Page): Promise<number> {
  const untapped = page.locator('[data-field-seat="0"] .board-tile:not(.is-tapped)');
  const rings = await untapped.filter({ hasText: 'Sol Ring' }).count();
  const lands = await untapped
    .filter({
      has: page.locator('.board-tile-name', { hasText: /^(Plains|Swamp|Mountain|Forest)$/ }),
    })
    .count();
  return lands + 2 * rings;
}

/** Clicks the card, pays (Auto-pay is the default) and waits for the next question. */
async function cast(page: Page, name: string): Promise<void> {
  await handCard(page, name).first().click();
  await settled(page);
}

test('a spell with "sacrifice a creature" asks which one; confirm puts it in the graveyard', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(game(S_SACRIFICE));
  const spell = 'SYNTHETIC Sacrifice Draw';
  await playUntil(
    page,
    async () => (await handCard(page, spell).count()) > 0 && (await creatures(page).count()) >= 2,
    { need: /Sacrifice Draw/ },
  );
  const before = await creatures(page).count();

  // The preview of the card lists the additional cost.
  await handCard(page, spell).first().click({ button: 'right' });
  const preview = page.getByRole('complementary', { name: 'Card preview' });
  await expect(preview.locator('[data-additional-cost]')).toHaveText('Sacrifice a creature');
  await page.keyboard.press('Escape');

  await cast(page, spell);
  const panel = page.getByRole('region', { name: 'Permanents to sacrifice' });
  await expect(panel).toBeVisible();
  await expect(prompt(page)).toHaveText(
    `Sacrifice a creature as an additional cost to cast ${spell}.`,
  );
  await expect(panel.locator('h3')).toHaveText(`Sacrifice to cast ${spell}`);
  await expect(primary(page)).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible();

  const chip = panel.getByRole('button', { name: /^(Grizzly Bears|SYNTHETIC Doomed Scout)/ });
  const name = ((await chip.first().textContent()) ?? '').replace(/ \d+$/, '');
  await chip.first().click();
  await expect(primary(page)).toBeEnabled();
  await primary(page).click();
  await expect(panel).toBeHidden();

  await expect(logText(page)).toContainText(`You sacrifice ${name}.`);
  await expect(logText(page)).toContainText(`You cast ${spell}.`);
  await settled(page);
  expect(await creatures(page).count()).toBe(before - 1);
  await page.getByRole('button', { name: /^Open You graveyard/ }).click();
  await expect(
    page
      .getByRole('dialog', { name: /graveyard/ })
      .getByLabel(name)
      .first(),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test('Cancel at the discard question takes the whole cast back, the sacrifice included', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(game(S_DISCARD));
  const spell = 'SYNTHETIC Double Toll';
  await playUntil(
    page,
    async () =>
      (await handCard(page, spell).count()) > 0 &&
      (await creatures(page).count()) >= 2 &&
      (await page.locator('.board-hand-card').count()) >= 3,
    { need: /Double Toll/ },
  );
  const before = await creatures(page).count();
  const cards = await page.locator('.board-hand-card').count();

  await cast(page, spell);
  const sacrifice = page.getByRole('region', { name: 'Permanents to sacrifice' });
  await sacrifice
    .getByRole('button', { name: /^(Grizzly Bears|SYNTHETIC Doomed Scout)/ })
    .first()
    .click();
  await primary(page).click();

  // The creature is gone and the discard question names the spell.
  const discard = page.getByRole('region', { name: 'Cards to discard' });
  await expect(discard).toBeVisible();
  await expect(prompt(page)).toHaveText(`Discard a card as an additional cost to cast ${spell}.`);
  await expect(discard.locator('h3')).toHaveText(`Discard to cast ${spell}`);
  await expect(logText(page)).toContainText('You sacrifice ');
  expect(await creatures(page).count()).toBe(before - 1);

  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(discard).toBeHidden();
  await settled(page);
  // Back where the cast began: the creature, the spell in the hand, nothing cast or discarded.
  expect(await creatures(page).count()).toBe(before);
  await expect(handCard(page, spell).first()).toBeVisible();
  expect(await page.locator('.board-hand-card').count()).toBe(cards);
  await expect(logText(page)).not.toContainText(`You cast ${spell}.`);
  await expect(logText(page)).not.toContainText('You discard');
  expect(errors).toEqual([]);
});

test('a creature spell costs {2} less with Giant Discount: shown on the card, in the preview and paid', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(game(S_REDUCED));
  await playUntil(
    page,
    async () =>
      (await mine(page, 'SYNTHETIC Giant Discount').count()) > 0 &&
      (await handCard(page, 'Grizzly Bears').count()) > 0,
    { keep: /SYNTHETIC (?!Doomed Scout|Giant Discount)|Grizzly Bears/, need: /Grizzly Bears/ },
  );

  const bears = handCard(page, 'Grizzly Bears').first();
  const cost = bears.locator('.board-cost-now');
  await expect(cost).toHaveAttribute('title', /^Costs \{G\} now \(printed \{1\}\{G\}\)/);
  await expect(cost.locator('.mana')).toHaveCount(1);
  await expect(cost.getByRole('img', { name: 'G mana' })).toBeVisible();

  await bears.click({ button: 'right' });
  const preview = page.getByRole('complementary', { name: 'Card preview' });
  await expect(preview.locator('[data-cost-now]')).toContainText('{G} (printed {1}{G})');
  await page.keyboard.press('Escape');

  // Paying by hand shows the cost the engine asks: one {G}.
  await page.getByRole('button', { name: 'Manual mana' }).click();
  await handCard(page, 'Grizzly Bears').first().click();
  const pay = page.getByRole('region', { name: 'Payment' });
  await expect(pay).toBeVisible();
  await expect(pay).toContainText('Cost');
  await expect(pay.locator('.mana')).toHaveCount(1);
  await expect(pay.getByRole('img', { name: 'G mana' })).toBeVisible();
  const forest = page.locator('[data-field-seat="0"] .board-tile:not(.is-tapped)', {
    hasText: 'Forest',
  });
  await forest.first().click();
  await primary(page).click();
  await expect(logText(page)).toContainText('You cast Grizzly Bears.');
  expect(errors).toEqual([]);
});

test('a free cast: with the commander on the battlefield the spell is cast without its mana cost', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(game(S_FREE));
  const spell = 'SYNTHETIC Free Colossus';
  await playUntil(
    page,
    async () =>
      (await handCard(page, spell).count()) > 0 && (await mine(page, 'Isamaru').count()) > 0,
    { keep: /SYNTHETIC (?!Doomed Scout)|Grizzly Bears/, need: /Free Colossus/, commander: true },
  );

  // Full Control keeps the spell on the stack, so its badge can be read there.
  await page.getByRole('button', { name: 'Full Control' }).click();
  await handCard(page, spell).first().click();
  // Seven mana is not at hand, so the free option is the only way to cast it: no menu is asked.
  await expect(chooser(page)).toHaveCount(0);
  await expect(logText(page)).toContainText(`You cast ${spell} without paying its mana cost.`);
  const stack = page.getByRole('region', { name: 'Stack' });
  await expect(stack).toContainText(spell);
  await expect(stack.getByText('free', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('a card with both ways to cast offers "Cast X" and "Cast X without paying its mana cost"', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(game(S_FREE));
  const spell = 'SYNTHETIC Always Free';
  // Five mana at hand, so both ways to cast it are listed.
  await playUntil(
    page,
    async () => (await handCard(page, spell).count()) > 0 && (await sources(page)) >= 5,
    { need: /Always Free/ },
  );

  await handCard(page, spell).first().click();
  const menu = chooser(page);
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('button', { name: `Cast ${spell}`, exact: true })).toBeVisible();
  await menu.getByRole('button', { name: `Cast ${spell} without paying its mana cost` }).click();
  await expect(logText(page)).toContainText(`You cast ${spell} without paying its mana cost.`);
  expect(errors).toEqual([]);
});
