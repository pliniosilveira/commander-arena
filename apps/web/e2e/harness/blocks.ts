import type { Page } from '@playwright/test';
import { handLand } from './locators';
import { settled } from './settle';

const primary = (page: Page) => page.locator('.dec-bar [data-dec-primary]');
const bar = (page: Page) => page.locator('.dec-bar');
const mine = (page: Page) => page.locator('[data-field-seat="0"] .board-tile.is-clickable');
const theirs = (page: Page) => page.locator('[data-field-seat="1"] .board-tile');
const handCard = (page: Page) => page.locator('.board-hand .is-clickable');

/** Plays on until the declare blockers question shows at least `attackers` attackers and `blockers` blockers. */
export async function reachBlocks(
  page: Page,
  attackers: number,
  blockers: number,
  shot: (page: Page, name: string) => Promise<void> = async () => {},
): Promise<void> {
  const choosing = bar(page).getByText('Click a creature, then the attacker it blocks.');
  const discard = page.getByRole('dialog', { name: /^Discard/ });
  for (let step = 0; step < 900; step += 1) {
    await settled(page);
    if (await page.getByRole('dialog', { name: /^You (win|lose)/ }).isVisible()) {
      throw new Error('the game ended before the blocks');
    }
    if (await choosing.isVisible()) {
      const attacking = await theirs(page)
        .locator('xpath=self::*[contains(@class,"is-attacking")]')
        .count();
      if (attacking >= attackers && (await mine(page).count()) >= blockers) return;
      await primary(page).click(); // No Blocks: this combat is not the one wanted
    } else if (await discard.isVisible()) {
      const confirm = discard.getByRole('button', { name: 'Confirm' });
      const cards = discard.locator('.dec-card-button');
      for (let i = 0; i < 4 && (await confirm.isDisabled()); i += 1) await cards.nth(i).click();
      await confirm.click();
    } else if ((await page.locator('.dec-overlay').count()) > 0) {
      throw new Error('an unexpected dialog is open');
    } else if ((await handLand(page).count()) > 0) {
      await handLand(page)
        .first()
        .click({ timeout: 10_000 })
        .catch(async (e) => {
          await shot(page, 'stuck-land');
          throw e;
        });
    } else if ((await handCard(page).count()) > 0) {
      await handCard(page)
        .first()
        .click({ timeout: 10_000 })
        .catch(async (e) => {
          await shot(page, 'stuck-card');
          throw e;
        });
    } else if ((await primary(page).count()) > 0 && (await primary(page).isEnabled())) {
      await primary(page).click();
    }
  }
  throw new Error('the game never reached the blocks');
}

/**
 * Plays the human on `synthetic-trample` against `synthetic-rats` (game/precons.ts): lands and Tramplers
 * are played, the Tramplers attack, and the AI blocks one with a creature that kills it. Stops when the "Divide combat
 * damage" panel is up (a blocked trampler asks how to divide its damage, CR 510.1, 702.19b).
 */
export async function reachDivision(page: Page): Promise<void> {
  const panel = page.getByRole('region', { name: 'Divide combat damage' });
  const discard = page.getByRole('dialog', { name: /^Discard/ });
  const allOut = page.getByRole('button', { name: 'Attack with all' });
  for (let step = 0; step < 900; step += 1) {
    await settled(page);
    if (await panel.isVisible()) return;
    if (await page.getByRole('dialog', { name: /^You (win|lose)/ }).isVisible()) {
      throw new Error('the game ended before the division');
    }
    if (await discard.isVisible()) {
      const confirm = discard.getByRole('button', { name: 'Confirm' });
      const cards = discard.locator('.dec-card-button');
      for (let i = 0; i < 4 && (await confirm.isDisabled()); i += 1) await cards.nth(i).click();
      await confirm.click();
    } else if ((await handLand(page).count()) > 0) {
      await handLand(page).first().click();
    } else if ((await handCard(page).count()) > 0) {
      await handCard(page).first().click();
    } else if (
      (await allOut.count()) > 0 &&
      (await allOut.isEnabled()) &&
      (await primary(page).innerText()).startsWith('No Attack')
    ) {
      await allOut.click();
    } else if ((await primary(page).count()) > 0 && (await primary(page).isEnabled())) {
      await primary(page).click();
    }
  }
  throw new Error('the game never reached the division of damage');
}

/**
 * Plays the human on `synthetic-hasty-goblins` (lands and Goblins, Full Control off) until the declare
 * attackers question is open with a creature able to attack ("Attack with all" is enabled).
 */
export async function reachAttackers(page: Page): Promise<void> {
  const allOut = page.getByRole('button', { name: 'Attack with all' });
  const discard = page.getByRole('dialog', { name: /^Discard/ });
  for (let step = 0; step < 600; step += 1) {
    await settled(page);
    if ((await allOut.count()) > 0 && (await allOut.isEnabled())) return;
    if (await discard.isVisible()) {
      const confirm = discard.getByRole('button', { name: 'Confirm' });
      const cards = discard.locator('.dec-card-button');
      for (let i = 0; i < 4 && (await confirm.isDisabled()); i += 1) await cards.nth(i).click();
      await confirm.click();
    } else if ((await handLand(page).count()) > 0) {
      await handLand(page).first().click();
    } else if ((await handCard(page).count()) > 0) {
      await handCard(page).first().click();
    } else if ((await primary(page).count()) > 0 && (await primary(page).isEnabled())) {
      await primary(page).click();
    }
  }
  throw new Error('the game never reached the declare attackers question');
}
