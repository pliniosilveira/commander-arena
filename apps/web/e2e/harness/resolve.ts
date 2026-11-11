import { expect, type Page } from '@playwright/test';

/**
 * Waits for the player's own main phase, where a hand card can be played, pressing Resolve while the
 * opponent's spells wait on the stack: the game stops at each of them so the player can read it
 * (issue 105), and no hand card is playable until it is gone.
 */
export async function untilHandPlayable(page: Page, timeout = 15_000): Promise<void> {
  await expect(async () => {
    if ((await page.locator('.board-hand .is-clickable').count()) === 0) {
      const button = page.locator('[data-dec-primary]');
      if ((await button.isVisible()) && (await button.innerText()).trim() === 'Resolve') {
        await button.click();
      }
    }
    expect(await page.locator('.board-hand .is-clickable').count()).toBeGreaterThan(0);
  }).toPass({ timeout });
}
