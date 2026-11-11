import { expect, type Page, test } from '@playwright/test';
import { settled } from './harness/settle';

/**
 * Auras and Equipment (M5 slice S4a). The listed test decks hold none, so these games use the
 * hidden SYNTHETIC deck `synthetic-attachments` (game/precons.ts): invented cards, not real ones.
 * A scripted player plays lands and casts spells (never the Auras, which the test casts itself)
 * until the card under test can be used. The engine and the AI are seeded, so a given seed reaches
 * it at the same point every time; the loop only waits for the page to settle.
 */
const game = (seed: number) => `/?autostart=synthetic-attachments,swamp-forest&seed=${seed}`;

const primary = (page: Page) => page.locator('[data-dec-primary]');
const hand = (page: Page) => page.locator('.board-hand [data-object-id]');
const tile = (page: Page, name: string) =>
  page.locator('.board-field .board-tile[data-object-id]', { hasText: name });
const strip = (page: Page, name: string) =>
  page.locator('.board-field .board-attach[data-object-id]', { hasText: name });
const clickableTile = (page: Page, name: string) =>
  page.locator('.board-field .board-tile[data-object-id].is-clickable', { hasText: name });
const logText = (page: Page) => page.getByRole('log');

/** Plays on until `ready` holds; Auras stay in the hand. */
async function playUntil(page: Page, ready: () => Promise<boolean>): Promise<void> {
  const keepButton = page.getByRole('button', { name: 'Keep', exact: true });
  for (let step = 0; step < 500; step += 1) {
    await settled(page);
    if (await keepButton.isVisible()) {
      await keepButton.click();
    } else if (await ready()) {
      return;
    } else {
      const cards = page.locator('.board-hand .is-clickable').filter({ hasNotText: /Aura/ });
      if ((await cards.count()) > 0) {
        await cards.first().click();
      } else if ((await primary(page).count()) > 0 && (await primary(page).isEnabled())) {
        await primary(page).click();
      }
    }
  }
  throw new Error('the game never reached the situation');
}

const creatureTiles = (page: Page) =>
  page.locator('.board-field[data-field-seat="0"] .board-row-creature .board-tile[data-object-id]');

test('Equip: the chooser names the cost, the target prompt asks for a creature, and the stats change', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(game(1));
  await playUntil(
    page,
    async () =>
      (await clickableTile(page, 'SYNTHETIC Blade').count()) > 0 &&
      (await creatureTiles(page).count()) > 0,
  );

  const creature = creatureTiles(page).first();
  const name = (await creature.locator('.board-tile-name').innerText()).trim();
  const before = await creature.locator('.board-stat').innerText();
  const [power, toughness] = before.split('/').map(Number);

  // The Blade has one ability, so a click goes to it and the engine asks for the target.
  await clickableTile(page, 'SYNTHETIC Blade').first().click();
  await expect(page.getByText('Choose a creature you control to equip.')).toBeVisible();
  await creature.click();
  await primary(page).click();

  await expect(logText(page)).toContainText(`You attach SYNTHETIC Blade to ${name}.`);
  // The Blade is now a strip under the creature, not a tile of its own, and the creature is +2/+0.
  await expect(strip(page, 'SYNTHETIC Blade')).toHaveCount(1);
  await expect(tile(page, 'SYNTHETIC Blade')).toHaveCount(0);
  await expect(strip(page, 'SYNTHETIC Blade')).toHaveAttribute(
    'data-attached-to',
    (await creature.getAttribute('data-object-id')) ?? '',
  );
  await expect(creature.locator('.board-stat')).toHaveText(`${(power ?? 0) + 2}/${toughness}`);

  // Hovering the strip previews the Equipment; the preview names its host.
  await strip(page, 'SYNTHETIC Blade').hover();
  await expect(page.locator('.board-preview-card')).toContainText('SYNTHETIC Blade');
  await expect(page.locator('.board-preview-details')).toContainText(name);
  expect(errors).toEqual([]);
});

test('an Aura: the prompt says what to enchant, and it ends up under its creature', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(game(2));
  const aura = () =>
    hand(page).filter({ hasText: 'SYNTHETIC Might Aura' }).and(page.locator('.is-clickable'));
  await playUntil(
    page,
    async () => (await aura().count()) > 0 && (await creatureTiles(page).count()) > 0,
  );

  const creature = creatureTiles(page).first();
  const name = (await creature.locator('.board-tile-name').innerText()).trim();
  const [power, toughness] = (await creature.locator('.board-stat').innerText())
    .split('/')
    .map(Number);

  await aura().first().click();
  await expect(page.getByText('Choose what to enchant.')).toBeVisible();
  await creature.click();
  await primary(page).click();

  await expect(logText(page)).toContainText(`You attach SYNTHETIC Might Aura to ${name}.`);
  await expect(strip(page, 'SYNTHETIC Might Aura')).toHaveCount(1);
  await expect(tile(page, 'SYNTHETIC Might Aura')).toHaveCount(0);
  await expect(creature.locator('.board-stat')).toHaveText(
    `${(power ?? 0) + 2}/${(toughness ?? 0) + 2}`,
  );
  expect(errors).toEqual([]);
});
