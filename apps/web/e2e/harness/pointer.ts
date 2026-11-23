import type { Page } from '@playwright/test';

/**
 * Moves the pointer off the hand. A card of the hand lifts and grows while the pointer is over it
 * (`.board-hand-card:hover`), and the lifted card covers the part of the field and the zone buttons
 * above the hand. The pointer stays where the last click left it, so a test that clicked a hand
 * card and then clicks something the lifted card covers waits for a click that cannot land (the
 * card art "intercepts pointer events"). A real player moves the pointer first; this does the same.
 *
 * It also scrolls the hand back to rest. The fan is a scroll box (`overflow-y: hidden`) whose cards
 * rest below its bottom edge, and Playwright's "scroll into view" before a click on a hand card moves
 * it up by that drop, so every card of the hand stays lifted over the zone buttons after the click,
 * with the pointer far away. A mouse click never does this.
 */
export async function leaveHand(page: Page): Promise<void> {
  await page.mouse.move(0, 0);
  await page.evaluate(() => {
    const fan = document.querySelector('.board-hand-fan');
    if (fan !== null) fan.scrollTop = 0;
  });
}
