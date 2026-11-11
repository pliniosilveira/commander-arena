import { expect, type Page, test } from '@playwright/test';
import { handCard, mine } from './harness/locators';
import { settled } from './harness/settle';

/**
 * "Create a Food token or a Treasure token" (D-175, CR 608.2d): the question that asks which of the instructions an effect offers as it
 * resolves. The listed test decks hold no such card, so the game uses the hidden SYNTHETIC deck `synthetic-choose-one` (game/precons.ts): invented
 * cards, not real ones. A scripted player plays lands and keeps the spell in its hand until two lands are out; the engine and the AI are seeded, so a
 * given seed reaches it at the same point every time, and the loop acts only on a settled page.
 */
const game = (seed: number) => `/?autostart=synthetic-choose-one,swamp-forest&seed=${seed}`;

const primary = (page: Page) => page.locator('.dec-bar [data-dec-primary]');

/** Plays lands (and ends turns) until the spell can be cast with two lands out; false when `steps` actions did not reach it. */
async function playUntilCastable(page: Page, spell: string, steps = 500): Promise<boolean> {
  const keepButton = page.getByRole('button', { name: 'Keep', exact: true });
  for (let step = 0; step < steps; step += 1) {
    await settled(page);
    if (await keepButton.isVisible()) {
      await keepButton.click();
      continue;
    }
    if (
      (await page.locator('.dec-overlay').count()) === 0 &&
      (await handCard(page, spell).count()) > 0 &&
      (await mine(page, 'Forest').count()) >= 2
    ) {
      return true;
    }
    if ((await page.getByText(/ wins\.$/).count()) > 0) return false;
    const lands = page.locator('.board-hand .is-clickable').filter({ hasNotText: 'SYNTHETIC' });
    if ((await lands.count()) > 0) {
      await lands.first().click();
    } else if ((await primary(page).count()) > 0 && (await primary(page).isEnabled())) {
      await primary(page).click();
    }
  }
  return false;
}

test('an effect that offers three instructions asks which one as it resolves; the answer is acted on and logged', async ({
  page,
}) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const rite = 'SYNTHETIC Fork Rite';
  let reached = false;
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    await page.goto(game(seed));
    if (await playUntilCastable(page, rite)) {
      reached = true;
      break;
    }
  }
  expect(reached).toBe(true);
  await handCard(page, rite).first().click();

  const dialog = page.getByRole('dialog', { name: 'Choose one' });
  for (let step = 0; step < 40 && !(await dialog.isVisible()); step += 1) {
    await settled(page);
    if ((await primary(page).count()) > 0 && (await primary(page).isEnabled())) {
      await primary(page).click();
    }
  }
  await expect(dialog).toBeVisible();
  // Asked as the spell resolves, with the words of each instruction; no way out, and Esc does not leave the question.
  await expect(dialog.locator('h2')).toHaveText(rite);
  await expect(dialog.locator('[data-option-prompt]')).toHaveText(
    `Choose one for ${rite}: draw a card, gain 3 life or create a Treasure token.`,
  );
  await expect(dialog.locator('button[data-option]')).toHaveCount(3);
  await expect(dialog.locator('[data-option="draw a card"]')).toContainText('Draw a card');
  await expect(dialog.locator('[data-option="gain 3 life"]')).toContainText('Gain 3 life');
  await expect(dialog.locator('[data-option="create a Treasure token"]')).toContainText(
    'Create a Treasure token',
  );
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();

  await dialog.locator('[data-option="create a Treasure token"]').click();
  await settled(page);
  await expect(dialog).toBeHidden();
  await expect(mine(page, 'Treasure').first()).toBeVisible();
  await expect(page.getByRole('log')).toContainText(
    `You choose to create a Treasure token (${rite}).`,
  );
  expect(errors).toEqual([]);
});
