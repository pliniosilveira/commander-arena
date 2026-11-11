import { expect, type Page, test } from '@playwright/test';
import { handCard } from './harness/locators';
import { settled } from './harness/settle';

/**
 * Ward (CR 702.21a) and the legend rule (CR 704.5j). The listed test decks hold neither, so these
 * games use the hidden SYNTHETIC deck `synthetic-ward` (game/precons.ts): invented cards, not real
 * ones, against the same deck. A scripted player plays lands and creatures (instants stay in the
 * hand) until the card under test can be used. The engine and the AI are seeded, so a given seed
 * reaches it at the same point every time; the loop only waits for the page to settle.
 */
const game = (seed: number) => `/?autostart=synthetic-ward,synthetic-ward&seed=${seed}`;

// Seed 10 puts a Lightning Bolt in hand against a SYNTHETIC Warded Guard (the Guard's ward {1} is
// payable); seed 17 puts a Twin Image in hand beside the player's own SYNTHETIC Ancient Knight.
const S_PAY = 10;
const S_LEGEND = 17;

const primary = (page: Page) => page.locator('.dec-bar [data-dec-primary]');
/** Presses the bar's primary button if there is an enabled one right now; never waits for it. */
const press = (page: Page) =>
  primary(page)
    .click({ timeout: 400 })
    .catch(() => undefined);
const discardDialog = (page: Page) => page.getByRole('dialog', { name: /^Discard/ });
const wardDialog = (page: Page) => page.getByRole('dialog', { name: 'Ward' });
const legendPanel = (page: Page) => page.getByRole('region', { name: 'Legend rule' });
const logText = (page: Page) => page.getByRole('log');
const field = (page: Page, seat: number, name: string) =>
  page.locator(`[data-field-seat="${seat}"] .board-tile`, { hasText: name });

/** The cards the script never casts by itself: the scenario casts them on purpose. */
const KEEP = /Lightning Bolt|Murder|Twin Image/;

/** Plays on until `ready` holds; the instants named by KEEP stay in the hand. */
async function playUntil(page: Page, ready: () => Promise<boolean>): Promise<void> {
  const keepButton = page.getByRole('button', { name: 'Keep', exact: true });
  for (let step = 0; step < 600; step += 1) {
    await settled(page);
    if (await keepButton.isVisible()) {
      await keepButton.click();
    } else if (await discardDialog(page).isVisible()) {
      // The hand is over its limit (the instants are kept): discard something else.
      const cards = discardDialog(page).locator('.dec-card-button');
      const spare = cards.filter({ hasNotText: KEEP });
      await ((await spare.count()) > 0 ? spare : cards).first().click();
      await discardDialog(page).getByRole('button', { name: 'Confirm' }).click();
    } else if ((await page.locator('.dec-overlay').count()) === 0 && (await ready())) {
      return;
    } else if (await wardDialog(page).isVisible()) {
      await wardDialog(page).getByRole('button', { name: 'Pay', exact: true }).click();
    } else if (await legendPanel(page).isVisible()) {
      await legendPanel(page).locator('button[aria-pressed]').first().click();
      await primary(page).click();
    } else {
      const cards = page.locator('.board-hand .is-clickable').filter({ hasNotText: KEEP });
      if ((await cards.count()) > 0) {
        await cards.first().click();
      } else {
        await press(page);
      }
    }
  }
  throw new Error('the game never reached the situation');
}

/** A Bolt in hand and a warded creature on the opponent's side. */
const canBolt = (page: Page) => async () =>
  (await handCard(page, 'Lightning Bolt').count()) > 0 &&
  (await field(page, 1, 'SYNTHETIC Warded Guard').count()) > 0;

/** Casts the Bolt at the Guard and passes until the ward question is on screen. */
async function boltTheGuard(page: Page): Promise<void> {
  await handCard(page, 'Lightning Bolt').first().click();
  await page
    .getByRole('region', { name: 'Legal targets' })
    .getByRole('button', { name: 'SYNTHETIC Warded Guard' })
    .first()
    .click();
  await primary(page).click();
  for (let step = 0; step < 12; step += 1) {
    await settled(page);
    if (await wardDialog(page).isVisible()) break;
    await press(page);
  }
  await expect(wardDialog(page)).toBeVisible();
}

test('ward: the dialog asks "Pay {1} or Lightning Bolt is countered?"; Pay lets the Bolt resolve', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(game(S_PAY));
  await playUntil(page, canBolt(page));
  await boltTheGuard(page);

  const dialog = wardDialog(page);
  await expect(dialog).toContainText('SYNTHETIC Warded Guard');
  await expect(dialog).toContainText('Ward {1}');
  await expect(dialog).toContainText('Pay {1} or Lightning Bolt is countered?');
  await expect(dialog.getByRole('button', { name: "Don't pay" })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toHaveCount(0);

  await dialog.getByRole('button', { name: 'Pay', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(logText(page)).toContainText('You pay {1} for ward.');
  await expect(logText(page)).not.toContainText('Lightning Bolt is countered');
  for (let step = 0; step < 12; step += 1) {
    await settled(page);
    if ((await logText(page).innerText()).includes('Lightning Bolt deals 3 damage')) break;
    await press(page);
  }
  await expect(logText(page)).toContainText(
    'Lightning Bolt deals 3 damage to SYNTHETIC Warded Guard',
  );
  expect(errors).toEqual([]);
});

test("ward: Don't pay counters the Bolt and the log says so once", async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(game(S_PAY));
  await playUntil(page, canBolt(page));
  await boltTheGuard(page);

  await wardDialog(page).getByRole('button', { name: "Don't pay" }).click();
  await expect(wardDialog(page)).toBeHidden();
  const text = await logText(page).innerText();
  expect(text).toContain("You don't pay; Lightning Bolt is countered.");
  expect(text.match(/Lightning Bolt is countered/g)).toHaveLength(1);
  expect(text).not.toContain('Lightning Bolt deals 3 damage to SYNTHETIC Warded Guard');
  expect(errors).toEqual([]);
});

test('legend rule: a token copy of a legendary creature asks which to keep; the other dies', async ({
  page,
}) => {
  // The game needs about twenty turns of autopilot before the Twin Image can be cast.
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(game(S_LEGEND));
  await playUntil(
    page,
    async () =>
      (await handCard(page, 'SYNTHETIC Twin Image').count()) > 0 &&
      (await field(page, 0, 'SYNTHETIC Ancient Knight').count()) > 0,
  );

  await handCard(page, 'SYNTHETIC Twin Image').first().click();
  await page
    .getByRole('region', { name: 'Legal targets' })
    .getByRole('button', { name: 'SYNTHETIC Ancient Knight' })
    .first()
    .click();
  await primary(page).click();
  for (let step = 0; step < 12; step += 1) {
    await settled(page);
    if (await legendPanel(page).isVisible()) break;
    await press(page);
  }

  const panel = legendPanel(page);
  await expect(panel).toBeVisible();
  await expect(page.locator('.dec-prompt')).toContainText(
    'You control 2 legendary permanents named SYNTHETIC Ancient Knight. Choose one to keep; the others go to the graveyard.',
  );
  await expect(panel.getByRole('button', { name: 'Cancel' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Cancel' })).toHaveCount(0);
  const chips = panel.locator('button[aria-pressed]');
  await expect(chips).toHaveCount(2);
  await expect(chips.nth(1)).toContainText('(token)');
  await expect(primary(page)).toBeDisabled();

  await chips.nth(0).click();
  await expect(page.locator('.board-ibadge', { hasText: 'Keep' })).toHaveCount(1);
  await primary(page).click();
  await expect(panel).toBeHidden();
  await expect(logText(page)).toContainText('You keep SYNTHETIC Ancient Knight (legend rule).');
  await expect(logText(page)).toContainText('SYNTHETIC Ancient Knight dies.');
  await expect(field(page, 0, 'SYNTHETIC Ancient Knight')).toHaveCount(1);
  expect(errors).toEqual([]);
});
