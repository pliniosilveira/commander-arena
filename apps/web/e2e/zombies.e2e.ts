import { expect, type Page, test } from '@playwright/test';
import { handCard, mine } from './harness/locators';
import { settled } from './harness/settle';

/**
 * Gift, "sacrifice any number" and a card cast from the graveyard (D-135). The listed test decks hold none, so these
 * games use the hidden SYNTHETIC deck `synthetic-zombies` (game/precons.ts): invented cards, not real ones, against
 * "Rats and Spiders" (a quiet opponent). A scripted player plays lands and keeps the cards the test wants in the hand
 * until the card under test can be used. The engine and the AI are seeded, so a given seed reaches it at the same
 * point every time; the loop acts only on a settled page.
 */
const game = (seed: number) => `/?autostart=synthetic-zombies,swamp-forest&seed=${seed}`;

// Seeds found by running this script's loop against the store (the same clicks, the same autopilot). Any seed
// that reaches the situation passes; these reach it early.
const S_GIFT = 1;
const S_ANY_NUMBER = 2;
const S_GRAVEYARD = 1;

const primary = (page: Page) => page.locator('.dec-bar [data-dec-primary]');
const prompt = (page: Page) => page.locator('.dec-prompt');
const logText = (page: Page) => page.getByRole('log');
const discardDialog = (page: Page) => page.getByRole('dialog', { name: /^Discard/ });
const handSize = (page: Page) => page.locator('.board-hand-card').count();
const foeLibrary = (page: Page) =>
  page.locator('.board-strip-opp [title="Cards in library"] b').textContent();
const life = (page: Page, seat: 0 | 1) =>
  page.locator(`.board-life[data-seat="${seat}"] .board-life-total`);
const graveyardButton = (page: Page) =>
  page.getByRole('button', { name: /^Open You.* graveyard/i });

async function graveyardCount(page: Page): Promise<number> {
  const label = (await graveyardButton(page).getAttribute('aria-label')) ?? '';
  return Number(label.match(/(\d+) cards?/)?.[1] ?? 0);
}

/** Untapped lands of one name that the player controls. */
const untapped = (page: Page, land: string) =>
  page.locator('[data-field-seat="0"] .board-tile:not(.is-tapped)', {
    has: page.locator('.board-tile-name', { hasText: new RegExp(`^${land}$`) }),
  });

interface Play {
  /** True when the situation is on screen. */
  readonly ready: () => Promise<boolean>;
  /** Cards matching this stay in the hand (lands and every other card are played). */
  readonly keep: RegExp;
  /** The card the end-of-turn discard gives up first. */
  readonly fodder?: RegExp;
  /** Called with the text of each card the end-of-turn discard gave up. */
  readonly onDiscard?: (text: string) => void;
}

/**
 * Plays on until `ready` holds: lands are played, cards matching `keep` stay in the hand, the end-of-turn discard
 * gives up the fodder first.
 */
async function playUntil(page: Page, play: Play): Promise<void> {
  const keepButton = page.getByRole('button', { name: 'Keep', exact: true });
  for (let step = 0; step < 900; step += 1) {
    await settled(page);
    if (await keepButton.isVisible()) {
      await keepButton.click();
    } else if (await discardDialog(page).isVisible()) {
      const cards = discardDialog(page).locator('.dec-card-button');
      const fodder = cards.filter({ hasText: play.fodder ?? play.keep });
      const pick = ((await fodder.count()) > 0 ? fodder : cards).first();
      play.onDiscard?.((await pick.textContent()) ?? '');
      await pick.click();
      await discardDialog(page).getByRole('button', { name: 'Confirm' }).click();
    } else if ((await page.locator('.dec-overlay').count()) === 0 && (await play.ready())) {
      return;
    } else {
      const cards = page.locator('.board-hand .is-clickable').filter({ hasNotText: play.keep });
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

test('Gift: the question names the opponent, promising it makes them draw, the log says so', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(game(S_GIFT));
  const study = 'SYNTHETIC Gift Study';
  await playUntil(page, {
    keep: /SYNTHETIC/,
    ready: async () =>
      (await handCard(page, study).count()) > 0 &&
      (await untapped(page, 'Island').count()) >= 1 &&
      (await untapped(page, '(Swamp|Island)').count()) >= 2,
  });
  const foeCards = Number(await foeLibrary(page));
  const mana = life(page, 0);
  const before = Number(await mana.textContent());
  await handCard(page, study).first().click();

  const dialog = page.getByRole('dialog', { name: 'Gift' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading')).toHaveText(study);
  await expect(dialog).toContainText(
    `Promise Opponent a gift? If you do, they draw a card before the other effects of ${study}.`,
  );
  await expect(dialog.getByRole('button', { name: 'Gift', exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'No gift' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeVisible();

  // Cancel takes the cast back: nothing on the stack, the card still in the hand, nobody drew.
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
  await settled(page);
  await expect(handCard(page, study)).toHaveCount(1);
  expect(Number(await foeLibrary(page))).toBe(foeCards);

  // Promise it: the opponent draws a card, then the spell's own effects, one of which needs the promise.
  await handCard(page, study).first().click();
  await dialog.getByRole('button', { name: 'Gift', exact: true }).click();
  await expect(logText(page)).toContainText(`You cast ${study}, promising Opponent a gift.`);
  await resolveStack(page);
  expect(Number(await foeLibrary(page))).toBe(foeCards - 1);
  await expect(mana).toHaveText(String(before + 2));
  expect(errors).toEqual([]);
});

test('Sacrifice any number: Confirm is open with nothing chosen; two chosen are sacrificed and that many are drawn', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(game(S_ANY_NUMBER));
  const god = 'SYNTHETIC Greedy God';
  await playUntil(page, {
    keep: /SYNTHETIC/,
    fodder: /SYNTHETIC (Plain|Keen|Recall|Revenant|Gift)/,
    ready: async () =>
      (await handCard(page, god).count()) > 0 && (await untapped(page, 'Swamp').count()) >= 5,
  });
  const hand = await handSize(page);
  await handCard(page, god).first().click();

  // The creature enters and its trigger resolves: pass until the choice comes up.
  const panel = page.getByRole('region', { name: 'Permanents to sacrifice' });
  for (let step = 0; step < 20 && !(await panel.isVisible()); step += 1) {
    await settled(page);
    if ((await panel.isVisible()) === false && (await primary(page).isEnabled())) {
      await primary(page).click();
    }
  }
  await expect(panel).toBeVisible();
  await expect(prompt(page)).toHaveText(
    `Sacrifice any number of other permanents you control for ${god}.`,
  );
  await expect(panel.locator('h3')).toHaveText(`Sacrifice for ${god}`);
  await expect(panel).toContainText(/0 of up to \d+ chosen/);
  // None is a legal answer, so Confirm works at once.
  await expect(primary(page)).toBeEnabled();
  await expect(primary(page)).toHaveText('Confirm');

  const chips = panel.getByRole('button', { name: /^Swamp/ });
  await chips.nth(0).click();
  await chips.nth(1).click();
  await expect(panel).toContainText(/2 of up to \d+ chosen/);
  await primary(page).click();
  await settled(page);
  await expect(logText(page)).toContainText(/You sacrifice Swamp\.[\s\S]*You sacrifice Swamp\./);
  await resolveStack(page);
  // The god left the hand for the battlefield, and two cards were drawn for the two permanents.
  expect(await handSize(page)).toBe(hand - 1 + 2);
  await expect(mine(page, god)).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('A card cast from the graveyard: the ability opens a window, the chip says so, the Zombie enters', async ({
  page,
}) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(game(S_GRAVEYARD));
  const chanter = 'SYNTHETIC Grave Chanter Zombie';
  const zombie = 'SYNTHETIC Plain Zombie';
  let given = 0;
  await playUntil(page, {
    keep: /SYNTHETIC (Gift|Greedy|Keen|Revenant|Recall|Plain)/,
    fodder: /Plain Zombie/,
    onDiscard: (text) => {
      if (text.includes('Plain Zombie')) given += 1;
    },
    ready: async () =>
      given > 0 &&
      // A creature is cast at sorcery speed: in the player's own main phase.
      /^Your turn, Main [12]/.test(
        (await page.getByRole('region', { name: 'Actions' }).innerText()).trim(),
      ) &&
      (await mine(page, chanter).count()) > 0 &&
      (await mine(page, chanter).locator('.board-flag[title="Summoning sick"]').count()) === 0 &&
      (await mine(page, chanter).locator('.is-tapped').count()) === 0 &&
      (await untapped(page, '(Swamp|Island)').count()) >= 2,
  });

  const inYard = await graveyardCount(page);
  // Full Control keeps the ability on the stack with the player holding priority, so it can be read.
  await page.getByRole('button', { name: 'Full Control', exact: true }).click();
  await mine(page, chanter).first().click();

  // The ability needs a Zombie creature card of the graveyard as its target; the stack says what it does.
  const targets = page.getByRole('region', { name: 'Legal targets' }).getByRole('button');
  await expect(prompt(page)).toHaveText(`Choose a target for ${chanter}.`);
  await targets.filter({ hasText: zombie }).first().click();
  await primary(page).click();
  await settled(page);
  await expect(
    page.getByRole('region', { name: 'Stack' }).locator('.pnl-stack-when', {
      hasText: 'You may cast target Zombie creature card from your graveyard this turn',
    }),
  ).toBeVisible();
  await resolveStack(page);

  // The card can be cast from the graveyard this turn, and the chip says so.
  const strip = page.getByRole('region', { name: 'Cast from your graveyard' });
  await expect(strip).toBeVisible();
  const chip = strip.getByRole('button', { name: `Cast from graveyard: ${zombie}` });
  await expect(chip).toContainText('Cast from graveyard');
  await chip.click();
  await expect(logText(page)).toContainText(`You cast ${zombie}.`);
  await resolveStack(page);
  await expect(mine(page, zombie)).toHaveCount(1);
  // The card left the graveyard, and with it the permission: the strip is gone.
  expect(await graveyardCount(page)).toBe(inYard - 1);
  await expect(strip).toBeHidden();
  expect(errors).toEqual([]);
});
