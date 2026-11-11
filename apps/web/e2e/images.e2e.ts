import { expect, test } from '@playwright/test';

/**
 * Card images come from Scryfall's name lookup. The tests stand in for Scryfall with intercepted
 * requests (a generated SVG), so they check our loading and fallback behaviour, not Scryfall's.
 */
const SVG = (label: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="488" height="680" viewBox="0 0 488 680"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3b6fb6"/><stop offset="1" stop-color="#c9a24b"/></linearGradient></defs><rect width="488" height="680" fill="url(#g)"/><text x="244" y="340" font-size="48" text-anchor="middle" fill="white">${label}</text></svg>`;

test('card images replace the drawn art when they load', async ({ page }) => {
  const requested: string[] = [];
  await page.route('https://api.scryfall.com/cards/named**', (route) => {
    const url = new URL(route.request().url());
    requested.push(url.searchParams.get('exact') ?? '');
    return route.fulfill({
      contentType: 'image/svg+xml',
      body: SVG(url.searchParams.get('version') ?? ''),
    });
  });
  await page.goto('/?autostart=white-knights,swamp-forest&seed=7');
  await page.getByRole('button', { name: 'Keep', exact: true }).click();
  await expect(page.locator('[data-dec-primary]')).toBeVisible({ timeout: 15_000 });

  // Hand cards show the art crop once it has loaded.
  const art = page.locator('.board-hand .board-card-art-img.is-loaded').first();
  await expect(art).toBeVisible();
  expect(requested.length).toBeGreaterThan(0);
  expect(requested.every((n) => !n.startsWith('SYNTHETIC'))).toBe(true);

  // Hovering a card shows the full card image in the preview panel.
  await page.locator('.board-hand [data-object-id]').first().hover();
  await expect(page.locator('.preview-panel .board-card-image.is-loaded')).toBeVisible();
});

test('a failed image leaves the drawn card', async ({ page }) => {
  await page.route('https://api.scryfall.com/**', (route) => route.abort());
  await page.goto('/?autostart=white-knights,swamp-forest&seed=7');
  await page.getByRole('button', { name: 'Keep', exact: true }).click();
  await expect(page.locator('[data-dec-primary]')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.board-hand .board-card-name').first()).toBeVisible();
  await expect(page.locator('.board-card-art-img.is-loaded')).toHaveCount(0);
  await page.locator('.board-hand [data-object-id]').first().hover();
  await expect(page.locator('.preview-panel .board-card-name')).toBeVisible();
});

test('the full card image is never cropped, even when the drawn rules text would need a taller frame', async ({
  page,
}) => {
  await page.route('https://api.scryfall.com/cards/named**', (route) =>
    route.fulfill({ contentType: 'image/svg+xml', body: SVG('normal') }),
  );
  await page.goto('/?autostart=white-knights,swamp-forest&seed=7');
  await page.getByRole('button', { name: 'Keep', exact: true }).click();
  await expect(page.locator('[data-dec-primary]')).toBeVisible({ timeout: 15_000 });
  await page.locator('.board-hand [data-object-id]').first().hover();
  await expect(page.locator('.preview-panel .board-card-image.is-loaded')).toBeVisible();

  // A long rules text under the picture (the drawn frame grows to hold it): make the text of the box big,
  // as a card with four paragraphs would be at its width.
  await page
    .locator('.board-preview')
    .evaluate((box) => box.style.setProperty('--text-scale', '2.6'));
  const frame = page.locator('.preview-panel .board-card-full');
  await expect(async () => {
    const box = await frame.boundingBox();
    expect(box).not.toBeNull();
    // A card is 488 x 680 (art.tsx asks Scryfall for the "normal" image): the frame that shows it is that shape,
    // or `object-fit: cover` cuts the sides off a borderless card ("he Balrog of Moria", "rample, haste").
    const ratio = (box?.width ?? 0) / (box?.height ?? 1);
    expect(Math.abs(ratio - 488 / 680)).toBeLessThan(0.006);
  }).toPass({ timeout: 5000 });
});
