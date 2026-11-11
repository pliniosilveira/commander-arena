import { expect, type Locator, type Page, test } from '@playwright/test';
import { settled } from './harness/settle';

/**
 * Lands are grouped on the battlefield as at a table (D-215): equal lands stacked in columns of at
 * most five, similar columns side by side, basic lands first in the order of the colors. The game
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

test('equal lands share a column, the columns follow the order of the colors, and a column holds at most five', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await playLands(page, 6);

  const cols = await readColumns(page);
  // Every land is in exactly one column, and each column holds one kind of land.
  expect(cols.reduce((n, c) => n + c.count, 0)).toBe(await tiles(page).count());
  for (const column of cols) {
    expect(column.count).toBeLessThanOrEqual(5);
    expect(column.ids).toHaveLength(column.count);
  }
  // Basic lands in the order of the colors, then the nonbasic land; equal lands side by side.
  const ranks = cols.map((c) => ORDER.indexOf(c.name));
  expect(ranks.every((r) => r >= 0)).toBe(true);
  expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  // With six lands over six kinds some column is a stack unless every land differs.
  const names = cols.map((c) => c.name);
  const distinct = new Set(names);
  if (distinct.size < 6) expect(cols.some((c) => c.count > 1)).toBe(true);
  // Columns of one kind sit together: a short row makes columns shallower, so a kind may take two.
  const firsts = names.filter((name, i) => i === 0 || names[i - 1] !== name);
  expect(firsts).toHaveLength(distinct.size);
  expect(errors).toEqual([]);
});

test('a stack overlaps like cards on a table: each card shows its edge, the last is in front, and a click taps the very card', async ({
  page,
}) => {
  await playLands(page, 6);
  const stack = columns(page).filter({ has: page.locator('[data-object-id]') });
  const cols = await readColumns(page);
  const index = cols.findIndex((c) => c.count >= 2);
  expect(index, 'the seed makes a stack of equal lands').toBeGreaterThanOrEqual(0);
  const column = stack.nth(index);
  // The front card is the first in the document (a click at the middle of the stack reaches it).
  const front = column.locator('.board-tile').first();
  const back = column.locator('.board-tile').last();

  const backBox = await box(back);
  const frontBox = await box(front);
  // The front card is lower and mostly covers the one behind: its top edge shows.
  expect(frontBox.y).toBeGreaterThan(backBox.y + 8);
  expect(frontBox.y).toBeLessThan(backBox.y + backBox.height - 8);
  const edge = await page.evaluate(
    ([x, y]) =>
      document
        .elementFromPoint(x as number, y as number)
        ?.closest('.board-tile')
        ?.getAttribute('data-object-id'),
    [backBox.x + backBox.width / 2, backBox.y + 3],
  );
  expect(edge).toBe(await back.getAttribute('data-object-id'));

  // The land the player can tap shows as tapped, wherever it sits in the stack.
  const target = await back.getAttribute('data-object-id');
  await back.click({ position: { x: backBox.width / 2, y: 3 } });
  await settled(page);
  const tapped = page.locator(`${mine} .board-tile[data-object-id="${target}"]`);
  await expect(tapped).toHaveClass(/is-tapped/);
  await expect(tapped).toHaveAttribute('aria-label', /tapped/);
  // Tapping did not move it: the column is as it was, in the same order.
  const after = await readColumns(page);
  expect(after[index]?.ids).toEqual(cols[index]?.ids);
  // A second click untaps it, as on a flat row.
  await back.click({ position: { x: backBox.width / 2, y: 3 } });
  await settled(page);
  await expect(tapped).not.toHaveClass(/is-tapped/);
});

test('hovering a land in a stack shows it in the preview panel', async ({ page }) => {
  await playLands(page, 4);
  const cols = await readColumns(page);
  const index = Math.max(
    0,
    cols.findIndex((c) => c.count >= 2),
  );
  const tile = columns(page).nth(index).locator('.board-tile').last();
  await tile.hover({ position: { x: 10, y: 3 } });
  await expect(page.getByLabel('Card preview')).toContainText(cols[index]?.name ?? '');
});
