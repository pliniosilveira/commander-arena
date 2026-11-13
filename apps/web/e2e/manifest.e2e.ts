import { expect, type Page, test } from '@playwright/test';

/**
 * Manifest (D-315): a face-down permanent is drawn with the picture of Scryfall's Manifest token, fetched at run time by set code and collector number (`cards/tfrf/4`), and is a
 * plain face-down card when the picture can't be had. The tests stand in for Scryfall with intercepted requests, so they check our lookup and fallback, not Scryfall's. The deck
 * is the hidden SYNTHETIC `synthetic-manifest` for both seats; the games are played with the primary button until a face-down permanent is on the table.
 */
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="488" height="680" viewBox="0 0 488 680"><rect width="488" height="680" fill="#5a3b7a"/><text x="244" y="340" font-size="48" text-anchor="middle" fill="white">Manifest</text></svg>`;

const ANSWER = {
  object: 'card',
  name: 'Manifest',
  layout: 'token',
  image_uris: {
    small: 'https://cards.scryfall.io/small/front/m/m/manifest.jpg',
    normal: 'https://cards.scryfall.io/normal/front/m/m/manifest.jpg',
    art_crop: 'https://cards.scryfall.io/art_crop/front/m/m/manifest.jpg',
  },
};

const primary = (page: Page) => page.locator('[data-dec-primary]');

/** Presses the primary button until a face-down permanent is on the table (or the guard runs out). */
async function untilFaceDown(page: Page): Promise<void> {
  await page.goto('/?autostart=synthetic-manifest,synthetic-manifest&seed=5');
  await expect(page.getByText('Your opening hand')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Keep', exact: true }).click();
  await expect(primary(page)).toBeVisible({ timeout: 15_000 });
  for (let guard = 0; guard < 160; guard++) {
    if ((await page.locator('.board-tile [data-face-down-flag]').count()) > 0) return;
    const button = primary(page);
    await button.waitFor({ timeout: 20_000 });
    if (await button.isDisabled()) {
      const cards = page.getByRole('dialog').locator('[aria-pressed]');
      for (let i = 0; i < 4 && (await button.isDisabled()); i++) await cards.nth(i).click();
    }
    await button.click();
    await page.waitForTimeout(120);
  }
  throw new Error('no face-down permanent reached the table');
}

test('a face-down permanent is drawn with the Manifest token picture', async ({ page }) => {
  const asked: string[] = [];
  await page.route('https://api.scryfall.com/cards/tfrf/4', (route) => {
    asked.push(route.request().url());
    return route.fulfill({
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify(ANSWER),
    });
  });
  await page.route('https://cards.scryfall.io/**', (route) =>
    route.fulfill({ contentType: 'image/svg+xml', body: SVG }),
  );
  await page.route('https://api.scryfall.com/cards/named**', (route) => route.abort());
  await untilFaceDown(page);
  const tile = page.locator('.board-tile', { has: page.locator('[data-face-down-flag]') }).first();
  await expect(tile).toContainText('Face-down creature');
  await expect(tile.locator('img[data-manifest-art].is-loaded')).toBeVisible();
  expect(asked.length).toBeGreaterThan(0);
  // The name of a card is nowhere on a face-down tile.
  await expect(tile).not.toContainText('SYNTHETIC');
});

test('without the picture a face-down permanent is a plain card back with its label', async ({
  page,
}) => {
  await page.route('https://api.scryfall.com/**', (route) => route.abort());
  await untilFaceDown(page);
  const tile = page.locator('.board-tile', { has: page.locator('[data-face-down-flag]') }).first();
  await expect(tile).toContainText('Face-down creature');
  await expect(tile.locator('img[data-manifest-art]')).toHaveCount(0);
  await expect(page.locator('.dec-toast')).toHaveCount(0);
});
