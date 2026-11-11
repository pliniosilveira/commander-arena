import { expect, type Page, test } from '@playwright/test';
import { handCard, mine } from './harness/locators';
import { settled } from './harness/settle';

/**
 * The player chooses the permanent a mana ability sacrifices (D-222, CR 601.2b, 605.3b): "Sacrifice a creature: Add {R}." with two creatures to give up. The
 * listed decks hold no such card, so the game uses the hidden SYNTHETIC deck `synthetic-sacrifice-mana` (game/precons.ts): a Blood Altar, white one-drops and a
 * red one-drop that only the Altar can pay for. A scripted player plays lands and casts the Altar and the white creatures until the red creature can be cast
 * with two creatures on the battlefield, casts it by clicking the Altar while paying, and chooses which creature is given up. The engine and the AI are seeded,
 * so a given seed reaches the position at the same point every time.
 */
const game = (seed: number) => `/?autostart=synthetic-sacrifice-mana,swamp-forest&seed=${seed}`;

const primary = (page: Page) => page.locator('.dec-bar [data-dec-primary]');
const ALTAR = 'SYNTHETIC Blood Altar';
const HAWK = "Healer's Hawk";
const GOBLIN = 'Raging Goblin';

/** Plays lands and casts the Altar and Hawks (Auto-pay is the default) until the Goblin can be cast with an Altar and two Hawks; false when `steps` actions did not reach it. */
async function playUntilReady(page: Page, steps = 600): Promise<boolean> {
  const keepButton = page.getByRole('button', { name: 'Keep', exact: true });
  for (let step = 0; step < steps; step += 1) {
    await settled(page);
    if (await keepButton.isVisible()) {
      await keepButton.click();
      continue;
    }
    if (
      (await page.locator('.dec-overlay').count()) === 0 &&
      (await mine(page, ALTAR).count()) > 0 &&
      (await mine(page, HAWK).count()) >= 2 &&
      (await handCard(page, GOBLIN).count()) > 0
    ) {
      return true;
    }
    if ((await page.getByText(/ wins\.$/).count()) > 0) return false;
    const lands = page.locator('.board-hand .is-clickable').filter({ hasText: 'Land' });
    if ((await lands.count()) > 0) {
      await lands.first().click();
    } else if (
      (await mine(page, ALTAR).count()) === 0 &&
      (await handCard(page, ALTAR).count()) > 0
    ) {
      await handCard(page, ALTAR).first().click();
    } else if ((await mine(page, HAWK).count()) < 2 && (await handCard(page, HAWK).count()) > 0) {
      await handCard(page, HAWK).first().click();
    } else if ((await primary(page).count()) > 0 && (await primary(page).isEnabled())) {
      await primary(page).click();
    }
  }
  return false;
}

test('paying for a spell by hand, the player chooses which creature the Altar sacrifices', async ({
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

  const hawks = await mine(page, HAWK).count();
  // Auto-pay chooses the cheapest creature for the player (the planner's default); paying by hand lets the player choose, so turn Manual mana on.
  await page.getByRole('button', { name: 'Manual mana' }).click();
  await handCard(page, GOBLIN).first().click();
  await settled(page);
  // The payment: click the Altar. It sacrifices one of several creatures, so the popover asks which.
  await mine(page, ALTAR).first().click();
  const popover = page.getByRole('group', { name: 'Sacrifice which permanent?' });
  await expect(popover).toBeVisible();
  const choices = popover.locator('.dec-ability-list button.dec-chip').filter({ hasText: /\w/ });
  expect(await choices.count()).toBeGreaterThanOrEqual(2);
  // The Goblin is not on the battlefield yet: every choice is a creature of the board.
  await choices.first().click();
  await expect(popover).toBeHidden();
  await expect(page.locator('.dec-pay')).toContainText('will be sacrificed');
  await primary(page).click();
  await settled(page);
  for (
    let step = 0;
    step < 6 && (await page.getByText('Stack is empty').count()) === 0;
    step += 1
  ) {
    if ((await primary(page).count()) > 0 && (await primary(page).isEnabled())) {
      await primary(page).click();
    }
    await settled(page);
  }
  await expect(page.getByRole('log')).toContainText(`You cast ${GOBLIN}`);
  expect(await mine(page, HAWK).count()).toBe(hawks - 1);
  expect(errors).toEqual([]);
});
