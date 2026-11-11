import { expect, type Page, test } from '@playwright/test';
import { settled } from './harness/settle';

/**
 * Stack legibility (issues 82, 105, 107). The autopilot used to pass for the player while the
 * opponent's spell resolved unless it was aimed at them or they held an instant, so a board wipe
 * went by unseen. Now it waits at every opponent spell: the card is in the preview panel (the
 * highlight box) with no hover, the stack names it, and the primary button says Resolve. The game is
 * a real-card test deck (Knights and Angels) against the casual opponent (Rats and Spiders), whose
 * creature spells are enough to show the stop; the seed is fixed.
 */
const primary = (page: Page) => page.locator('[data-dec-primary]');
const stack = (page: Page) => page.getByRole('region', { name: 'Stack' });
const preview = (page: Page) => page.getByRole('complementary', { name: 'Card preview' });

/** Presses on, a click at a time on a settled page, until the opponent's spell waits on the stack. */
async function untilOpponentSpell(page: Page): Promise<void> {
  const keep = page.getByRole('button', { name: 'Keep', exact: true });
  for (let step = 0; step < 200; step += 1) {
    await settled(page);
    if ((await stack(page).locator('.pnl-theirs').count()) > 0) return;
    if (await keep.isVisible()) {
      await keep.click();
    } else if ((await page.getByRole('dialog').count()) > 0 && (await primary(page).isDisabled())) {
      // A discard to hand size: pick the first card.
      await page.getByRole('dialog').locator('[aria-pressed]').first().click();
    } else if ((await primary(page).count()) > 0 && (await primary(page).isEnabled())) {
      await primary(page).click();
    }
  }
  throw new Error('the opponent never cast a spell the player was asked about');
}

test("the opponent's spell waits for the player, with its card in the preview, and its resolution is logged", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?autostart=white-knights,swamp-forest&seed=7');
  await untilOpponentSpell(page);

  const item = stack(page).locator('.pnl-theirs').first();
  const name = (await item.locator('.pnl-stack-name').textContent()) ?? '';
  const id = await item.getAttribute('data-object-id');
  expect(name).not.toBe('');
  // The game waits: nothing passes by itself while the page is settled, and the button says so.
  await expect(primary(page)).toHaveText('Resolve');
  await page.waitForTimeout(400);
  await expect(item).toBeVisible();
  // Issue 82: the preview shows that card with no hover, and says it is the top of the stack.
  await expect(preview(page).locator('[data-preview-stack]')).toBeVisible();
  await expect(preview(page).locator(`[data-preview-id="${id}"]`)).toContainText(name);

  await primary(page).click();
  await settled(page);
  // Issue 105: it resolves when the player passes, and the log says so (detail lines included).
  await page
    .getByRole('group', { name: 'Log detail' })
    .getByRole('button', { name: 'All' })
    .click();
  await expect(page.getByRole('log')).toContainText(`${name} resolves.`);
  expect(errors).toEqual([]);
});

test('Settings has a switch for it, on by default', async ({ page }) => {
  await page.goto('/?autostart=white-knights,swamp-forest&seed=7');
  await settled(page);
  await page.getByRole('button', { name: /Settings/ }).click();
  const box = page.getByLabel('Stop for opponent spells');
  await expect(box).toBeChecked();
  await box.uncheck();
  await expect(box).not.toBeChecked();
});
