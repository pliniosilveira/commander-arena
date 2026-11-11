import { expect, type Page, test } from '@playwright/test';
import { handCard, mine } from './harness/locators';
import { settled } from './harness/settle';

/**
 * Spectacle, Escape and Unearth (D-117, D-124). The listed test decks hold none, so these games use
 * the hidden SYNTHETIC decks `synthetic-spectacle`, `synthetic-escape` and `synthetic-unearth`
 * (game/precons.ts): invented cards, not real ones, against "Rats and Spiders". A scripted player
 * plays lands and passes, never casts a spell until the card under test can be used, and for Escape
 * and Unearth keeps its lands in hand while the end-of-turn discard (hand over seven) fills the
 * graveyard with the card under test. The engine and the AI are seeded, so a given seed reaches the
 * situation at the same point every time; the loop only waits for the page to settle and acts once
 * on what is on screen.
 */
const game = (deck: string, seed: number) => `/?autostart=${deck},swamp-forest&seed=${seed}`;

const primary = (page: Page) => page.locator('.dec-bar [data-dec-primary]');
const logText = (page: Page) => page.getByRole('log');
const chooser = (page: Page) => page.getByRole('group', { name: 'Choose an ability' });
const stack = (page: Page) => page.getByRole('region', { name: 'Stack' });
const discardDialog = (page: Page) => page.getByRole('dialog', { name: /^Discard/ });
/** The chips above the hand for the cards of the graveyard that can be used now. */
const chip = (page: Page, label: string | RegExp) =>
  page.locator('.board-flashback-chip', { hasText: label });
const graveyardButton = (page: Page) =>
  page.getByRole('button', { name: /^Open You.* graveyard/i });

async function graveyardCount(page: Page): Promise<number> {
  const label = (await graveyardButton(page).getAttribute('aria-label')) ?? '';
  return Number(label.match(/(\d+) cards?/)?.[1] ?? 0);
}

/** Untapped lands of the player. */
async function lands(page: Page): Promise<number> {
  return page
    .locator('[data-field-seat="0"] .board-tile:not(.is-tapped)')
    .filter({
      has: page.locator('.board-tile-name', { hasText: /^(Plains|Island|Swamp|Mountain|Forest)$/ }),
    })
    .count();
}

interface Play {
  /** True when the situation is on screen. */
  readonly ready: () => Promise<boolean>;
  /** The card the end-of-turn discard gives up first. */
  readonly fodder?: string;
  /** True while the script keeps its lands in hand (the graveyard is still being filled). */
  readonly hold?: () => Promise<boolean>;
}

/** Plays on (lands, passes) until `ready` holds; no spell is ever cast by the script. */
async function playUntil(page: Page, play: Play): Promise<void> {
  const keepButton = page.getByRole('button', { name: 'Keep', exact: true });
  for (let step = 0; step < 900; step += 1) {
    await settled(page);
    if (await keepButton.isVisible()) {
      await keepButton.click();
    } else if (await discardDialog(page).isVisible()) {
      const fodder = discardDialog(page).locator('.dec-card-button', {
        hasText: play.fodder ?? '',
      });
      await ((await fodder.count()) > 0 ? fodder : discardDialog(page).locator('.dec-card-button'))
        .first()
        .click();
      await discardDialog(page).getByRole('button', { name: 'Confirm' }).click();
    } else if ((await page.locator('.dec-overlay').count()) === 0 && (await play.ready())) {
      return;
    } else {
      const land = page.locator('.board-hand .is-clickable').filter({ hasText: 'Basic Land' });
      const holding = play.hold === undefined ? false : await play.hold();
      if (!holding && (await land.count()) > 0) {
        await land.first().click();
      } else if ((await primary(page).count()) > 0 && (await primary(page).isEnabled())) {
        await primary(page).click();
      }
    }
  }
  throw new Error('the game never reached the situation');
}

/** Presses the primary button until `done` holds, on a settled page every time. */
async function passUntil(page: Page, done: () => Promise<boolean>, max = 80): Promise<void> {
  for (let step = 0; step < max; step += 1) {
    await settled(page);
    if (await done()) return;
    if ((await primary(page).count()) > 0 && (await primary(page).isEnabled())) {
      await primary(page).click();
    }
  }
  throw new Error('the game never got there');
}

test('Spectacle: no button until an opponent loses life, then "Spectacle {1}{R}", the log and the badge', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const raider = 'SYNTHETIC Spectacle Raider';
  const pulse = 'SYNTHETIC Drain Pulse';
  await page.goto(game('synthetic-spectacle', 1));
  // Three lands, one of them a Mountain: they pay Spectacle {1}{R} and the pulse, but not {3}{R}.
  await playUntil(page, {
    ready: async () =>
      (await lands(page)) === 3 &&
      (await mine(page, 'Mountain').count()) > 0 &&
      (await handCard(page, pulse).count()) > 0 &&
      (await page.locator('.board-hand [data-object-id]', { hasText: raider }).count()) > 0,
  });

  // Nobody has lost life this turn: the creature cannot be cast at all, so it is not clickable.
  await expect(handCard(page, raider)).toHaveCount(0);
  await page.getByRole('button', { name: 'Full Control', exact: true }).click();
  await handCard(page, pulse).first().click();
  await expect(logText(page)).toContainText(`You cast ${pulse}.`);
  await settled(page);
  await primary(page).click();
  await expect(logText(page)).toContainText("Opponent's life: 40 to 39.");

  // The opponent lost life: the spectacle cost is offered, and it is the only way to cast it.
  await settled(page);
  await expect(handCard(page, raider)).toHaveCount(1);
  await handCard(page, raider).first().click();
  const menu = chooser(page);
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('button', { name: 'Spectacle {1}{R}' })).toBeVisible();
  await expect(menu.locator('button:not([aria-label="Close"])')).toHaveCount(1);
  await menu.getByRole('button', { name: 'Spectacle {1}{R}' }).click();

  await expect(logText(page)).toContainText(`You cast ${raider} for its spectacle cost.`);
  await expect(stack(page).getByText('spectacle', { exact: true })).toBeVisible();
  await settled(page);
  await primary(page).click();
  await settled(page);
  // The permanent does not remember it.
  await expect(mine(page, raider)).toHaveCount(1);
  await expect(mine(page, raider).locator('.board-flag[data-alternative]')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('Escape: a button on the graveyard card, the exile question (Cancel takes the cast back), the escaped permanent', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const name = 'SYNTHETIC Escape Wraith';
  const label = 'Escape {B}{B}, exile 3 other cards';
  await page.goto(game('synthetic-escape', 1));
  // Five cards in the graveyard (the card and four others) and {B}{B}.
  await playUntil(page, {
    fodder: name,
    hold: async () => (await graveyardCount(page)) < 5,
    ready: async () =>
      (await graveyardCount(page)) >= 5 && (await chip(page, 'Escape').count()) > 0,
  });
  const before = await graveyardCount(page);

  await page.getByRole('button', { name: 'Full Control', exact: true }).click();
  await expect(chip(page, 'Escape').first()).toHaveAttribute('aria-label', `${label}: ${name}`);
  await chip(page, 'Escape').first().click();
  // A single alternative is asked about, never cast by the click.
  await expect(chooser(page).getByRole('button', { name: label })).toBeVisible();
  await chooser(page).getByRole('button', { name: label }).click();

  // The exile is part of the cost: the question lists the other cards of the graveyard.
  const picker = page.getByRole('region', { name: 'Cards to exile' });
  await expect(picker).toBeVisible();
  await expect(picker).toContainText(`Exile to cast ${name}`);
  await expect(picker).toContainText('Choose 3 cards from your graveyard.');
  await expect(page.locator('.dec-bar')).toContainText(
    `Exile 3 other cards from your graveyard to cast ${name}.`,
  );
  const exile = page.locator('.dec-bar').getByRole('button', { name: 'Exile', exact: true });
  await expect(exile).toBeDisabled();

  // Cancel takes the whole cast back: the card is in the graveyard again and the stack is empty.
  await page.locator('.dec-bar').getByRole('button', { name: 'Cancel' }).click();
  await settled(page);
  await expect(picker).toHaveCount(0);
  expect(await graveyardCount(page)).toBe(before);
  await expect(stack(page)).toContainText('Stack is empty');
  await expect(logText(page)).not.toContainText('for its escape cost');

  // Again, this time from the graveyard viewer, where the card carries the same button as a badge,
  // and choose three cards.
  await graveyardButton(page).click();
  const viewer = page.getByRole('dialog', { name: /graveyard/i });
  const card = viewer.locator('.board-zone-card.is-clickable').first();
  await expect(card.locator('.board-ibadge')).toHaveText(label);
  await card.click();
  await chooser(page).getByRole('button', { name: label }).click();
  await expect(picker).toBeVisible();
  const row = picker.locator('.dec-pick').first();
  for (let n = 1; n <= 3; n += 1) {
    await row.click();
    await expect(picker).toContainText(`${n} of 3 chosen`);
  }
  await expect(exile).toBeEnabled();
  await exile.click();

  await expect(logText(page)).toContainText(`You cast ${name} for its escape cost.`);
  await expect(stack(page).getByText('escaped', { exact: true })).toBeVisible();
  // The card and the three that were exiled left the graveyard.
  await settled(page);
  expect(await graveyardCount(page)).toBe(before - 4);
  await primary(page).click();
  await settled(page);
  const tile = mine(page, name);
  await expect(tile).toHaveCount(1);
  await expect(tile.locator('.board-flag[data-alternative="escape"]')).toHaveAttribute(
    'title',
    /Escaped: it was cast from the graveyard for its escape cost/,
  );
  expect(errors).toEqual([]);
});

test('Unearth: "Unearth {R}" on the graveyard card, haste, the delayed exile at the end step', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const name = 'SYNTHETIC Unearth Gnoll';
  await page.goto(game('synthetic-unearth', 1));
  await playUntil(page, {
    fodder: name,
    hold: async () => (await graveyardCount(page)) < 1,
    ready: async () => (await chip(page, 'Unearth {R}').count()) > 0,
  });

  await page.getByRole('button', { name: 'Full Control', exact: true }).click();
  await chip(page, 'Unearth {R}').first().click();
  // An ability, not a spell: it is on the stack under the card's name with what it does.
  const ability = stack(page).locator('.pnl-stack-item.pnl-triggered');
  await expect(ability).toContainText(name);
  await expect(ability.locator('.pnl-stack-when')).toHaveText(
    /^Return this card from your graveyard to the battlefield\. It gains haste\. Exile it at the beginning of the next end step\./,
  );
  await expect(logText(page)).not.toContainText(`You cast ${name}`);
  await settled(page);
  await primary(page).click();
  await settled(page);

  const tile = mine(page, name);
  await expect(tile).toHaveCount(1);
  await expect(tile.locator('.board-flag[data-alternative="unearth"]')).toHaveAttribute(
    'title',
    /exiled at the beginning of the next end step\. If it would leave the battlefield, it is exiled instead/,
  );
  await expect(tile).toHaveAttribute('aria-label', /unearthed/);

  // Haste: it can attack the turn it comes back.
  await passUntil(
    page,
    async () => (await primary(page).textContent())?.startsWith('No Attack') === true,
  );
  await tile.first().click();
  await expect(primary(page)).toHaveText('Declare attackers (1)');
  await primary(page).click();
  await expect(logText(page)).toContainText(`You attack with ${name}`);

  // At the end step the delayed trigger is on the stack, and then the creature is exiled.
  const delayed = stack(page).locator('.pnl-stack-item.pnl-triggered .pnl-stack-when');
  await passUntil(page, async () => (await delayed.count()) > 0);
  await expect(delayed).toHaveText('At the beginning of each end step, exile this creature');
  await passUntil(page, async () => (await mine(page, name).count()) === 0);
  await expect(logText(page)).toContainText(`${name} triggers.`);
  // It did not die: exiled, so it is not in the graveyard.
  expect(await graveyardCount(page)).toBe(0);
  expect(errors).toEqual([]);
});
