import { expect, test } from '@playwright/test';
import { installedPrecons } from './harness/precons';

/**
 * The card dialog of the deck screen: the picture on the left, the printings of the card on the right, one selectable at a time.
 * The Scryfall search answer is SYNTHETIC (invented ids, one-pixel images); the precon is a real one that ships with the app.
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

test.describe('card printings', () => {
  test.skip(!installedPrecons().includes(PRECON), 'the Zombies precon snapshot is not installed');

  test('the dialog shows the picture and a list of printings that changes it', async ({ page }) => {
    await page.route('https://api.scryfall.com/**', (route) =>
      route.fulfill({
        status: 200,
        headers: CORS,
        contentType: 'application/json',
        body: JSON.stringify({
          object: 'list',
          data: [
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
          ],
        }),
      }),
    );
    await page.route('https://cards.scryfall.io/**', (route) =>
      route.fulfill({ status: 200, contentType: 'image/png', body: PNG }),
    );
    await page.goto('/');
    await page.getByRole('button', { name: 'My decks' }).click();
    await page.locator(`[data-precon="${PRECON}"]`).getByRole('button', { name: /^View/ }).click();
    await expect(page.getByTestId('deck-screen')).toBeVisible();
    await page.locator('.deck-card').first().click();

    const dialog = page.getByRole('dialog');
    const radios = dialog.getByRole('radio');
    await expect(radios).toHaveCount(2);
    await dialog.getByText('Synthetic Set Two').click();
    await expect(radios.nth(1)).toBeChecked();
    await expect(dialog.locator('img.deck-card-large')).toHaveAttribute(
      'src',
      /large\/front\/p2\.jpg/,
    );
    await expect(dialog.getByText('Borderless')).toBeVisible();
    await page.screenshot({ path: process.env.SHOT ?? 'card-prints.png' });
    await dialog.getByText('Synthetic Set One').click();
    await expect(dialog.locator('img.deck-card-large')).toHaveAttribute(
      'src',
      /large\/front\/p1\.jpg/,
    );

    // Using a printing writes it into the deck: the built-in deck becomes the player's edited one, and a reload keeps the choice.
    await dialog.getByRole('button', { name: 'Use in this deck' }).click();
    await expect(dialog.getByRole('status')).toContainText('Saved');
    await expect(dialog.getByRole('button', { name: 'Use in this deck' })).toBeDisabled();
    await page.reload();
    await page.getByRole('button', { name: 'My decks' }).click();
    const row = page.locator(`[data-precon="${PRECON}"]`);
    await expect(row.getByTestId('precon-tag')).toHaveText('Edited by you');
    await row.getByRole('button', { name: /^View/ }).click();
    await page.locator('.deck-card').first().click();
    await expect(page.getByRole('dialog').getByRole('radio').first()).toBeChecked();
  });

  test('the grid of a built-in deck draws a card in the printing its list names', async ({
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
    await page.route('https://cards.scryfall.io/**', (route) =>
      route.fulfill({ status: 200, contentType: 'image/png', body: PNG }),
    );
    await page.goto('/');
    await page.getByRole('button', { name: 'My decks' }).click();
    await page.locator(`[data-precon="${PRECON}"]`).getByRole('button', { name: /^View/ }).click();
    await expect(page.locator('.deck-card img').first()).toHaveAttribute(
      'src',
      /normal\/front\/listed\.jpg/,
    );
  });
});
