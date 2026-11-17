import { expect, type Page } from '@playwright/test';

/** The start-game flow of the menu (issue 53): Start game, then your deck, then the opponent's. */
export type DeckTab = 'Your decks' | 'Precons';

/** Opens the first step, "Your deck", from the home. */
export async function openStartFlow(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Start game' }).click();
  await expect(page.locator('fieldset', { hasText: 'Your deck' })).toBeVisible();
}

/** On the current step, opens the tab and picks the deck whose name matches. */
export async function pickDeck(
  page: Page,
  legend: 'Your deck' | "Opponent's deck",
  tab: DeckTab,
  name: RegExp | string,
): Promise<void> {
  const step = page.locator('fieldset', { hasText: legend });
  await step.getByRole('tab', { name: tab }).click();
  await step.getByRole('radio', { name }).check();
}

/** From step 1 to step 2, "Opponent's deck". */
export async function toOpponentStep(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.locator('fieldset', { hasText: "Opponent's deck" })).toBeVisible();
}

/** Starts a game with the default decks, an optional seed. */
export async function startDefaultGame(page: Page, seed?: string): Promise<void> {
  await openStartFlow(page);
  await toOpponentStep(page);
  if (seed !== undefined) await page.getByLabel('Seed').fill(seed);
  await page.getByRole('button', { name: 'Start game' }).click();
}
