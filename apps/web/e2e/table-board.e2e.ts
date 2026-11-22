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

async function show(page: Page, opponents: number, width = 1440, height = 900): Promise<void> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width, height });
  await page.goto('about:blank');
  await page.setContent('<!doctype html><html><head></head><body></body></html>');
  if (css !== '') await page.addStyleTag({ content: css });
  await page.addScriptTag({ content: `${script}\nTableEntry.mount(${opponents});` });
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
