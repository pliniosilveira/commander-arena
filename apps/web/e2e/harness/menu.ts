import { expect, type Locator, type Page } from '@playwright/test';

/**
 * The start-game flow of the menu (issue 53): Start game opens a dialog for your deck, choosing
 * and confirming it with Select opens a dialog for the opponent's deck, where Select starts the game. The seed
 * and the mulligan setting are on the home, so set them before Start game.
 */
export type DeckTab = 'My Decks' | 'Precons';
export const PLAYER_DIALOG = 'Choose your deck';
export const OPPONENT_DIALOG = "Choose opponent's deck";

/** Opens the first dialog, "Choose your deck", from the home. */
export async function openStartFlow(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: 'Start game' }).click();
  const dialog = page.getByRole('dialog', { name: PLAYER_DIALOG });
  await expect(dialog).toBeVisible();
  return dialog;
}

/** In the open dialog, opens the tab and returns the decks it lists. */
export async function decksIn(dialog: Locator, tab: DeckTab): Promise<Locator> {
  await dialog.getByRole('tab', { name: tab }).click();
  return dialog.locator('button.scr-deck');
}

/** In the open dialog, opens the tab and taps the deck whose name matches: it is chosen at once. */
export async function chooseDeck(
  dialog: Locator,
  tab: DeckTab,
  name: RegExp | string,
): Promise<void> {
  await dialog.getByRole('tab', { name: tab }).click();
  await dialog.locator('button.scr-deck', { hasText: name }).click();
}

/** Taps the deck with this id (a precon id): it is chosen at once. */
export async function chooseDeckById(dialog: Locator, tab: DeckTab, id: string): Promise<void> {
  await dialog.getByRole('tab', { name: tab }).click();
  await dialog.locator(`button.scr-deck[data-deck-id="${id}"]`).click();
}

/** Taps the first precon listed: any precon will do. */
export async function select(dialog: Locator): Promise<void> {
  await dialog.getByRole('tab', { name: 'Precons' }).click();
  await dialog.locator('button.scr-deck').first().click();
}

/** The versus screen before the opening hand of a game started from the menu. */
export const versusScreen = (page: Page): Locator => page.getByRole('dialog', { name: 'Versus' });

/** Presses Start game on the versus screen: the opening hand follows. */
export async function startFromVersus(page: Page): Promise<void> {
  await versusScreen(page).getByRole('button', { name: 'Start game' }).click();
}

/**
 * Starts a game with the decks the dialogs mark first: the first precon for you, the second for the
 * opponent. It goes past the versus screen (`stopAtVersus` stays on it).
 */
export async function startDefaultGame(
  page: Page,
  seed?: string,
  stopAtVersus = false,
): Promise<void> {
  if (seed !== undefined) await page.getByLabel('Seed').fill(seed);
  const mine = await openStartFlow(page);
  await select(mine);
  const theirs = page.getByRole('dialog', { name: OPPONENT_DIALOG });
  await expect(theirs).toBeVisible();
  await select(theirs);
  if (stopAtVersus) return;
  await expect(versusScreen(page)).toBeVisible({ timeout: 30_000 });
  await startFromVersus(page);
}
