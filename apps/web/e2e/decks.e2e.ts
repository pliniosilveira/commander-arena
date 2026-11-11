import { expect, type Page, test } from '@playwright/test';
import { installedPrecons } from './harness/precons';
import { fakeScryfall } from './harness/synthetic-scryfall';

/**
 * The decks page and the choice of the opponent's deck (issues 93 and 108, D-215): precons listed
 * beside the saved decks, edited and reset locally, and saved decks picked for either seat.
 * Scryfall is the SYNTHETIC fake of harness/synthetic-scryfall.ts; the precons are the real ones that ship
 * with the app, whose own cards need no network.
 */

const PRECON = 'zombies';
const PRECON_NAME = 'Ghoulcaller Gisa Zombies';
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
  await page.getByRole('button', { name: 'Your decks' }).click();
  await expect(page.getByRole('heading', { name: 'Built-in decks' })).toBeVisible();
}

const row = (page: Page) => page.locator(`[data-precon="${PRECON}"]`);

/** Opens the precon in the editor and replaces its Sol Ring line with `line`; returns once imported. */
async function editPrecon(page: Page, line: string): Promise<void> {
  await row(page).getByRole('button', { name: /^Edit/ }).click();
  await expect(page.getByTestId('editing-precon')).toBeVisible();
  const list = page.getByLabel(/^Decklist/);
  await expect(list).toContainText('1x Sol Ring');
  await expect(page.getByTestId('coverage-headline')).toBeVisible({ timeout: 30_000 });
  const text = await list.inputValue();
  await list.fill(text.replace('1x Sol Ring', line));
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(page.getByTestId('coverage-headline')).toBeVisible({ timeout: 30_000 });
}

async function saveMine(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Save my version' }).click();
  await expect(page.getByText(/Saved your version of/)).toBeVisible();
}

async function saveDeck(page: Page, name: string, text: string): Promise<void> {
  await page.getByRole('button', { name: 'Import a deck' }).click();
  await page.getByLabel('Deck name').fill(name);
  await page.getByLabel(/^Decklist/).fill(text);
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(page.getByTestId('coverage-headline')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Save deck' }).click();
  await expect(page.getByText(`Saved "${name}".`)).toBeVisible();
  await page.getByRole('button', { name: 'Back to menu' }).click();
}

test.describe('precons on the decks page', () => {
  test.skip(!installed.includes(PRECON), 'the Zombies precon snapshot is not installed');

  test('a precon is listed as built in, edited, kept after a reload, and reset to default', async ({
    page,
  }) => {
    await fakeScryfall(page);
    await openDecks(page);
    await expect(page.getByTestId('precon-decks').locator('li')).toHaveCount(installed.length);
    await expect(row(page).getByTestId('precon-tag')).toHaveText('Built in');
    await expect(row(page).getByRole('button', { name: /^Reset to default/ })).toHaveCount(0);

    // Replace a card with one that is not in the precon: it is looked up and judged.
    await editPrecon(page, '1x SYNTHETIC Bear 01');
    await expect(page.getByLabel('Deck name')).toHaveValue(PRECON_NAME);
    await expect(page.getByLabel('Deck name')).toHaveJSProperty('readOnly', true);
    const table = page.getByRole('table');
    await expect(table.getByRole('row', { name: /SYNTHETIC Bear 01/ })).toContainText('Supported');
    await expect(table.getByRole('row', { name: /Sol Ring/ })).toHaveCount(0);
    await saveMine(page);

    await page.getByRole('button', { name: 'Your decks', exact: true }).click();
    await expect(row(page).getByTestId('precon-tag')).toHaveText('Edited by you');

    // The edit stays in this browser across a reload; the menu says which precon is edited.
    await page.reload();
    await page.getByRole('button', { name: 'Your decks' }).click();
    await expect(row(page).getByTestId('precon-tag')).toHaveText('Edited by you');
    await page.getByRole('button', { name: 'Reset to default Ghoulcaller Gisa Zombies' }).click();
    // A second click confirms: the edits are lost for good.
    await page.getByRole('button', { name: 'Keep my edits of Ghoulcaller Gisa Zombies' }).click();
    await expect(row(page).getByTestId('precon-tag')).toHaveText('Edited by you');
    await page.getByRole('button', { name: 'Reset to default Ghoulcaller Gisa Zombies' }).click();
    await page.getByRole('button', { name: 'Yes, reset Ghoulcaller Gisa Zombies' }).click();
    await expect(row(page).getByTestId('precon-tag')).toHaveText('Built in');

    // The shipped list was never changed.
    await row(page).getByRole('button', { name: /^Edit/ }).click();
    await expect(page.getByLabel(/^Decklist/)).toContainText('1x Sol Ring');
    await expect(page.getByLabel(/^Decklist/)).not.toContainText('SYNTHETIC Bear 01');
  });

  test('an edited precon is marked in the menu', async ({ page }) => {
    await fakeScryfall(page);
    await openDecks(page);
    await editPrecon(page, '1x SYNTHETIC Bear 01');
    await saveMine(page);
    await page.getByRole('button', { name: 'Back to menu' }).click();
    await expect(page.locator('.scr-deck-tag')).toHaveCount(2);
  });

  test('a precon with a card the engine cannot run is refused with the reason, and reset makes it playable', async ({
    page,
  }) => {
    test.skip(installed.length < 2, 'needs a second precon for the other seat');
    await fakeScryfall(page);
    await openDecks(page);
    // "SYNTHETIC Bear 04" has text the parser does not read: unsupported.
    await editPrecon(page, '1x SYNTHETIC Bear 04');
    await expect(
      page.getByRole('table').getByRole('row', { name: /SYNTHETIC Bear 04/ }),
    ).toContainText('Unsupported');
    await saveMine(page);
    await page.getByRole('button', { name: 'Back to menu' }).click();

    const other = installed.find((id) => id !== PRECON);
    const opponent = page.locator('fieldset', { hasText: "Opponent's deck" });
    await opponent.locator(`input[value="${PRECON}"]`).check();
    await page
      .locator('fieldset', { hasText: 'Your deck' })
      .locator(`input[value="${other}"]`)
      .check();
    await page.getByRole('button', { name: 'Start game' }).click();
    const alert = page.getByRole('alert');
    await expect(alert).toContainText(`"${PRECON_NAME}" cannot be played`);
    await expect(alert).toContainText('abilities the engine cannot run yet');

    // Resetting from the decks page brings the shipped, playable deck back.
    await page.getByRole('button', { name: 'Your decks' }).click();
    await page.getByRole('button', { name: 'Reset to default Ghoulcaller Gisa Zombies' }).click();
    await page.getByRole('button', { name: 'Yes, reset Ghoulcaller Gisa Zombies' }).click();
    await page.getByRole('button', { name: 'Back to menu' }).click();
    await page.getByRole('button', { name: 'Start game' }).click();
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
    await expect(page.getByText('Saved in this browser').first()).toBeVisible();
    const opponent = page.locator('fieldset', { hasText: "Opponent's deck" });
    await opponent.getByRole('radio', { name: /SYNTHETIC Saved/ }).check();
    await page.getByLabel('Seed').fill('7');
    await page.getByRole('button', { name: 'Start game' }).click();
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
    const opponent = page.locator('fieldset', { hasText: "Opponent's deck" });
    await opponent.getByRole('radio', { name: /SYNTHETIC Unsupported/ }).check();
    await page.getByRole('button', { name: 'Start game' }).click();
    const alert = page.getByRole('alert');
    await expect(alert).toContainText('"SYNTHETIC Unsupported" cannot be played');
    await expect(alert).toContainText('abilities the engine cannot run yet');
  });
});
