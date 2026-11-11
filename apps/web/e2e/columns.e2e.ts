import { expect, type Page, test } from '@playwright/test';
import { settled } from './harness/settle';

/**
 * The two-column layout (issue 47): the highlighted card and the log in one column, the stack and
 * the controls (the action dock) in the other, the battlefield between them. Before it (D-142) one
 * column held the card, the stack and the log, and the card's box was too short for a card with
 * several abilities. The widths at the sizes below, one column against two:
 * 1280x720 980 and 792, 1366x768 1066 and 878, 1920x1080 1574 and 1344, 2560x1440 2160 and 1840
 * (and 806, 806, 1360 and 2000 before D-142).
 */
const game = '/?autostart=white-knights,swamp-forest&seed=3';
const primary = (page: Page) => page.locator('.dec-bar [data-dec-primary]');

type Size = { width: number; height: number };

async function start(page: Page, size: Size, url = game): Promise<void> {
  await page.setViewportSize(size);
  await page.goto(url);
  await page.getByRole('button', { name: 'Keep', exact: true }).click();
  // Below 1100px the button of the turn is in the closed drawer: it is there, not visible.
  await expect(primary(page)).toBeAttached({ timeout: 15_000 });
  await settled(page);
}

const box = async (page: Page, selector: string) => {
  const b = await page.locator(selector).first().boundingBox();
  if (b === null) throw new Error(`${selector} has no box`);
  return b;
};

/** True when the point at the middle of the element belongs to it, not to an overlay. */
const reachable = (page: Page, selector: string, nth = 0) =>
  page.evaluate(
    ([sel, index]) => {
      const el = document.querySelectorAll(sel as string)[index as number];
      if (el === undefined) return false;
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return hit !== null && el.contains(hit);
    },
    [selector, nth],
  );

const info = '[data-testid="game-side-info"]';
const controls = '[data-testid="game-side-controls"]';

test('the card and the log are on the left, the stack and the controls on the right, the battlefield between', async ({
  page,
}) => {
  await start(page, { width: 1366, height: 768 });
  const left = await box(page, info);
  const right = await box(page, controls);
  const board = await box(page, '.board');
  const preview = await box(page, `${info} [aria-label="Card preview"]`);
  const log = await box(page, `${info} [role="log"]`);
  const stack = await box(page, `${controls} [aria-label="Stack"]`);
  const dock = await box(page, `${controls} .dec-dock`);
  const settings = await box(page, `${controls} [aria-label="Settings"]`);

  // Left to right: info column, battlefield, controls column, edge to edge.
  expect(left.x).toBe(0);
  expect(board.x).toBeGreaterThanOrEqual(left.x + left.width - 1);
  expect(right.x).toBeGreaterThanOrEqual(board.x + board.width - 1);
  expect(right.x + right.width).toBeCloseTo(1366, 0);

  // Left column: the card above the log. Right column: the stack at the top, the dock at the bottom
  // right above the settings (D-146: the buttons do not move with the stack).
  expect(preview.y + preview.height).toBeLessThanOrEqual(log.y);
  expect(log.y + log.height).toBeLessThanOrEqual(768);
  expect(stack.y + stack.height).toBeLessThanOrEqual(dock.y + 0.5);
  expect(stack.y - right.y).toBeLessThanOrEqual(12);
  expect(dock.y + dock.height).toBeLessThanOrEqual(settings.y);
  expect(settings.y - (dock.y + dock.height)).toBeLessThanOrEqual(12);
  for (const [panel, column] of [
    [preview, left],
    [log, left],
    [stack, right],
    [dock, right],
    [settings, right],
  ] as const) {
    expect(panel.x).toBeGreaterThanOrEqual(column.x);
    expect(panel.x + panel.width).toBeLessThanOrEqual(column.x + column.width + 0.5);
  }
  // The card has most of its column: the log is the small part.
  expect(preview.height).toBeGreaterThan(log.height * 3);

  // The battlefield keeps most of the width: it was 1066px with one column, 806 before that.
  expect(board.width).toBeGreaterThanOrEqual(870);
  expect(board.width).toBeLessThanOrEqual(900);
  // No page scroll.
  expect(
    await page.evaluate(() => [
      document.documentElement.scrollWidth <= innerWidth,
      document.documentElement.scrollHeight <= innerHeight,
    ]),
  ).toEqual([true, true]);
});

test('the battlefield stays wide at every size from 1280x720 to 2560x1440', async ({ page }) => {
  const sizes: [Size, number][] = [
    [{ width: 1280, height: 720 }, 780],
    [{ width: 1366, height: 768 }, 870],
    [{ width: 1920, height: 1080 }, 1330],
    [{ width: 2560, height: 1440 }, 1820],
  ];
  for (const [size, least] of sizes) {
    await start(page, size);
    const board = await box(page, '.board');
    expect(board.width, `${size.width}x${size.height}`).toBeGreaterThanOrEqual(least);
    expect(board.width).toBeGreaterThanOrEqual(size.width * 0.6);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
});

/**
 * A card with the longest rules text of the listed decks, pinned in the preview: no scroll bar.
 * Kappa Cannoneer (Improvise, Ward and a 130-character triggered ability on a creature with a P/T
 * line and keywords) is the tallest of the real cards in the opening hands of the seeds below; the
 * others have the longest texts of the two precons (Consumed by Greed, Adaptive Omnitool).
 */
const LONG_TEXT: readonly [deck: string, seed: number, card: string][] = [
  ['artifacts,zombies', 19, 'Kappa Cannoneer'],
  ['artifacts,zombies', 20, 'Adaptive Omnitool'],
  ['zombies,artifacts', 11, 'Consumed by Greed'],
];

for (const size of [
  { width: 1366, height: 768 },
  { width: 1920, height: 1080 },
]) {
  test(`the preview shows a long card whole, with no scroll bar, at ${size.width}x${size.height} with Large text`, async ({
    page,
  }) => {
    for (const [deck, seed, card] of LONG_TEXT) {
      await start(page, size, `/?autostart=${deck}&seed=${seed}`);
      await expect(page.locator('html')).not.toHaveAttribute('data-text-size', 'normal');
      await page.locator('.board-hand .board-hand-card', { hasText: card }).first().click({
        button: 'right',
      });
      const preview = page.locator('.board-preview');
      await expect(preview.locator('.board-card-name')).toContainText(card);
      const heights = await preview.evaluate((el) => {
        const last = el.lastElementChild?.getBoundingClientRect().bottom ?? 0;
        return {
          scroll: el.scrollHeight,
          client: el.clientHeight,
          // Room left under the last thing the preview shows, padding included.
          spare: el.getBoundingClientRect().bottom - last,
        };
      });
      expect(heights.scroll, `${card}: scrollHeight`).toBeLessThanOrEqual(heights.client);
      expect(heights.spare, `${card}: the room under it`).toBeGreaterThan(8);
      // The whole rules text is inside the card frame, not cut off by it.
      const cut = await preview.evaluate((el) => {
        const frame = el.querySelector('.board-card-full');
        const text = el.querySelector('.board-card-text');
        if (frame === null || text === null) return null;
        return text.scrollHeight - text.clientHeight;
      });
      expect(cut, `${card}: text cut by the frame`).toBeLessThanOrEqual(0);
    }
  });
}

test('hovering a card does not move the log or the stack, and nothing covers the clickable things at 1280x720 with Large text', async ({
  page,
}) => {
  await start(page, { width: 1280, height: 720 });
  await expect(page.locator('html')).not.toHaveAttribute('data-text-size', 'normal');
  const stackBefore = await box(page, `${controls} [aria-label="Stack"]`);
  const logBefore = await box(page, `${info} [role="log"]`);
  const previewBefore = await box(page, `${info} [aria-label="Card preview"]`);

  // The preview has the height the column leaves it, whatever it shows: it never pushes the log
  // around, or the log would move under the pointer while it hovers a card name.
  await page.locator('.board-hand .is-clickable').first().hover();
  await expect(page.locator('.board-preview [data-preview-id]')).toHaveCount(1);
  expect(await box(page, `${controls} [aria-label="Stack"]`)).toEqual(stackBefore);
  expect(await box(page, `${info} [role="log"]`)).toEqual(logBefore);
  expect(await box(page, `${info} [aria-label="Card preview"]`)).toEqual(previewBefore);

  await page.mouse.move(5, 5);
  const cmdrs = await page.locator('.board-cmdr').count();
  expect(await reachable(page, '.board-cmdr', cmdrs - 1)).toBe(true);
  expect(await reachable(page, '.board-hand .is-clickable')).toBe(true);
  expect(await reachable(page, '.dec-bar [data-dec-primary]')).toBe(true);
  for (const toggle of ['Undo', 'Full Control', 'Manual mana']) {
    const hit = await page.evaluate((name) => {
      const el = [...document.querySelectorAll('.dec-bar button')].find((b) =>
        (b.textContent ?? '').startsWith(name),
      );
      if (el === undefined) return false;
      const r = el.getBoundingClientRect();
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return top !== null && el.contains(top);
    }, toggle);
    expect(hit, toggle).toBe(true);
  }
  await page.getByRole('button', { name: 'Full Control' }).click();
  await settled(page);
  expect(await reachable(page, '.board-cmdr', cmdrs - 1)).toBe(true);
  expect(await reachable(page, '.dec-bar [data-dec-primary]')).toBe(true);

  // The dock is in its own column: it overlaps neither the board nor the hand nor the strips.
  const dock = await box(page, '.dec-dock');
  const board = await box(page, '.board');
  expect(dock.x).toBeGreaterThanOrEqual(board.x + board.width - 1);
  for (const part of ['.board-hand', '.board-strip-me', '.board-strip-opp']) {
    const b = await box(page, part);
    expect(dock.x, part).toBeGreaterThanOrEqual(b.x + b.width - 1);
  }
});

test('Settings can swap the columns, and the choice is remembered', async ({ page }) => {
  await start(page, { width: 1366, height: 768 });
  await page.getByRole('button', { name: /Settings/ }).click();
  const swap = page.getByRole('group', { name: 'Stack and controls side' });
  await expect(swap.getByRole('button', { name: 'Right', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await swap.getByRole('button', { name: 'Left', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-side-panel', 'left');
  // The stack and the controls on the left, the card and the log on the right.
  const right = await box(page, info);
  const left = await box(page, controls);
  const board = await box(page, '.board');
  expect(left.x).toBe(0);
  expect(board.x).toBeGreaterThanOrEqual(left.x + left.width - 1);
  expect(right.x).toBeGreaterThanOrEqual(board.x + board.width - 1);
  expect(right.x + right.width).toBeCloseTo(1366, 0);
  expect(board.width).toBeGreaterThanOrEqual(870);
  const cmdrs = await page.locator('.board-cmdr').count();
  expect(await reachable(page, '.board-cmdr', cmdrs - 1)).toBe(true);
  expect(await reachable(page, '.dec-bar [data-dec-primary]')).toBe(true);
  // The dock is still at the foot of the column, above the settings, under the stack.
  const stack = await box(page, `${controls} [aria-label="Stack"]`);
  const dock = await box(page, `${controls} .dec-dock`);
  const settings = await box(page, `${controls} [aria-label="Settings"]`);
  expect(stack.y + stack.height).toBeLessThanOrEqual(dock.y + 0.5);
  expect(settings.y - (dock.y + dock.height)).toBeLessThanOrEqual(12);

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-side-panel', 'left');
  await page.getByRole('button', { name: 'Keep', exact: true }).click();
  await expect(primary(page)).toBeVisible({ timeout: 15_000 });
  expect((await box(page, controls)).x).toBe(0);
  await page.getByRole('button', { name: /Settings/ }).click();
  await page
    .getByRole('group', { name: 'Stack and controls side' })
    .getByRole('button', { name: 'Right', exact: true })
    .click();
  const back = await box(page, controls);
  expect(back.x + back.width).toBeCloseTo(1366, 0);
});

test('below 1100px wide the two columns are one drawer over the board, with the controls in it', async ({
  page,
}) => {
  await start(page, { width: 1000, height: 720 });
  const toggle = page.getByRole('button', { name: /Stack, controls, card and log/ });
  await expect(toggle).toBeVisible();
  await expect(page.locator(controls)).toBeHidden();
  await expect(page.locator(info)).toBeHidden();
  const board = await box(page, '.board');
  expect(board.width).toBeGreaterThanOrEqual(1000 - 2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  await toggle.click();
  await expect(page.locator(controls)).toBeVisible();
  await expect(page.locator(info)).toBeVisible();
  const right = await box(page, controls);
  const left = await box(page, info);
  expect(right.x + right.width).toBeCloseTo(1000, 0);
  expect(left.x + left.width).toBeLessThanOrEqual(right.x + 1);
  await expect(page.locator(`${info} [role="log"]`)).toBeVisible();
  // The button of the turn is in the drawer, at the foot of the controls column.
  expect(await reachable(page, '.dec-bar [data-dec-primary]')).toBe(true);
  await page.getByRole('button', { name: 'Hide panels' }).click();
  await expect(page.locator(controls)).toBeHidden();
});
