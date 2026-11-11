import type { Page } from '@playwright/test';

/**
 * Waits until the game on screen is settled: the page has no request to the Worker and no
 * autopilot pass in flight (`data-settled` on the app root, from `busy` in store.ts), and what is
 * on screen is the view the game is waiting on.
 *
 * Why the tests need it: the engine and the AI are seeded, so a game is a function of the actions
 * the player sends, but a script that clicks "whatever is clickable" every 60 ms sends different
 * actions depending on timing. A click made while the autopilot is passing seizes it and is queued
 * until it stops (store.ts `act`), so under load the same click can pass a main phase that the
 * script meant to play a land in, and the seed reaches a different game. Acting only on a settled
 * page makes every click a response to the state the game is really waiting on, so a seed always
 * reaches the same situation however slow the machine is.
 *
 * It also waits for two animation frames with the revision unchanged, so that React has committed
 * the last store change before a locator is read.
 */
export async function settled(page: Page, timeout = 30_000): Promise<void> {
  const root = page.locator('.app');
  const deadline = Date.now() + timeout;
  for (;;) {
    await page.locator('.app[data-settled="true"]').waitFor({ timeout });
    const before = await root.getAttribute('data-revision');
    await page.evaluate(
      () =>
        new Promise<void>((done) =>
          requestAnimationFrame(() => requestAnimationFrame(() => done())),
        ),
    );
    const after = await root.getAttribute('data-revision');
    if (before === after && (await root.getAttribute('data-settled')) === 'true') return;
    if (Date.now() > deadline) throw new Error('the page never settled');
  }
}
