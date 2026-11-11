import { expect, type Page, test } from '@playwright/test';
import { handCard } from './harness/locators';
import { leaveHand } from './harness/pointer';
import { settled } from './harness/settle';

/**
 * Kicker and Flashback (D-079). The listed test decks hold none, so these games use the hidden
 * SYNTHETIC deck `synthetic-kicker` (game/precons.ts): invented cards, not real ones. A scripted
 * player plays lands and casts spells until the card under test can be used. The engine and the AI
 * are seeded, so a given seed reaches it at the same point every time; the loop only waits for the
 * page to settle. Every other kicker question the loop meets is answered "Don't kick".
 */
// Seed 1 reaches the kicker question for Life Kicker; seed 10 puts a Flash Gain in the graveyard.
const game = (seed: number) => `/?autostart=synthetic-kicker,swamp-forest&seed=${seed}`;

const primary = (page: Page) => page.locator('[data-dec-primary]');
const kicker = (page: Page) => page.getByRole('dialog', { name: 'Kicker' });
const logText = (page: Page) => page.getByRole('log');
const chip = (page: Page, name: string) => page.locator('.board-flashback-chip', { hasText: name });

/** Plays on until `ready` holds; cards matching `keep` stay in the hand. */
async function playUntil(
  page: Page,
  ready: () => Promise<boolean>,
  keep: RegExp | null = null,
): Promise<void> {
  const keepButton = page.getByRole('button', { name: 'Keep', exact: true });
  for (let step = 0; step < 600; step += 1) {
    await settled(page);
    if (await keepButton.isVisible()) {
      await keepButton.click();
    } else if (await ready()) {
      return;
    } else if (await kicker(page).isVisible()) {
      await kicker(page).getByRole('button', { name: "Don't kick" }).click();
    } else {
      let cards = page.locator('.board-hand .is-clickable');
      if (keep !== null) cards = cards.filter({ hasNotText: keep });
      if ((await cards.count()) > 0) {
        await cards.first().click();
      } else if ((await primary(page).count()) > 0 && (await primary(page).isEnabled())) {
        await primary(page).click();
      }
    }
  }
  throw new Error('the game never reached the situation');
}

test('a kicker spell asks "Pay the kicker cost: 3 life?"; Esc cancels the cast, Kick kicks it', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(game(1));
  await playUntil(
    page,
    async () => (await handCard(page, 'SYNTHETIC Life Kicker').count()) > 0,
    /Life Kicker/,
  );

  await handCard(page, 'SYNTHETIC Life Kicker').first().click();
  const dialog = kicker(page);
  await expect(dialog).toContainText('SYNTHETIC Life Kicker');
  await expect(dialog).toContainText('Pay the kicker cost: 3 life?');
  await expect(dialog.getByRole('button', { name: 'Kick', exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: "Don't kick" })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeVisible();

  // Esc takes the cast back: the card is in the hand and nothing was cast.
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(handCard(page, 'SYNTHETIC Life Kicker').first()).toBeVisible();
  await expect(logText(page)).not.toContainText('You cast SYNTHETIC Life Kicker');

  await handCard(page, 'SYNTHETIC Life Kicker').first().click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Kick', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(logText(page)).toContainText('You cast SYNTHETIC Life Kicker, kicked.');
  expect(errors).toEqual([]);
});

test('a graveyard card is cast with flashback from the chip above the hand; it is exiled after', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(game(10));
  await playUntil(page, async () => (await chip(page, 'SYNTHETIC Flash Gain').count()) > 0);

  await expect(chip(page, 'SYNTHETIC Flash Gain')).toContainText('Flashback {1}{W}');
  // Full Control keeps the spell on the stack, so its badge can be read there.
  await page.getByRole('button', { name: 'Full Control' }).click();
  await chip(page, 'SYNTHETIC Flash Gain').first().click();
  await expect(logText(page)).toContainText('You cast SYNTHETIC Flash Gain with flashback.');
  const stack = page.getByRole('region', { name: 'Stack' });
  await expect(stack).toContainText('SYNTHETIC Flash Gain');
  await expect(stack.getByText('flashback', { exact: true })).toBeVisible();

  await primary(page).click();
  await page.getByRole('button', { name: /^Open exile/ }).click();
  await expect(
    page.getByRole('dialog', { name: 'Exile (shared)' }).getByLabel('SYNTHETIC Flash Gain'),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test('the graveyard list badges the card "Flashback {cost}" and a click casts it with flashback', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(game(10));
  await playUntil(page, async () => (await chip(page, 'SYNTHETIC Flash Gain').count()) > 0);

  await leaveHand(page);
  await page.getByRole('button', { name: /^Open You graveyard/ }).click();
  const list = page.getByRole('dialog', { name: /graveyard/ });
  const card = list.getByLabel('SYNTHETIC Flash Gain').first();
  await expect(card.locator('.board-ibadge')).toHaveText('Flashback {1}{W}');
  await card.click();
  // The list gives way to the cast; the autopilot pays and the spell resolves.
  await expect(list).toBeHidden();
  await expect(logText(page)).toContainText('You cast SYNTHETIC Flash Gain with flashback.');
  expect(errors).toEqual([]);
});
