import type { Page } from '@playwright/test';
import { settled } from './settle';

/**
 * The scripted player of the references e2e tests (e2e/references.e2e.ts): plays basic lands and
 * creatures, attacks with everything, blocks nothing, and answers other questions with their first
 * answer, until a situation is on screen. Every click answers the settled page (settle.ts).
 */
export const primary = (page: Page) => page.locator('.dec-bar [data-dec-primary]');
export const counterDialog = (page: Page) => page.getByRole('dialog', { name: 'Counterspell' });
export const searchDialog = (page: Page) => page.getByRole('dialog', { name: 'Search' });
const discardDialog = (page: Page) => page.getByRole('dialog', { name: /^Discard/ });
export const bouncePanel = (page: Page) =>
  page.getByRole('region', { name: 'Permanents to choose' });
export const logText = (page: Page) => page.getByRole('log');
const hand = (page: Page) => page.locator('.board-hand .is-clickable');

/** Cards the script never plays by itself: the scenarios do. */
const HELD = /Soft Counter|Toll Counter|Banish Seek Land|Optional Land Fetch|Sol Ring/;
const CREATURE = /Youthful Knight|Fencing Ace|Healer's Hawk/;

/** The player's lands on the battlefield, and how many of them are untapped. */
async function lands(page: Page): Promise<{ all: number; untapped: number }> {
  const mine = page
    .locator('[data-field-seat="0"] .board-tile')
    .filter({ hasText: /Plains|Island|Bounce Land/ });
  return {
    all: await mine.count(),
    untapped: await mine.evaluateAll(
      (tiles) => tiles.filter((t) => !t.classList.contains('is-tapped')).length,
    ),
  };
}

export interface Script {
  /** A creature is cast only with this many untapped lands (spare mana for a payment). */
  readonly creatureLands?: number;
  /** Play a bounce land once two lands are in play. */
  readonly bounce?: boolean;
}

/**
 * Plays on until `ready` holds. Every click answers the state the game is waiting on: lands, then
 * creatures (with spare mana if the script says so), an attack with everything, no blocks.
 */
export async function playUntil(
  page: Page,
  ready: () => Promise<boolean>,
  script: Script,
): Promise<void> {
  const keep = page.getByRole('button', { name: 'Keep', exact: true });
  const allOut = page.getByRole('button', { name: 'Attack with all', exact: true });
  for (let step = 0; step < 800; step += 1) {
    await settled(page);
    if (await ready()) return;
    if (await keep.isVisible()) {
      await keep.click();
    } else if (await discardDialog(page).isVisible()) {
      await discardDialog(page).locator('.dec-card-button').first().click();
      await discardDialog(page).getByRole('button', { name: 'Confirm' }).click();
    } else if (await counterDialog(page).isVisible()) {
      await counterDialog(page).getByRole('button', { name: 'Pay', exact: true }).click();
    } else if (await searchDialog(page).isVisible()) {
      await searchDialog(page).getByRole('button', { name: 'Search', exact: true }).click();
    } else if ((await page.locator('.dec-overlay').count()) > 0) {
      // Any other question (a search's card choice): the first answer, which finds nothing.
      await page.keyboard.press('Enter');
    } else if (await bouncePanel(page).isVisible()) {
      await bouncePanel(page).locator('button[aria-pressed]').first().click();
      await primary(page).click();
    } else {
      const own = await lands(page);
      let cards = hand(page).filter({ hasNotText: HELD });
      if (script.bounce !== true || own.all < 2) {
        cards = cards.filter({ hasNotText: 'Bounce Land' });
      }
      const basics = cards.filter({ hasText: /^(?!.*(Bounce Land)).*(Plains|Island)/s });
      const bounce = cards.filter({ hasText: 'Bounce Land' });
      const creatures = cards.filter({ hasText: CREATURE });
      const spare = script.creatureLands ?? 0;
      if (script.bounce === true && (await bounce.count()) > 0) {
        await bounce.first().click();
      } else if ((await basics.count()) > 0) {
        await basics.first().click();
      } else if ((await creatures.count()) > 0 && own.untapped >= spare) {
        await creatures.first().click();
      } else if ((await allOut.isVisible()) && (await allOut.isEnabled({ timeout: 1000 }))) {
        await allOut.click({ timeout: 2000 });
      } else if ((await primary(page).count()) > 0 && (await primary(page).isEnabled())) {
        await primary(page).click();
      }
    }
  }
  throw new Error('the game never reached the situation');
}
