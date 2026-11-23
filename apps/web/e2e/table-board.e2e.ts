import { expect, type Page, test } from '@playwright/test';
import { build } from 'vite';

/**
 * The board for three or more players (harness/table-entry.tsx), drawn from a view built with the
 * engine's scenario DSL: the opponents share the top row, you and your hand sit below, and no
 * opponent's cell spills over its neighbour.
 */
let script = '';
let css = '';

test.beforeAll(async () => {
  const output = await build({
    configFile: false,
    logLevel: 'silent',
    define: { 'process.env.NODE_ENV': '"production"' },
    build: {
      write: false,
      minify: false,
      cssCodeSplit: false,
      lib: {
        entry: new URL('./harness/table-entry.tsx', import.meta.url).pathname,
        name: 'TableEntry',
        formats: ['iife'],
      },
    },
  });
  for (const result of Array.isArray(output) ? output : [output]) {
    if (!('output' in result)) continue;
    for (const item of result.output) {
      if (item.type === 'chunk' && item.isEntry) script = item.code;
      else if (item.type === 'asset' && item.fileName.endsWith('.css')) css += String(item.source);
    }
  }
  if (script === '') throw new Error('the table board bundle was not built');
});

async function show(
  page: Page,
  opponents: number,
  width = 1440,
  height = 900,
  conceded: readonly number[] = [],
): Promise<void> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width, height });
  await page.goto('about:blank');
  await page.setContent('<!doctype html><html><head></head><body></body></html>');
  if (css !== '') await page.addStyleTag({ content: css });
  await page.addScriptTag({
    content: `${script}\nTableEntry.mount(${opponents}, ${JSON.stringify(conceded)});`,
  });
  expect(errors).toEqual([]);
  await expect(page.getByTestId('game-table-board')).toBeVisible();
}

for (const opponents of [2, 3]) {
  test(`${opponents} opponents share the top row side by side, above you`, async ({ page }) => {
    await show(page, opponents);
    const opp = page.locator('.table-opp');
    await expect(opp).toHaveCount(opponents);
    const boxes = await opp.evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, b: r.bottom };
      }),
    );
    for (let i = 1; i < boxes.length; i++) {
      const prev = boxes[i - 1];
      const box = boxes[i];
      if (prev === undefined || box === undefined) throw new Error('missing box');
      expect(box.y).toBeCloseTo(prev.y, 0);
      expect(box.x).toBeGreaterThanOrEqual(prev.x + prev.w - 1);
    }
    const me = await page.locator('.table-me').boundingBox();
    const top = Math.max(...boxes.map((b) => b.b));
    expect(me?.y ?? 0).toBeGreaterThanOrEqual(top - 1);
    await expect(page.getByText('Opponent 1', { exact: true }).first()).toBeVisible();
    await page.screenshot({ path: `test-results/table-${opponents}-opponents.png` });
  });
}

for (const [width, height] of [
  [1280, 720],
  [1024, 768],
] as const) {
  test(`3 opponents at ${width} wide keep the page from scrolling sideways`, async ({ page }) => {
    await show(page, 3, width, height);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    await page.screenshot({ path: `test-results/table-3-opponents-${width}.png` });
  });
}

test('the flow cell holds the turn box and the decision dock, at the bottom right', async ({
  page,
}) => {
  await show(page, 3);
  const flow = page.getByTestId('table-flow');
  await expect(flow.locator('.pnl-tracker')).toBeVisible();
  await expect(flow.locator('.game-dock-slot .dec-bar')).toBeVisible();
  const box = await flow.boundingBox();
  const me = await page.locator('.table-me').boundingBox();
  if (box === null || me === null) throw new Error('no boxes');
  expect(box.x).toBeGreaterThanOrEqual(me.x + me.width - 1);
  expect(box.y).toBeGreaterThanOrEqual(me.y - 1);
  await page.screenshot({ path: 'test-results/table-flow.png' });
});

test('the table board has no scroll buttons, a smaller hand and a narrower flow cell', async ({
  page,
}) => {
  await show(page, 3);
  // The scroll buttons are not drawn, though the rows still hold their arrows' place in the DOM.
  for (const button of await page.locator('.board-scroll').all()) await expect(button).toBeHidden();
  // A card of the hand is 85 percent of the 1v1 board's: 122 px at the default text size (1.2).
  const card = await page.locator('.board-hand-card').first().boundingBox();
  expect(card?.width ?? 0).toBeCloseTo(0.85 * 122 * 1.2, -1);
  // The flow cell is about 8 of 30 columns of the board (it was 2 of 6).
  const board = await page.locator('.table-board').boundingBox();
  const flow = await page.getByTestId('table-flow').boundingBox();
  expect((flow?.width ?? 0) / (board?.width ?? 1)).toBeCloseTo(8 / 30, 1);
  await page.screenshot({ path: 'test-results/table-polish.png' });
});

test('an opponent who lost is taken off the board and the others share the room', async ({
  page,
}) => {
  await show(page, 3, 1440, 900, [2]);
  // Opponent 2 lost: two cells are left, side by side, and the numbering of the others stays.
  await expect(page.locator('.table-opp')).toHaveCount(2);
  await expect(page.getByText('Opponent 2', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Opponent 1', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Opponent 3', { exact: true }).first()).toBeVisible();
  const [a, b] = await page
    .locator('.table-opp')
    .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().width));
  const board = await page.locator('.table-board').boundingBox();
  expect((a ?? 0) / (board?.width ?? 1)).toBeCloseTo(0.5, 1);
  expect(b ?? 0).toBeCloseTo(a ?? 0, 0);
  await page.screenshot({ path: 'test-results/table-eliminated.png' });
});

test('the last opponent left takes the whole top row', async ({ page }) => {
  await show(page, 3, 1440, 900, [1, 3]);
  await expect(page.locator('.table-opp')).toHaveCount(1);
  const opp = await page.locator('.table-opp').boundingBox();
  const board = await page.locator('.table-board').boundingBox();
  expect((opp?.width ?? 0) / (board?.width ?? 1)).toBeCloseTo(1, 1);
});

test('the strip keeps only the commander chip; its info button opens the commander popup', async ({
  page,
}) => {
  await show(page, 3);
  const strip = page.locator('.table-opp').first().locator('.board-strip');
  // The chip: the name of the commander and nothing of the old command box.
  const chip = strip.locator('[data-commander-chip]');
  await expect(chip).toHaveCount(1);
  await expect(chip).toContainText('Serra Angel');
  // The info button sits where the cost was: no cost circles on the chip.
  await expect(chip.locator('.cmdr-info')).toBeVisible();
  await expect(chip.getByRole('img', { name: /mana/ })).toHaveCount(0);
  await expect(strip.getByText('Tax', { exact: false })).toHaveCount(0);
  await expect(strip.getByText('Cmdr dmg')).toHaveCount(0);
  await expect(strip.getByText('Command', { exact: true })).toHaveCount(0);

  const popup = page.getByRole('dialog', { name: 'Opponent 1 commander' });
  // The chip itself is the cast: clicking it (here it cannot be cast) does not open the popup.
  await chip.locator('.cmdr-chip-main').click();
  await expect(popup).toHaveCount(0);
  await chip.locator('.cmdr-info').click();
  await expect(popup).toBeVisible();
  // Two sections side by side with a vertical line between them: the commander, and the damage taken.
  const sections = popup.locator('.cmdr-section');
  await expect(sections).toHaveCount(2);
  await expect(sections.nth(0).getByRole('heading', { name: 'Commander' })).toBeVisible();
  await expect(
    sections.nth(1).getByRole('heading', { name: 'Commander Damage Taken' }),
  ).toBeVisible();
  const [left, right] = await sections.evaluateAll((els) =>
    els.map((el) => ({
      x: el.getBoundingClientRect().x,
      border: getComputedStyle(el).borderLeftWidth,
    })),
  );
  expect(right?.x ?? 0).toBeGreaterThan(left?.x ?? 0);
  expect(right?.border).toBe('1px');
  expect(left?.border).toBe('0px');
  // The card, large, and its tax, in the first section; the others in the second.
  await expect(sections.nth(0).locator('.cmdr-card')).toHaveCount(1);
  await expect(sections.nth(1).locator('.cmdr-list li')).toHaveCount(3);
  await expect(popup.getByText('Commander tax +0')).toBeVisible();
  // Every other player, in seat order, with their commander.
  const rows = popup.locator('.cmdr-list li');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText('You');
  await expect(rows.nth(0)).toContainText('Isamaru, Hound of Konda');
  await expect(rows.nth(1)).toContainText('Opponent 2');
  await expect(rows.nth(1)).toContainText('Giant Spider');
  await expect(rows.nth(2)).toContainText('Opponent 3');
  await expect(rows.nth(2)).toContainText('Grizzly Bears');
  await expect(popup.getByText('Total from all commanders: 0')).toBeVisible();
  await page.screenshot({ path: 'test-results/table-commander.png' });
  // Esc closes it.
  await page.keyboard.press('Escape');
  await expect(popup).toHaveCount(0);
});

test('your own commander popup shows its tax and a Cast button when it can be cast', async ({
  page,
}) => {
  await show(page, 3);
  await page.locator('.table-me .cmdr-info').click();
  const popup = page.getByRole('dialog', { name: 'You commander' });
  await expect(popup).toBeVisible();
  await expect(popup.getByRole('heading', { name: 'Your Commander' })).toBeVisible();
  await expect(popup.getByText('Commander tax +4')).toBeVisible();
  // Cast Isamaru: {W}; the scenario gives no white mana, so only the Close button is offered.
  await expect(popup.getByRole('button', { name: 'Close' })).toBeVisible();
});
