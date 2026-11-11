import { expect, type Page, test } from '@playwright/test';
import { handCard, mine } from './harness/locators';
import { settled } from './harness/settle';

/**
 * The order of prevention effects on a damage event (D-191, CR 616.1): two shields of different sizes on one player and 3 damage to that player ask
 * which shield to apply first. The listed test decks hold no such cards, so the game uses the hidden SYNTHETIC deck `synthetic-damage-order`
 * (game/precons.ts): invented cards, not real ones. A scripted player plays lands until a "prevent the next 3 damage to you", a "prevent the next 5
 * damage to you" and a "3 damage to you" can all be cast, casts the two shields and then the damage; the engine and the AI are seeded, so a given seed
 * reaches it at the same point every time, and the loop acts only on a settled page.
 */
const game = (seed: number) => `/?autostart=synthetic-damage-order,swamp-forest&seed=${seed}`;

const primary = (page: Page) => page.locator('.dec-bar [data-dec-primary]');
const SMALL = 'SYNTHETIC Brace Three';
const LARGE = 'SYNTHETIC Brace Five';
const BURN = 'SYNTHETIC Backdraft';

/** Plays lands (and ends turns) until the three spells can be cast with three lands out; false when `steps` actions did not reach it. */
async function playUntilReady(page: Page, steps = 500): Promise<boolean> {
  const keepButton = page.getByRole('button', { name: 'Keep', exact: true });
  for (let step = 0; step < steps; step += 1) {
    await settled(page);
    if (await keepButton.isVisible()) {
      await keepButton.click();
      continue;
    }
    if (
      (await page.locator('.dec-overlay').count()) === 0 &&
      (await handCard(page, SMALL).count()) > 0 &&
      (await handCard(page, LARGE).count()) > 0 &&
      (await handCard(page, BURN).count()) > 0 &&
      (await mine(page, 'Plains').count()) >= 3
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

/** Casts `spell` from the hand and passes until it has resolved (cast, and the stack empty again), or the dialog is up. */
async function castAndResolve(page: Page, spell: string, dialog: ReturnType<Page['getByRole']>) {
  const casts = () => page.getByRole('log').getByText(`You cast ${spell}`).count();
  const already = await casts();
  await handCard(page, spell).first().click();
  for (let step = 0; step < 40; step += 1) {
    await settled(page);
    if (await dialog.isVisible()) return;
    if ((await casts()) > already && (await page.getByText('Stack is empty').count()) > 0) return;
    if ((await primary(page).count()) > 0 && (await primary(page).isEnabled())) {
      await primary(page).click();
    }
  }
}

test('two shields of different sizes and 3 damage to the player ask which shield is used first; the answer is acted on and logged', async ({
  page,
}) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  let reached = false;
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    await page.goto(game(seed));
    if (await playUntilReady(page)) {
      reached = true;
      break;
    }
  }
  expect(reached).toBe(true);

  const dialog = page.getByRole('dialog', { name: 'Damage replacement' });
  await castAndResolve(page, SMALL, dialog);
  await castAndResolve(page, LARGE, dialog);
  await expect(dialog).toBeHidden();
  await castAndResolve(page, BURN, dialog);
  await expect(dialog).toBeVisible();

  // Asked as the damage would be dealt, with the words of each shield and what each leads to; no way out, and Esc does not leave the question.
  await expect(dialog.locator('h2')).toHaveText('Damage replacement');
  await expect(dialog.locator('[data-option-prompt]')).toHaveText(
    `3 damage from ${BURN} would be dealt to you. Several effects apply. Choose which to apply first.`,
  );
  const buttons = dialog.locator('button[data-option]');
  await expect(buttons).toHaveCount(2);
  await expect(buttons.nth(0)).toContainText(
    'Prevent the next 3 damage that would be dealt to you this turn',
  );
  await expect(buttons.nth(1)).toContainText(
    'Prevent the next 5 damage that would be dealt to you this turn',
  );
  await expect(buttons.nth(0)).toContainText('Then: 0 damage');
  await expect(buttons.nth(1)).toContainText('Then: 0 damage');
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();

  // The 5 shield first: it prevents all 3 and keeps 2, so the player's life is untouched.
  await buttons.nth(1).click();
  await settled(page);
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('log')).toContainText(
    'You apply "Prevent the next 5 damage that would be dealt to you this turn" first',
  );
  await expect(page.getByRole('log')).toContainText(`${BURN}'s 3 damage to you is prevented.`);
  expect(errors).toEqual([]);
});
