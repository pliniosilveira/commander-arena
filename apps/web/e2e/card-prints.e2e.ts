import { expect, type Page, test } from '@playwright/test';
import { installedPrecons } from './harness/precons';
import { fakeScryfall } from './harness/synthetic-scryfall';

/**
 * The card dialog of the deck screen: the picture on the left, the printings of the card on the right, one selectable at a time,
 * for a player's own deck; a built-in deck only shows the picture. The Scryfall answers are SYNTHETIC (invented ids, one-pixel
 * images); the precon is a real one that ships with the app.
 */
const PRECON = 'zombies';
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);
const image = (id: string) => ({
  small: `https://cards.scryfall.io/small/front/${id}.jpg`,
  normal: `https://cards.scryfall.io/normal/front/${id}.jpg`,
  large: `https://cards.scryfall.io/large/front/${id}.jpg`,
});
const CORS = { 'access-control-allow-origin': '*' };

const PRINTS = [
  {
    id: 'p1',
    set: 'aaa',
    set_name: 'Synthetic Set One',
    collector_number: '1',
    released_at: '2026-01-01',
    rarity: 'rare',
    image_uris: image('p1'),
  },
  {
    id: 'p2',
    set: 'bbb',
    set_name: 'Synthetic Set Two',
    collector_number: '2',
    released_at: '2025-01-01',
    rarity: 'mythic',
    border_color: 'borderless',
    image_uris: image('p2'),
  },
];

async function images(page: Page): Promise<void> {
  await page.route('https://cards.scryfall.io/**', (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: PNG }),
  );
}

/** A legal 100-card list of supported SYNTHETIC cards. */
function supportedList(): string {
  const lines = ['Commander', '1 SYNTHETIC Commander', '', 'Deck', '69 Plains'];
  for (let n = 1; n <= 39; n += 1) {
    if (n % 4 !== 0) lines.push(`1 SYNTHETIC Bear ${String(n).padStart(2, '0')}`);
  }
  return `${lines.join('\n')}\n`;
}

test('a player’s own deck lists the printings of a card, and a chosen one is saved in the deck', async ({
  page,
}) => {
  await fakeScryfall(page);
  // The search for the printings of a card (the fake answers the rest).
  await page.route(/api\.scryfall\.com\/cards\/search/, (route) =>
    route.fulfill({
      status: 200,
      headers: CORS,
      contentType: 'application/json',
      body: JSON.stringify({ object: 'list', data: PRINTS }),
    }),
  );
  await images(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'My decks' }).click();
  await page.getByRole('button', { name: 'Paste a list' }).click();
  await page.getByLabel('Deck name').fill('SYNTHETIC Mine');
  await page.getByLabel(/^Decklist/).fill(supportedList());
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(page.getByTestId('coverage-headline')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Save deck' }).click();
  await expect(page.getByText('Saved "SYNTHETIC Mine".')).toBeVisible();
  await page.getByRole('button', { name: 'Back to menu' }).click();
  await page.getByRole('button', { name: 'My decks' }).click();
  const open = async () => {
    await page.getByRole('button', { name: /^View.*SYNTHETIC Mine/ }).click();
    await page.locator('.deck-card').first().click();
    return page.getByRole('dialog');
  };

  const dialog = await open();
  const radios = dialog.getByRole('radio');
  await expect(radios).toHaveCount(2);
  await dialog.getByText('Synthetic Set Two').click();
  await expect(radios.nth(1)).toBeChecked();
  await expect(dialog.locator('img.deck-card-large')).toHaveAttribute(
    'src',
    /large\/front\/p2\.jpg/,
  );
  await expect(dialog.getByText('Borderless')).toBeVisible();
  await dialog.getByRole('button', { name: 'Use in this deck' }).click();
  await expect(dialog.getByRole('status')).toContainText('Saved');
  await expect(dialog.getByRole('button', { name: 'Use in this deck' })).toBeDisabled();

  // The choice is written into the saved deck: it is still there after a reload.
  await page.reload();
  await page.getByRole('button', { name: 'My decks' }).click();
  const again = await open();
  await expect(again.getByRole('radio').nth(1)).toBeChecked();
});

test.describe('a built-in deck', () => {
  test.skip(!installedPrecons().includes(PRECON), 'the Zombies precon snapshot is not installed');

  test('draws a card in the printing its list names and does not offer to change it', async ({
    page,
  }) => {
    // The Zombies list names the commander as `Ghoulcaller Gisa (fdc) 6`; one collection request asks for every listed printing.
    await page.route('https://api.scryfall.com/**', (route) =>
      route.fulfill({
        status: 200,
        headers: CORS,
        contentType: 'application/json',
        body: JSON.stringify({
          object: 'list',
          data: [
            {
              id: 'listed',
              name: 'Ghoulcaller Gisa',
              set: 'fdc',
              collector_number: '6',
              image_uris: image('listed'),
            },
          ],
        }),
      }),
    );
    await images(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'My decks' }).click();
    await page.locator(`[data-precon="${PRECON}"]`).getByRole('button', { name: /^View/ }).click();
    await expect(page.locator('.deck-card img').first()).toHaveAttribute(
      'src',
      /normal\/front\/listed\.jpg/,
    );
    await page.locator('.deck-card').first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.locator('img.deck-card-large')).toBeVisible();
    await expect(dialog.getByRole('radio')).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: 'Use in this deck' })).toHaveCount(0);
  });
});
