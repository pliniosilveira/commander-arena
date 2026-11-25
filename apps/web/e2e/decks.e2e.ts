import { expect, type Locator, type Page, test } from '@playwright/test';
import {
  chooseDeck,
  chooseDeckById,
  OPPONENT_DIALOG,
  openStartFlow,
  select,
  startFromVersus,
  versusScreen,
} from './harness/menu';
import { installedPrecons } from './harness/precons';
import { fakeScryfall } from './harness/synthetic-scryfall';

/**
 * The decks page and the choice of the opponent's deck (issues 93 and 108, D-215): precons listed
 * beside the saved decks, switched on and off, and saved decks picked for either seat.
 * Scryfall is the SYNTHETIC fake of harness/synthetic-scryfall.ts; the precons are the real ones that ship
 * with the app, whose own cards need no network.
 */

const PRECON = 'zombies';
const installed = installedPrecons();

/** A legal 100-card list of supported SYNTHETIC cards (as in import.e2e.ts). */
function supportedList(): string {
  const lines = ['Commander', '1 SYNTHETIC Commander', '', 'Deck', '69 Plains'];
  for (let n = 1; n <= 39; n += 1) {
    if (n % 4 !== 0) lines.push(`1 SYNTHETIC Bear ${String(n).padStart(2, '0')}`);
  }
  return `${lines.join('\n')}\n`;
}

/** The same shape with nine bears the parser does not read (every fourth one): not playable. */
function unsupportedList(): string {
  const lines = ['Commander', '1 SYNTHETIC Commander', '', 'Deck', '60 Plains'];
  for (let n = 1; n <= 39; n += 1) lines.push(`1 SYNTHETIC Bear ${String(n).padStart(2, '0')}`);
  return `${lines.join('\n')}\n`;
}

async function openDecks(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'My decks' }).click();
  await expect(page.getByRole('heading', { name: 'Built-in decks' })).toBeVisible();
}

const row = (page: Page) => page.locator(`[data-precon="${PRECON}"]`);

async function saveDeck(page: Page, name: string, text: string): Promise<void> {
  await page.getByRole('button', { name: 'My decks' }).click();
  await page.getByRole('button', { name: 'Paste a list' }).click();
  await page.getByLabel('Deck name').fill(name);
  await page.getByLabel(/^Decklist/).fill(text);
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(page.getByTestId('coverage-headline')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(`Imported and saved "${name}".`)).toBeVisible();
  await page.getByRole('button', { name: 'Back to menu' }).click();
}

test.describe('precons on the decks page', () => {
  test.skip(!installed.includes(PRECON), 'the Zombies precon snapshot is not installed');

  const toggle = (page: Page) => row(page).getByTestId('precon-toggle');
  /** The ids of the precons the dialog lists (the Precons tab), in the order shown. */
  const listedIds = async (dialog: Locator): Promise<string[]> => {
    await dialog.getByRole('tab', { name: 'Precons' }).click();
    return dialog
      .locator('button.scr-deck')
      .evaluateAll((buttons) => buttons.map((b) => b.getAttribute('data-deck-id') ?? ''));
  };

  test('a precon is listed as built in, and the Available switch hides it from the deck lists, kept after a reload', async ({
    page,
  }) => {
    await fakeScryfall(page);
    await openDecks(page);
    await expect(page.getByTestId('precon-decks').locator('li')).toHaveCount(installed.length);
    await expect(toggle(page)).toBeChecked();
    // Built in decks cannot be edited: no Edit, no "edited" mark.
    await expect(row(page).getByRole('button', { name: /^Edit/ })).toHaveCount(0);
    await expect(row(page).getByTestId('precon-tag')).toHaveCount(0);

    await toggle(page).uncheck();
    await page.getByRole('button', { name: 'Back to menu' }).click();
    const mine = await openStartFlow(page);
    const ids = await listedIds(mine);
    expect(ids).not.toContain(PRECON);
    expect(ids).toHaveLength(installed.length - 1);

    // The switch is kept in this browser across a reload.
    await page.reload();
    await page.getByRole('button', { name: 'My decks' }).click();
    await expect(toggle(page)).not.toBeChecked();
    await toggle(page).check();
    await page.getByRole('button', { name: 'Back to menu' }).click();
    expect(await listedIds(await openStartFlow(page))).toContain(PRECON);
  });

  test('a switched-off precon is offered in neither dialog of the start-game flow', async ({
    page,
  }) => {
    test.skip(installed.length < 2, 'needs a second precon to choose for your seat');
    await fakeScryfall(page);
    await openDecks(page);
    await toggle(page).uncheck();
    await page.getByRole('button', { name: 'Back to menu' }).click();
    const mine = await openStartFlow(page);
    await select(mine);
    // Choosing your deck opens the opponent's dialog, which leaves the precon out too.
    const theirs = page.getByRole('dialog', { name: OPPONENT_DIALOG });
    await expect(theirs).toBeVisible();
    const ids = await listedIds(theirs);
    expect(ids).not.toContain(PRECON);
    // Only the switched-off precon is missing: the deck chosen for your seat is still listed.
    expect(ids).toHaveLength(installed.length - 1);
  });

  test('a precon switched off and on again is playable', async ({ page }) => {
    test.skip(installed.length < 2, 'needs a second precon for the other seat');
    await fakeScryfall(page);
    await openDecks(page);
    await toggle(page).uncheck();
    await toggle(page).check();
    await page.getByRole('button', { name: 'Back to menu' }).click();
    const other = String(installed.find((id) => id !== PRECON));
    const mine = await openStartFlow(page);
    await chooseDeckById(mine, 'Precons', other);
    const theirs = page.getByRole('dialog', { name: OPPONENT_DIALOG });
    await chooseDeckById(theirs, 'Precons', PRECON);
    await expect(versusScreen(page)).toBeVisible({ timeout: 30_000 });
    await startFromVersus(page);
    await expect(page.getByText('Your opening hand')).toBeVisible({ timeout: 30_000 });
  });
});

test.describe('a saved deck as the opponent', () => {
  test('the menu offers a saved deck for the opponent and the game starts with it', async ({
    page,
  }) => {
    await fakeScryfall(page);
    await page.goto('/');
    await saveDeck(page, 'SYNTHETIC Saved', supportedList());
    await page.getByLabel('Seed').fill('7');
    const mine = await openStartFlow(page);
    await select(mine);
    const theirs = page.getByRole('dialog', { name: OPPONENT_DIALOG });
    await chooseDeck(theirs, 'My Decks', /SYNTHETIC Saved/);
    await startFromVersus(page);
    await expect(page.getByText('Your opening hand')).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Keep', exact: true }).click();
    // The opponent's commander is the saved deck's, in the opponent's command zone.
    await expect(page.getByText('SYNTHETIC Commander').first()).toBeVisible({ timeout: 15_000 });
  });

  test('a saved deck with unsupported cards is refused for the opponent with the reason', async ({
    page,
  }) => {
    await fakeScryfall(page);
    await page.goto('/');
    await saveDeck(page, 'SYNTHETIC Unsupported', unsupportedList());
    const mine = await openStartFlow(page);
    await select(mine);
    const theirs = page.getByRole('dialog', { name: OPPONENT_DIALOG });
    await chooseDeck(theirs, 'My Decks', /SYNTHETIC Unsupported/);
    const alert = page.getByRole('alert');
    await expect(alert).toContainText('"SYNTHETIC Unsupported" cannot be played');
    await expect(alert).toContainText('abilities the engine cannot run yet');
  });
});
