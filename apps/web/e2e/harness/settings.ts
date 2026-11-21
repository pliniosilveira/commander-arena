import type { Page } from '@playwright/test';

/** Settings are in a dialog behind the button at the bottom left: open it, act, close it again. */
export async function withSettings<T>(page: Page, act: () => Promise<T>): Promise<T> {
  const toggle = page.locator('.settings-toggle');
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
export const clickUndo = (page: Page): Promise<void> =>
  withSettings(page, () => undoButton(page).click());

/** Flips the Full Control or the Manual mana payment switch of the Settings dialog. */
export async function toggleSetting(
  page: Page,
  name: 'Full Control' | 'Manual mana payment',
): Promise<void> {
  await withSettings(page, () => page.getByRole('checkbox', { name, exact: true }).click());
}
