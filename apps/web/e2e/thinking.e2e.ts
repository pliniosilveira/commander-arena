import { expect, type Locator, type Page, test } from '@playwright/test';
import { settled } from './harness/settle';

/**
 * "Opponent is thinking" (D-174). `&aidelay=<ms>` (game/slow-opponent.ts) holds back every answer of
 * the Worker in which the AI acted, as a long AI decision would. The status shows once a request has
 * lasted about 400 ms, goes the instant the answer arrives, and the dock does not move, grow or jump
 * between the two states.
 */
const delayMs = 3000;
const game = `/?autostart=white-knights,swamp-forest&seed=1&freeMulligan=0&aidelay=${delayMs}`;
const primary = (page: Page) => page.locator('.dec-bar [data-dec-primary]');
const status = (page: Page) => page.locator('.dec-thinking');
const dock = (page: Page) => page.locator('.dec-dock');

async function box(target: Locator) {
  const b = await target.boundingBox();
  if (b === null) throw new Error('the element has no box');
  return b;
}

test('a long AI answer shows "Opponent is thinking" without moving the dock, and it goes with the answer', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(game);
  await page.getByRole('button', { name: 'Keep', exact: true }).click();
  // Full Control: the player holds priority at every step, so the autopilot does not pass and the
  // bar keeps its prompt and buttons while the request is out.
  await page.getByRole('button', { name: 'Full Control' }).click();
  await settled(page);

  await expect(status(page)).toHaveAttribute('data-thinking', 'false');
  await expect(status(page)).toHaveText('');
  const quiet = await box(dock(page));

  // The pass is answered after the AI's own pass, which the seam holds back for 3 s.
  await primary(page).click();
  await expect(page.locator('.app')).toHaveAttribute('data-settled', 'false');
  // At once the request is young: nothing shows yet (the delay is 400 ms).
  await expect(status(page)).toHaveAttribute('data-thinking', 'false');
  const early = await box(dock(page));

  // Within a second it shows, in a polite live region.
  await expect(status(page)).toHaveAttribute('data-thinking', 'true', { timeout: 1500 });
  await expect(status(page)).toContainText('Opponent is thinking');
  await expect(status(page)).toHaveAttribute('role', 'status');
  await expect(status(page)).toHaveAttribute('aria-live', 'polite');
  await expect(page.locator('.app')).toHaveAttribute('data-settled', 'false');
  const thinking = await box(dock(page));

  // The dock is where it was, as big as it was.
  expect(thinking).toEqual(early);
  expect(early).toEqual(quiet);

  // The answer arrives: the status goes at once and stays gone.
  await settled(page);
  await expect(status(page)).toHaveAttribute('data-thinking', 'false');
  await expect(status(page)).toHaveText('');
  expect(errors).toEqual([]);
});

test('a game without &aidelay never shows the status for a quick move', async ({ page }) => {
  await page.goto('/?autostart=white-knights,swamp-forest&seed=1&freeMulligan=0');
  await page.getByRole('button', { name: 'Keep', exact: true }).click();
  await page.getByRole('button', { name: 'Full Control' }).click();
  await settled(page);
  const seen: string[] = [];
  await page.exposeFunction('noteThinking', (v: string) => seen.push(v));
  await page.evaluate(() => {
    new MutationObserver(() => {
      const el = document.querySelector('.dec-thinking');
      if (el?.getAttribute('data-thinking') === 'true') {
        (window as unknown as { noteThinking: (v: string) => void }).noteThinking('on');
      }
    }).observe(document.body, { subtree: true, attributes: true, childList: true });
  });
  for (let i = 0; i < 6; i += 1) {
    await settled(page);
    if ((await primary(page).count()) > 0 && (await primary(page).isEnabled())) {
      await primary(page).click();
    }
  }
  await settled(page);
  expect(seen).toEqual([]);
});
