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
  art_crop: `https://cards.scryfall.io/art_crop/front/${id}.jpg`,
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
  // The listed printings of the saved deck, by set and number: once the deck names `bbb` 2, that is the one drawn in the grid.
  await page.route('https://api.scryfall.com/cards/collection', async (route) => {
    const body = route.request().postDataJSON() as {
      identifiers: { set?: string; collector_number?: string }[];
    };
    const wanted = body.identifiers.find((i) => i.set === 'bbb' && i.collector_number === '2');
    if (wanted === undefined) return route.fallback();
    return route.fulfill({
      status: 200,
      headers: CORS,
      contentType: 'application/json',
      body: JSON.stringify({
        object: 'list',
        data: [{ ...PRINTS[1], name: 'SYNTHETIC Commander' }],
      }),
    });
  });
  await images(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'My decks' }).click();
  await page.getByRole('button', { name: 'Paste a list' }).click();
  await page.getByLabel('Deck name').fill('SYNTHETIC Mine');
  await page.getByLabel(/^Decklist/).fill(supportedList());
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(page.getByTestId('coverage-headline')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Imported and saved "SYNTHETIC Mine".')).toBeVisible();
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
  // The button sits under the picture, not after the list, and saving closes the dialog.
  const use = dialog.getByRole('button', { name: 'Use in this deck' });
  const pictureBox = await dialog.locator('img.deck-card-large').boundingBox();
  const useBox = await use.boundingBox();
  expect(useBox?.y ?? 0).toBeGreaterThan((pictureBox?.y ?? 0) + (pictureBox?.height ?? 0) - 1);
  await use.click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.deck-card img').first()).toHaveAttribute(
    'src',
    /normal\/front\/p2\.jpg/,
  );

  // The choice is written into the saved deck: it is still there after a reload.
  await page.reload();
  await page.getByRole('button', { name: 'My decks' }).click();
  const again = await open();
  await expect(again.getByRole('radio').nth(1)).toBeChecked();
  // And the grid of the deck draws the card in it.
  await again.getByRole('button', { name: 'Close' }).click();
  await expect(page.locator('.deck-card img').first()).toHaveAttribute(
    'src',
    /normal\/front\/p2\.jpg/,
  );
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
    const row = page.locator(`[data-precon="${PRECON}"]`);
    // The cell of the deck list draws the commander in that printing too.
    await expect(row.locator('img').first()).toHaveAttribute('src', /art_crop\/front\/listed\.jpg/);
    await row.getByRole('button', { name: /^View/ }).click();
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

test.describe('the special-frame commander art option of the import screen', () => {
  async function importWith(page: Page, on: boolean): Promise<string> {
    await fakeScryfall(page);
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
    const option = page.getByLabel(/special-frame art for my commander/);
    // Off until the player turns it on.
    await expect(option).not.toBeChecked();
    if (on) await option.check();
    await page.getByLabel('Deck name').fill('SYNTHETIC Nice');
    await page.getByLabel(/^Decklist/).fill(supportedList());
    await page.getByRole('button', { name: 'Import', exact: true }).click();
    await expect(page.getByText('Imported and saved "SYNTHETIC Nice".')).toBeVisible({
      timeout: 30_000,
    });
    return page.getByLabel(/^Decklist/).inputValue();
  }

  test('on: the commander line gets the newest special printing, and the choice is remembered', async ({
    page,
  }) => {
    const text = await importWith(page, true);
    // PRINTS[0] has a plain frame; PRINTS[1] is borderless: the one written on the line.
    expect(text).toContain('1 SYNTHETIC Commander (bbb) 2 ^Chosen printing^');
    await page.reload();
    await page.getByRole('button', { name: 'My decks' }).click();
    await page.getByRole('button', { name: 'Paste a list' }).click();
    await expect(page.getByLabel(/special-frame art for my commander/)).toBeChecked();
  });

  test('off: the list is imported as it was', async ({ page }) => {
    const text = await importWith(page, false);
    expect(text).toContain('1 SYNTHETIC Commander\n');
    expect(text).not.toContain('Chosen printing');
  });
});
