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
