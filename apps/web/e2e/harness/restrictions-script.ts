import type { Page } from '@playwright/test';
import { settled } from './settle';

/**
 * The scripted player of the restrictions e2e tests (e2e/restrictions.e2e.ts): plays whatever is
 * playable in its hand, declines to attack and to block, discards the first cards, until a
 * situation is on screen. Every click answers the settled page (settle.ts).
 */
export const primary = (page: Page) => page.locator('.dec-bar [data-dec-primary]');

export async function playUntil(page: Page, ready: () => Promise<boolean>): Promise<void> {
  const keep = page.getByRole('button', { name: 'Keep', exact: true });
  const discard = page.getByRole('dialog', { name: /^Discard/ });
  for (let step = 0; step < 800; step += 1) {
    await settled(page);
    if (await ready()) return;
    if (await keep.isVisible()) {
      await keep.click();
    } else if (await discard.isVisible()) {
      await discard.locator('.dec-card-button').first().click();
      await discard.getByRole('button', { name: 'Confirm' }).click();
    } else if ((await page.locator('.board-hand .is-clickable').count()) > 0) {
      await page.locator('.board-hand .is-clickable').first().click();
    } else if ((await primary(page).count()) > 0 && (await primary(page).isEnabled())) {
      await primary(page).click();
    }
  }
  throw new Error('the game never reached the situation');
}
