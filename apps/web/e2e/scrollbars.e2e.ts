import { expect, type Page, test } from '@playwright/test';
import { scrollProblems } from './harness/scroll';
import { settled } from './harness/settle';

/**
 * Issue 138: two scroll bars appeared on the game screen "out of nowhere". The card box of the
 * info column (the highlighted card) was one pixel wider than its box, so a horizontal bar showed
 * under it, beside the vertical bar of the log. This plays a mid-game on a full board with the
 * stack, targets and the dock in turn, and at every step asserts what a player would see: no bar on
 * the page itself, no horizontal bar anywhere (the battlefield rows scroll sideways with arrows and
 * no bar, `scrollbar-width: none`), and no scrolling area inside another scrolling area. Vertical
 * bars that belong (the log, the stack list, a card taller than its box) are allowed.
 *
 * The headless browser hides bars, so this reads the geometry: an `overflow: auto` or `scroll`
 * element whose content is larger than its box is one that would show a bar.
 */
const primary = (page: Page) => page.locator('[data-dec-primary]');

/** One step of a scripted human: answer a target or a prompt, play a card, attack, or pass. */
async function step(page: Page): Promise<void> {
  const target = page.locator('.dec-targets button').first();
  if ((await target.count()) > 0 && (await target.isEnabled())) await target.click();
  const button = primary(page);
  if ((await button.count()) > 0 && (await button.isEnabled())) {
    const label = (await button.innerText()).trim();
    if (/^(Confirm|Resolve|Done|OK|Keep|Pay)/.test(label)) return button.click();
  }
  const playable = page.locator('.board-hand .is-clickable');
  if ((await playable.count()) > 0) return playable.first().click({ timeout: 5_000 });
  const attack = page.getByRole('button', { name: 'Attack with all' });
  if (await attack.isVisible()) return attack.click();
  if ((await button.count()) > 0 && (await button.isEnabled())) return button.click();
}

for (const size of [
  { width: 1366, height: 768 },
  { width: 1798, height: 1003 },
]) {
  test(`${size.width}x${size.height}: a mid-game shows no stray scroll bar and no double bars`, async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewportSize(size);
    await page.goto('/?autostart=zombies,dragons&seed=3');
    await page.getByRole('button', { name: 'Keep', exact: true }).click();

    const seen = new Set<string>();
    let checks = 0;
    for (let i = 0; i < 160; i += 1) {
      await settled(page);
      const problems = await page.evaluate(scrollProblems);
      expect(problems, `step ${i}`).toEqual([]);
      checks += 1;
      seen.add(
        `${await page.locator('.pnl-stack-item').count()}|${await page.locator('.dec-targets').count()}`,
      );
      // Hover a card of the board: the card box of the info column fills with its text.
      const tile = page.locator('.board-tile[data-object-id]').first();
      if (i % 8 === 0 && (await tile.count()) > 0) {
        await tile.hover({ force: true });
        expect(await page.evaluate(scrollProblems), `hover at step ${i}`).toEqual([]);
      }
      await step(page);
    }
    // The run went through the empty stack and a stack with an item, and through a target question.
    expect(checks).toBeGreaterThan(100);
    expect(seen.size).toBeGreaterThan(1);
    expect(errors).toEqual([]);
  });
}
