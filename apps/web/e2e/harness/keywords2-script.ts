import type { Locator, Page } from '@playwright/test';
import { handCard, primary } from './keywords-script';
import { settled } from './settle';

export { handCard, primary };

/**
 * The scripted player of the keyword batch 2 e2e tests (e2e/keywords2.e2e.ts), for the hidden SYNTHETIC deck
 * `synthetic-keywords-2` (game/precons.ts): plays lands and Grizzly Bears, keeps the invented spells in its hand
 * until the card under test can be cast, and answers the mulligan and the target question. Every click answers
 * the settled page (settle.ts), so a seed reaches its situation at the same point every time.
 */
export const game = (seed: number) => `/?autostart=synthetic-keywords-2,swamp-forest&seed=${seed}`;

/** Grizzly Bears of the human on the battlefield, untapped or all. */
export const bears = (page: Page, untapped = false): Locator =>
  page.locator(
    `[data-field-seat="0"] .board-tile${untapped ? ':not(.is-tapped)' : ''}:has(.board-tile-name:text-is("Grizzly Bears"))`,
  );

/** The number of untapped lands the human has. */
export async function untappedLands(page: Page): Promise<number> {
  return page
    .locator('[data-field-seat="0"] .board-tile:not(.is-tapped)')
    .filter({
      has: page.locator('.board-tile-name', { hasText: /^(Mountain|Forest|Swamp|Plains)$/ }),
    })
    .count();
}

/** The number of cards in the human's graveyard, from the strip's button. */
export async function graveyardSize(page: Page): Promise<number> {
  const label = await page
    .getByRole('button', { name: /^Open You graveyard, \d+ cards?$/ })
    .getAttribute('aria-label');
  return Number(/(\d+) card/.exec(label ?? '')?.[1] ?? 0);
}

interface Drive {
  /** True when the situation is reached; asked only when no dialog is open. */
  readonly until: () => Promise<boolean>;
  /** A card to cast now, if the situation calls for one (it is a SYNTHETIC card kept in the hand). */
  readonly cast?: () => Promise<Locator | null>;
  /** A card to cast when no land or Bear can be played (to use up lands). */
  readonly spare?: () => Promise<Locator | null>;
  /** Cards that stay in the hand when the cleanup step asks to discard (the others go first). */
  readonly keep?: readonly string[];
  readonly steps?: number;
}

/**
 * Plays on until `until` holds: a mulligan is kept, the target question is answered with the human's first
 * legal creature, lands and Bears are played, the invented spells stay in the hand unless `cast` names one,
 * and priority is passed otherwise.
 */
export async function drive(
  page: Page,
  { until, cast, spare, keep = [], steps = 700 }: Drive,
): Promise<void> {
  const keepButton = page.getByRole('button', { name: 'Keep', exact: true });
  const targets = page.getByRole('region', { name: 'Legal targets' });
  for (let step = 0; step < steps; step += 1) {
    await settled(page);
    if (await keepButton.isVisible()) {
      await keepButton.click();
      continue;
    }
    if (await targets.isVisible()) {
      await page.locator('[data-field-seat="0"] .board-tile.is-clickable').first().click();
      await primary(page).click();
      continue;
    }
    const discard = page.getByRole('dialog', { name: /^Discard \d+ cards? to reach/ });
    if (await discard.isVisible()) {
      // The hand is over its maximum at the cleanup step: the cards that are not wanted go first.
      const others = discard
        .locator('.dec-card-button')
        .filter({ hasNotText: new RegExp(keep.join('|') || 'a^') });
      await others.first().click();
      await primary(page).click();
      continue;
    }
    if ((await page.locator('.dec-overlay').count()) > 0) {
      throw new Error('an unexpected question is open');
    }
    if (await until()) return;
    const wanted = cast === undefined ? null : await cast();
    if (wanted !== null) {
      await wanted.click();
      continue;
    }
    const plain = page.locator('.board-hand .is-clickable').filter({ hasNotText: 'SYNTHETIC' });
    const spent = (await plain.count()) > 0 || spare === undefined ? null : await spare();
    if ((await plain.count()) > 0) {
      await plain.first().click();
    } else if (spent !== null) {
      await spent.click();
    } else if ((await primary(page).count()) > 0 && (await primary(page).isEnabled())) {
      await primary(page).click();
    }
  }
  throw new Error('the game never reached the situation');
}
