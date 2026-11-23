import { expect, type Locator, type Page, test } from '@playwright/test';
import { settled } from './harness/settle';

/**
 * Lands are grouped on the battlefield as at a table (D-215): a single line of lands, equal basic lands
 * overlapped sideways, basic lands first in the order of the colors. The game
 * uses the hidden SYNTHETIC deck `synthetic-lands` (game/precons.ts): basic lands of every type
 * and a nonbasic land, so the opening hand and the lands played over the first turns are mixed.
 */
const GAME = '/?autostart=synthetic-lands,white-knights&seed=5';
const ORDER = ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest', 'SYNTHETIC Dual Land'];

const mine = '.board-field[data-field-seat="0"]';
const columns = (page: Page) => page.locator(`${mine} .board-row-land .board-land-col`);
const tiles = (page: Page) => page.locator(`${mine} .board-row-land .board-tile[data-object-id]`);

/** Plays a land each turn (and passes) until the player has `count` lands on the battlefield. */
async function playLands(page: Page, count: number): Promise<void> {
  await page.goto(GAME);
  await page.getByRole('button', { name: 'Keep', exact: true }).click();
  for (let step = 0; step < 300 && (await tiles(page).count()) < count; step += 1) {
    await settled(page);
    const playable = page.locator('.board-hand .is-clickable');
    if ((await playable.count()) > 0) {
      await playable.first().click();
      continue;
    }
    const button = page.locator('[data-dec-primary]');
    if (await button.isVisible()) await button.click();
    await page.waitForTimeout(60);
  }
  await settled(page);
  expect(await tiles(page).count()).toBeGreaterThanOrEqual(count);
}

interface Column {
  readonly name: string;
  readonly count: number;
  readonly ids: readonly string[];
}

/** The columns of the player's land row, left to right. */
async function readColumns(page: Page): Promise<Column[]> {
  return columns(page).evaluateAll((cols) =>
    cols.map((col) => ({
      name: col.getAttribute('data-land-group') ?? '',
      count: Number(col.getAttribute('data-land-count')),
      ids: [...col.querySelectorAll('.board-tile[data-object-id]')].map(
        (tile) => tile.getAttribute('data-object-id') ?? '',
      ),
    })),
  );
}

const box = async (locator: Locator) => {
  const b = await locator.boundingBox();
  if (b === null) throw new Error('no box');
  return b;
};

test('the lands sit in one line, equal basic lands overlap, and the kinds follow the order of the colors', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await playLands(page, 6);

  const cols = await readColumns(page);
  expect(cols.reduce((n, c) => n + c.count, 0)).toBe(await tiles(page).count());
  const ranks = cols.map((c) => ORDER.indexOf(c.name));
  expect(ranks.every((r) => r >= 0)).toBe(true);
  expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  // One line: every tile shares (about) the same top.
  const tops = await tiles(page).evaluateAll((els) =>
    els.map((el) => el.getBoundingClientRect().top),
  );
  expect(Math.max(...tops) - Math.min(...tops)).toBeLessThan(4);
  expect(errors).toEqual([]);
});

test('a cluster overlaps sideways: the first card is in front, each next one shows a strip, and a click taps the very card', async ({
  page,
}) => {
  await playLands(page, 6);
  const clusters = columns(page);
  const cols = await readColumns(page);
  const index = cols.findIndex((c) => c.count >= 2);
  expect(index, 'the seed makes a cluster of equal lands').toBeGreaterThanOrEqual(0);
  const column = clusters.nth(index);
  const front = column.locator('.board-tile').first();
  const back = column.locator('.board-tile').last();

  const backBox = await box(back);
  const frontBox = await box(front);
  // The back card is to the right and mostly covered: its right edge shows.
  expect(backBox.x).toBeGreaterThan(frontBox.x + 8);
  expect(backBox.x).toBeLessThan(frontBox.x + frontBox.width - 8);
  const px = backBox.x + backBox.width - 3;
  const py = backBox.y + backBox.height / 2;
  const edge = await page.evaluate(
    ([x, y]) =>
      document
        .elementFromPoint(x as number, y as number)
        ?.closest('.board-tile')
        ?.getAttribute('data-object-id'),
    [px, py],
  );
  expect(edge).toBe(await back.getAttribute('data-object-id'));

  const target = await back.getAttribute('data-object-id');
  await back.click({ position: { x: backBox.width - 3, y: backBox.height / 2 } });
  await settled(page);
  const tapped = page.locator(`${mine} .board-tile[data-object-id="${target}"]`);
  await expect(tapped).toHaveClass(/is-tapped/);
  await expect(tapped).toHaveAttribute('aria-label', /tapped/);
  const after = await readColumns(page);
  expect(after[index]?.ids).toEqual(cols[index]?.ids);
  await back.click({ position: { x: backBox.width - 3, y: backBox.height / 2 } });
  await settled(page);
  await expect(tapped).not.toHaveClass(/is-tapped/);
});

test('hovering a land in a cluster shows it in the preview panel', async ({ page }) => {
  await playLands(page, 4);
  const cols = await readColumns(page);
  const index = Math.max(
    0,
    cols.findIndex((c) => c.count >= 2),
  );
  const tile = columns(page).nth(index).locator('.board-tile').last();
  const b = await box(tile);
  await tile.hover({ position: { x: b.width - 3, y: b.height / 2 } });
  await expect(page.getByLabel('Card preview')).toContainText(cols[index]?.name ?? '');
});
