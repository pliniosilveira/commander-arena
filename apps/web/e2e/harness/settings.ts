import { expect, type Locator, type Page } from '@playwright/test';

/** Settings are in a dialog behind the button at the bottom left: open it, act, close it again. */
export async function withSettings<T>(page: Page, act: () => Promise<T>): Promise<T> {
  const toggle = page.locator('.settings-toggle');
  // A card the pointer was last over shows its preview panel, which can cover the dialog's buttons.
  await page.mouse.move(0, 0);
  await toggle.click();
  const result = await act();
  await toggle.click();
  return result;
}

const undoButton = (page: Page) => page.getByRole('button', { name: /^Undo/ });

/** Whether the Undo button of the Settings dialog can be pressed now. */
export const undoEnabled = (page: Page): Promise<boolean> =>
  withSettings(page, () => undoButton(page).isEnabled());

/** Presses the Undo button of the Settings dialog. */
export async function clickUndo(page: Page): Promise<void> {
  // The card of the stack's top is previewed over the left edge (z-index above the Settings dialog) and
  // takes the pointer; a tap on it closes the preview, as a player would do to reach the dialog.
  const preview = page.locator('[data-stack-preview="true"] .board-preview-card');
  if (await preview.isVisible()) await preview.click();
  await withSettings(page, () => undoButton(page).click());
}

/** Flips the Full Control or the Manual mana payment switch of the Settings dialog. */
export async function toggleSetting(
  page: Page,
  name: 'Full Control' | 'Manual mana payment',
): Promise<void> {
  await withSettings(page, () => page.getByRole('checkbox', { name, exact: true }).click());
}

/** Opens the log dialog, shows every line (detail lines too) and closes the dialog again. */
export async function showAllLogLines(page: Page): Promise<void> {
  const toggle = page.locator('.log-toggle:not(.settings-toggle):not(.report-toggle)');
  await toggle.click();
  await page
    .getByRole('group', { name: 'Log detail' })
    .getByRole('button', { name: 'All' })
    .click();
  await toggle.click();
}

/**
 * Drags a card onto the stack the way a player does: the stack is out of sight until a drag that
 * can drop there starts, so move a little first, wait for it to show, then move onto it and drop.
 */
export async function dragToStack(page: Page, source: Locator): Promise<void> {
  const from = await source.boundingBox();
  if (from === null) throw new Error('the dragged card has no box');
  const x = from.x + from.width / 2;
  const y = from.y + Math.min(from.height / 2, 40);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 12, y - 12, { steps: 4 });
  const stack = page.locator('.turn-panel [data-drop="stack"]');
  await expect.poll(async () => (await stack.boundingBox())?.width ?? 0).toBeGreaterThan(50);
  const to = await stack.boundingBox();
  if (to === null) throw new Error('the stack has no box');
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 8 });
  await page.mouse.up();
}
