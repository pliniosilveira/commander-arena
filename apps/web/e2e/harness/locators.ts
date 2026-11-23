import type { Locator, Page } from '@playwright/test';

/** The clickable cards of the human's hand whose text holds `name`. */
export const handCard = (page: Page, name: string | RegExp): Locator =>
  page.locator('.board-hand .is-clickable', { hasText: name });

/** The clickable land cards of the human's hand. */
export const handLand = (page: Page): Locator =>
  page.locator('.board-hand .is-clickable', { hasText: 'Land' });

/** The human's permanents on the battlefield whose text holds `name`. */
export const mine = (page: Page, name: string | RegExp): Locator =>
  page.locator('[data-field-seat="0"] .board-tile', { hasText: name });

/**
 * The life total button of a seat. While a question asks for targets it is the player's target on the
 * board (`is-clickable`, and `aria-pressed` when chosen): the targets panel lists no chip for a player.
 */
export const seatTarget = (page: Page, seat: number): Locator =>
  page.locator(`.board-life[data-seat="${seat}"]`);

/**
 * A permanent on the battlefield that can be chosen as a target right now (`is-clickable`) whose text
 * holds `name`, of any seat. The targets panel lists no chip for a permanent: it is chosen on the board.
 */
export const permanentTarget = (page: Page, name: string | RegExp): Locator =>
  page.locator('[data-field-seat] .board-tile.is-clickable', { hasText: name });
