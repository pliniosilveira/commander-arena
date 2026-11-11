import type { Page } from '@playwright/test';
import { settled } from './settle';

/**
 * The scripted player of the keyword batch e2e tests (e2e/keywords.e2e.ts), for the hidden
 * SYNTHETIC deck `synthetic-keyword-batch` (game/precons.ts): plays lands and Sol Rings, keeps the
 * invented spells in its hand until the card under test can be cast, and answers the mulligan.
 * Every click answers the settled page (settle.ts), so a seed reaches its situation at the same
 * point every time.
 */
export const game = (seed: number) =>
  `/?autostart=synthetic-keyword-batch,swamp-forest&seed=${seed}`;

export const primary = (page: Page) => page.locator('[data-dec-primary]');
export const handCard = (page: Page, name: string) =>
  page.locator('.board-hand .is-clickable', { hasText: name });
export const life = (page: Page, seat: 0 | 1) =>
  page.locator(`.board-life[data-seat="${seat}"] .board-life-total`);

/** Mana the player's untapped lands and Sol Rings make: a land makes one, a Sol Ring two. */
export async function sources(page: Page): Promise<number> {
  const untapped = page.locator('[data-field-seat="0"] .board-tile:not(.is-tapped)');
  const rings = await untapped.filter({ hasText: 'Sol Ring' }).count();
  const lands = await untapped
    .filter({
      has: page.locator('.board-tile-name', {
        hasText: /^(Mountain|Forest|Island|Swamp|Plains|SYNTHETIC Tide Pool)$/,
      }),
    })
    .count();
  return lands + 2 * rings;
}

/**
 * Plays on until `spell` can be cast (it is clickable in the hand) with at least `mana` sources
 * untapped; the invented spells stay in the hand, lands and Sol Rings are played.
 */
export async function playUntil(
  page: Page,
  spell: string,
  mana: number,
  steps = 600,
): Promise<void> {
  const keepButton = page.getByRole('button', { name: 'Keep', exact: true });
  for (let step = 0; step < steps; step += 1) {
    await settled(page);
    if (await keepButton.isVisible()) {
      await keepButton.click();
    } else if (
      (await page.locator('.dec-overlay').count()) === 0 &&
      (await handCard(page, spell).count()) > 0 &&
      (await sources(page)) >= mana
    ) {
      return;
    } else {
      const cards = page.locator('.board-hand .is-clickable').filter({ hasNotText: 'SYNTHETIC' });
      if ((await cards.count()) > 0) {
        await cards.first().click();
      } else if ((await primary(page).count()) > 0 && (await primary(page).isEnabled())) {
        await primary(page).click();
      }
    }
  }
  throw new Error('the game never reached the situation');
}

const INFECT = /SYNTHETIC Infect (Bear|Lifelinker|Viper)/;

/**
 * Plays lands and the plain infect creatures, and sends them at the opponent at the first attack
 * declaration they can make, until the opponent has poison counters (the log says so). Throws when
 * `steps` clicks pass without that (the opponent blocked, or no infect creature was drawn).
 */
export async function poisonOpponent(page: Page, steps = 400): Promise<void> {
  const keepButton = page.getByRole('button', { name: 'Keep', exact: true });
  const attackers = page.locator('[data-field-seat="0"] .board-tile.is-clickable', {
    hasText: INFECT,
  });
  for (let step = 0; step < steps; step += 1) {
    await settled(page);
    if ((await life(page, 1).count()) > 0 && (await page.locator('.board-flag-poison').count()) > 0)
      return;
    if (await keepButton.isVisible()) {
      await keepButton.click();
      continue;
    }
    const label = (await primary(page).count()) > 0 ? (await primary(page).innerText()).trim() : '';
    if (/^(No Attack|Attack)/.test(label) && (await attackers.count()) > 0) {
      await attackers.first().click();
      await primary(page).click();
      continue;
    }
    const cards = page.locator('.board-hand .is-clickable').filter({
      hasNotText: /SYNTHETIC/,
    });
    const infect = page.locator('.board-hand .is-clickable', { hasText: INFECT });
    if ((await cards.count()) > 0) {
      await cards.first().click();
    } else if ((await infect.count()) > 0) {
      await infect.first().click();
    } else if ((await primary(page).count()) > 0 && (await primary(page).isEnabled())) {
      await primary(page).click();
    }
  }
  throw new Error('the opponent was never poisoned');
}
