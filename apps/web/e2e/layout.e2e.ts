import { expect, type Page, test } from '@playwright/test';
import { withSettings } from './harness/settings';
import { settled } from './harness/settle';

/**
 * The game screen: the battlefield takes the whole width. The stack (right) and the card preview
 * (left) float over it, the log and the settings are behind buttons at the bottom left, and the
 * action dock (prompt and the button of the turn) is in the player's own battlefield, at its right
 * edge and bottom.
 */
const game = '/?autostart=white-knights,swamp-forest&seed=3';

async function start(page: Page, width: number, height: number): Promise<void> {
  await page.setViewportSize({ width, height });
  await page.goto(game);
  await page.getByRole('button', { name: 'Keep', exact: true }).click();
  await expect(page.locator('.dec-bar [data-dec-primary]')).toBeVisible({ timeout: 15_000 });
  await settled(page);
}

const box = async (page: Page, selector: string) => {
  const b = await page.locator(selector).first().boundingBox();
  if (b === null) throw new Error(`${selector} has no box`);
  return b;
};

for (const [width, height] of [
  [1280, 720],
  [1366, 768],
  [1920, 1080],
] as const) {
  test(`the battlefield takes the full width and the dock is in the player's field at ${width}x${height}`, async ({
    page,
  }) => {
    await start(page, width, height);
    const board = await box(page, '.board');
    expect(board.x).toBe(0);
    expect(board.width).toBeCloseTo(width, 0);

    // The dock is in your own battlefield, at its right edge, with its bottom at the field's bottom
    // (the stack is at the top of the opponent's): the commander box below it stays clear.
    const dock = await box(page, '.board-dock-slot');
    const field = await box(page, '.board-field-me');
    expect(dock.x + dock.width).toBeLessThanOrEqual(width);
    expect(dock.x + dock.width).toBeGreaterThanOrEqual(width - 12);
    expect(dock.y + dock.height).toBeLessThanOrEqual(field.y + field.height);
    expect(dock.y + dock.height).toBeGreaterThanOrEqual(field.y + field.height - 12);

    // The action bar has no toggles any more.
    for (const name of ['Full Control', 'Manual mana', 'Undo']) {
      await expect(page.locator('.dec-bar').getByRole('button', { name })).toHaveCount(0);
    }

    // The stack floats at the right edge, over the board.
    const stack = await box(page, '[aria-label="Stack"]');
    expect(stack.x + stack.width).toBeCloseTo(width - 8, 0);
    // No page scroll.
    expect(
      await page.evaluate(() => [
        document.documentElement.scrollWidth <= innerWidth,
        document.documentElement.scrollHeight <= innerHeight,
      ]),
    ).toEqual([true, true]);
  });
}

test('the log and the settings open and close from the buttons at the bottom left', async ({
  page,
}) => {
  await start(page, 1366, 768);
  const log = page.getByRole('button', { name: 'Log', exact: true });
  const logButton = await box(page, '.log-toggle');
  expect(logButton.x).toBeLessThanOrEqual(16);
  // The settings button is right below the log's, at the same left edge.
  const settingsButton = await box(page, '.settings-toggle');
  expect(settingsButton.x).toBeCloseTo(logButton.x, 0);
  expect(settingsButton.y).toBeGreaterThanOrEqual(logButton.y + logButton.height);
  expect(settingsButton.y + settingsButton.height).toBeGreaterThanOrEqual(768 - 48);
  await expect(page.getByRole('dialog', { name: 'Game log' })).toHaveCount(0);
  // Closed, the log is still there for a screen reader, out of sight (one pixel).
  expect((await box(page, '#game-log-dialog')).width).toBeLessThanOrEqual(1);
  await log.click();
  await expect(page.locator('.log-dialog [role="log"]')).toBeVisible();
  expect((await box(page, '.log-dialog [role="log"]')).width).toBeGreaterThan(200);
  await log.click();
  await expect(page.getByRole('dialog', { name: 'Game log' })).toHaveCount(0);

  await expect(page.getByRole('dialog', { name: 'Game settings' })).toHaveCount(0);
  await withSettings(page, async () => {
    await expect(page.getByRole('dialog', { name: 'Game settings' })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: 'Full Control', exact: true })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: 'Manual mana payment' })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Undo/ })).toBeVisible();
  });
  await expect(page.getByRole('dialog', { name: 'Game settings' })).toHaveCount(0);
});

test('the card preview floats at the left, above the log, and a tap closes it', async ({
  page,
}) => {
  await start(page, 1366, 768);
  await expect(page.locator('.board-preview')).toHaveCount(0);
  await page.locator('.board-hand .is-clickable').first().hover();
  const preview = await box(page, '.board-preview');
  expect(preview.x).toBeLessThanOrEqual(16);
  expect(Math.abs(preview.y + preview.height / 2 - 768 / 2)).toBeLessThanOrEqual(40);
  // Pinned (right-click), it takes taps; one closes it.
  await page.locator('.board-hand .is-clickable').first().click({ button: 'right' });
  await page.locator('.board-preview').click();
  await expect(page.locator('.board-preview')).toHaveCount(0);
});
