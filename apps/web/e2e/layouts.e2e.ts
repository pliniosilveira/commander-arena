import { expect, type Page, test } from '@playwright/test';
import { handCard, mine } from './harness/locators';
import { settled } from './harness/settle';

/**
 * Split, Adventure and modal double-faced cards (CR 709, 715, 712). The listed test decks hold
 * none, so these games use the hidden SYNTHETIC deck `synthetic-layouts` (game/precons.ts):
 * invented cards, not real ones, against the listed deck "Rats and Spiders". A scripted player
 * plays lands (and Sol Rings) until the card under test can be used; every other spell stays in the
 * hand, and a hand over seven cards is trimmed with the discard dialog. The engine and the AI are
 * seeded, so a given seed reaches it at the same point every time; the loop only waits for the
 * page to settle. In the view a face is named without the "SYNTHETIC " prefix: "Study // Zap" in
 * the hand, "Wise Owl" for the creature of an Adventure card.
 */
const game = (seed: number) => `/?autostart=synthetic-layouts,swamp-forest&seed=${seed}`;
const SPLIT_SEED = 11;
const ADVENTURE_SEED = 1;
const LAND_SEED = 1;
const SHOCK_SEED = 1;

const LANDS = /Mountain|Plains|Island|Forest|Swamp|Sol Ring/;
const primary = (page: Page) => page.locator('.dec-bar [data-dec-primary]');
/** Presses the bar's primary button if there is an enabled one right now; never waits for it. */
const press = (page: Page) =>
  primary(page)
    .click({ timeout: 150 })
    .catch(() => undefined);
const discardDialog = (page: Page) => page.getByRole('dialog', { name: /^Discard/ });
const chooser = (page: Page) => page.locator('.dec-ability-chooser');
const logText = (page: Page) => page.getByRole('log');
const untapped = (page: Page) =>
  page.locator('[data-field-seat="0"] .board-tile:not(.is-tapped)', { hasText: LANDS });
const untappedOf = (page: Page, name: string) =>
  page.locator('[data-field-seat="0"] .board-tile:not(.is-tapped)', { hasText: name });
const exileChip = (page: Page) =>
  page.getByRole('region', { name: 'Cast from exile' }).locator('.board-flashback-chip');

/** Plays on until `ready` holds, playing lands and keeping everything else in the hand. */
async function playUntil(page: Page, ready: () => Promise<boolean>): Promise<void> {
  const keepButton = page.getByRole('button', { name: 'Keep', exact: true });
  for (let step = 0; step < 700; step += 1) {
    await settled(page);
    if (await keepButton.isVisible()) {
      await keepButton.click();
    } else if (await discardDialog(page).isVisible()) {
      await discardDialog(page).locator('.dec-card-button').first().click();
      await discardDialog(page).getByRole('button', { name: 'Confirm' }).click();
    } else if ((await page.locator('.dec-overlay').count()) === 0 && (await ready())) {
      return;
    } else {
      const lands = page.locator('.board-hand .is-clickable').filter({ hasText: LANDS });
      if ((await lands.count()) > 0) {
        await lands.first().click();
      } else {
        await press(page);
      }
    }
  }
  throw new Error('the game never reached the situation');
}

test('a split card asks which half; the arrow keys and Enter pick one and it is cast by its own name', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(game(SPLIT_SEED));
  await playUntil(
    page,
    async () =>
      (await handCard(page, 'Study // Zap').count()) > 0 &&
      (await untappedOf(page, 'Island').count()) > 0 &&
      (await untappedOf(page, 'Mountain').count()) > 0,
  );

  await handCard(page, 'Study // Zap').first().click();
  const menu = chooser(page);
  await expect(menu).toBeVisible();
  // One item per half, each with its own cost and type line, and a Close.
  await expect(menu.getByRole('button')).toHaveCount(3);
  await expect(menu.getByRole('button').nth(0)).toContainText('Cast Study');
  await expect(menu.getByRole('button').nth(0)).toContainText('{1}{U} · Sorcery');
  await expect(menu.getByRole('button').nth(1)).toContainText('Cast Zap');
  await expect(menu.getByRole('button').nth(1)).toContainText('{R} · Instant');
  // The first item has the focus; ArrowDown moves to the second and Enter casts it.
  await expect(menu.getByRole('button').nth(0)).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(menu.getByRole('button').nth(1)).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(menu).toBeHidden();
  await expect(logText(page)).toContainText('You cast Zap.');
  await expect(logText(page)).not.toContainText('You cast Study');
  expect(errors).toEqual([]);
});

test('an Adventure card: cast the Adventure, see it go on an adventure, then cast the creature from exile', async ({
  page,
}) => {
  test.setTimeout(150_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(game(ADVENTURE_SEED));
  await playUntil(
    page,
    async () =>
      (await handCard(page, 'Wise Owl').count()) > 0 &&
      (await untappedOf(page, 'Island').count()) > 0 &&
      (await untapped(page).count()) >= 3,
  );

  await handCard(page, 'Wise Owl').first().click();
  const menu = chooser(page);
  await expect(menu.getByRole('button').nth(0)).toContainText('Cast Wise Owl');
  await expect(menu.getByRole('button').nth(1)).toContainText('Cast Peek (Adventure)');
  await menu.getByRole('button').nth(1).click();
  await expect(logText(page)).toContainText('You cast Peek.');
  await expect(logText(page)).toContainText('Wise Owl goes on an adventure.');

  // The card is in the shared exile, marked, and not castable yet (two lands are untapped).
  await page.getByRole('button', { name: /^Open exile/ }).click();
  const list = page.getByRole('dialog', { name: 'Exile (shared)' });
  await expect(list.getByLabel('Wise Owl')).toBeVisible();
  await expect(list.getByText('on an Adventure', { exact: true })).toBeVisible();
  await list.getByRole('button', { name: 'Close Exile (shared)' }).click();

  // Play on until the owl is castable from exile: a chip row appears above the hand.
  await playUntil(page, async () => (await exileChip(page).count()) > 0);
  await expect(exileChip(page)).toContainText('Wise Owl');
  await expect(exileChip(page)).toContainText('Cast from exile');
  await exileChip(page).first().click();
  await expect(logText(page)).toContainText('You cast Wise Owl.');
  await expect(mine(page, 'Wise Owl').first()).toBeVisible();
  await expect(exileChip(page)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('a back-face land is played with one click, named by its face, and shows the back mark', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(game(LAND_SEED));
  await playUntil(page, async () => (await handCard(page, 'Ridge Drake').count()) > 0);

  await handCard(page, 'Ridge Drake').first().click();
  // With the mana for the creature too the card asks; take the land item.
  if (await chooser(page).isVisible()) {
    await chooser(page)
      .getByRole('button', { name: /^Play Ridge Pass/ })
      .click();
  }
  await expect(logText(page)).toContainText('You play Ridge Pass.');
  await expect(mine(page, 'Ridge Pass').first()).toBeVisible();
  await expect(mine(page, 'Ridge Pass').first().getByText('back', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('the shock question of a back-face land names the land and keeps the face', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(game(SHOCK_SEED));
  await playUntil(page, async () => (await handCard(page, 'Zeal Charm').count()) > 0);

  await handCard(page, 'Zeal Charm').first().click();
  if (await chooser(page).isVisible()) {
    await chooser(page)
      .getByRole('button', { name: /^Play Shock Pass/ })
      .click();
  }
  const dialog = page.getByRole('dialog', { name: 'Optional ability' });
  await expect(dialog).toBeVisible();
  // The land being played, not the front face that is in the hand.
  await expect(dialog.getByRole('heading')).toHaveText('Shock Pass');
  await expect(dialog).toContainText('Pay 2 life?');
  await expect(dialog).toContainText("If you don't, Shock Pass enters tapped.");
  await dialog.getByRole('button', { name: 'Pay', exact: true }).click();
  await expect(logText(page)).toContainText('You play Shock Pass.');
  await expect(mine(page, 'Shock Pass').first()).toBeVisible();
  await expect(mine(page, 'Shock Pass').first()).not.toHaveClass(/is-tapped/);
  expect(errors).toEqual([]);
});
