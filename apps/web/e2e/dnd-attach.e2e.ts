import { expect, type Page, test } from '@playwright/test';
import { settled } from './harness/settle';

/**
 * Drag and drop for the gestures that need a second answer: Equipment onto a creature, an Aura onto
 * a permanent, a graveyard card with flashback onto the board. The drop starts the action and the
 * page answers the engine's target question with what was dropped on; nothing is clicked after the
 * drag except where a test says so. The listed decks hold none of these cards, so the games use the
 * hidden SYNTHETIC decks `synthetic-attachments` and `synthetic-kicker` (game/precons.ts): invented
 * cards, not real ones. A scripted player plays lands and casts spells (never the Auras) until the
 * card under test can be used; the engine and the AI are seeded, so a seed reaches it at the same
 * point every time and the loop only waits for the page to settle.
 */
const attachments = (seed: number) => `/?autostart=synthetic-attachments,swamp-forest&seed=${seed}`;
const kicker = (seed: number) => `/?autostart=synthetic-kicker,swamp-forest&seed=${seed}`;

const primary = (page: Page) => page.locator('[data-dec-primary]');
const hand = (page: Page) => page.locator('.board-hand [data-object-id]');
const tile = (page: Page, name: string) =>
  page.locator('.board-field .board-tile[data-object-id]', { hasText: name });
const strip = (page: Page, name: string) =>
  page.locator('.board-field .board-attach[data-object-id]', { hasText: name });
const clickableTile = (page: Page, name: string) =>
  page.locator('.board-field .board-tile[data-object-id].is-clickable', { hasText: name });
const logText = (page: Page) => page.getByRole('log');
const creatureTiles = (page: Page) =>
  page.locator('.board-field[data-field-seat="0"] .board-row-creature .board-tile[data-object-id]');
const chip = (page: Page, name: string) => page.locator('.board-flashback-chip', { hasText: name });

/** Plays on until `ready` holds; cards matching `keep` stay in the hand, kicker is declined. */
async function playUntil(
  page: Page,
  ready: () => Promise<boolean>,
  keep: RegExp | null = null,
): Promise<void> {
  const keepButton = page.getByRole('button', { name: 'Keep', exact: true });
  const kick = page.getByRole('dialog', { name: 'Kicker' });
  for (let step = 0; step < 600; step += 1) {
    await settled(page);
    if (await keepButton.isVisible()) {
      await keepButton.click();
    } else if (await ready()) {
      return;
    } else if (await kick.isVisible()) {
      await kick.getByRole('button', { name: "Don't kick" }).click();
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

test('Equip by drag: the Equipment dropped on a creature is attached, with no click after it', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(attachments(1));
  await playUntil(
    page,
    async () =>
      (await clickableTile(page, 'SYNTHETIC Blade').count()) > 0 &&
      (await creatureTiles(page).count()) > 0,
    /Aura/,
  );

  const creature = creatureTiles(page).first();
  const name = (await creature.locator('.board-tile-name').innerText()).trim();
  const [power, toughness] = (await creature.locator('.board-stat').innerText())
    .split('/')
    .map(Number);
  const blade = clickableTile(page, 'SYNTHETIC Blade').first();
  await expect(blade).toHaveAttribute('draggable', 'true');

  // A land is no host and no Equipment: dropping the Blade on the lands does nothing at all.
  await blade.dragTo(page.locator('.board-field[data-field-seat="0"] .board-row-land'));
  await expect(page.getByText('Choose a creature you control to equip.')).toBeHidden();
  await expect(logText(page)).not.toContainText('You attach');

  await blade.dragTo(creature);
  await expect(logText(page)).toContainText(`You attach SYNTHETIC Blade to ${name}.`);
  await expect(strip(page, 'SYNTHETIC Blade')).toHaveCount(1);
  await expect(tile(page, 'SYNTHETIC Blade')).toHaveCount(0);
  await expect(creature.locator('.board-stat')).toHaveText(`${(power ?? 0) + 2}/${toughness}`);
  expect(errors).toEqual([]);
});

test('Equip by drag: while carried, only the creatures that may take it are outlined', async ({
  page,
}) => {
  await page.goto(attachments(1));
  await playUntil(
    page,
    async () =>
      (await clickableTile(page, 'SYNTHETIC Blade').count()) > 0 &&
      (await creatureTiles(page).count()) > 0,
    /Aura/,
  );
  const blade = clickableTile(page, 'SYNTHETIC Blade').first();
  const box = await blade.boundingBox();
  if (box === null) throw new Error('no box');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 12, box.y + box.height / 2 - 30, { steps: 4 });
  const outlined = page.locator('.board-tile[data-drop="object"][data-drop-state]');
  await expect(outlined.first()).toHaveAttribute('data-drop-label', /^Equip /);
  expect(await outlined.count()).toBe(await creatureTiles(page).count());
  await page.mouse.up();
  await expect(page.locator('[data-drop-state]')).toHaveCount(0);
});

test('an Aura by drag: dropped on a creature it is cast and attached; elsewhere it stays in hand', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(attachments(2));
  const aura = () =>
    hand(page).filter({ hasText: 'SYNTHETIC Might Aura' }).and(page.locator('.is-clickable'));
  await playUntil(
    page,
    async () => (await aura().count()) > 0 && (await creatureTiles(page).count()) > 0,
    /Aura/,
  );

  const creature = creatureTiles(page).first();
  const name = (await creature.locator('.board-tile-name').innerText()).trim();
  const [power, toughness] = (await creature.locator('.board-stat').innerText())
    .split('/')
    .map(Number);
  await expect(aura().first()).toHaveAttribute('draggable', 'true');
  const before = await hand(page).count();

  // The battlefield and the stack are no zones for an Aura: it needs a permanent to enchant.
  await aura().first().dragTo(page.locator('[data-drop="battlefield"]').first());
  await aura().first().dragTo(page.locator('[data-drop="stack"]'));
  await expect(page.getByText('Choose what to enchant.')).toBeHidden();
  await expect(hand(page)).toHaveCount(before);

  await aura().first().dragTo(creature);
  await expect(logText(page)).toContainText(`You attach SYNTHETIC Might Aura to ${name}.`);
  await expect(strip(page, 'SYNTHETIC Might Aura')).toHaveCount(1);
  await expect(creature.locator('.board-stat')).toHaveText(
    `${(power ?? 0) + 2}/${(toughness ?? 0) + 2}`,
  );
  expect(errors).toEqual([]);
});

test('flashback by drag: the chip above the hand dropped on the battlefield casts it', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(kicker(10));
  await playUntil(page, async () => (await chip(page, 'SYNTHETIC Flash Gain').count()) > 0);

  await expect(chip(page, 'SYNTHETIC Flash Gain').first()).toHaveAttribute('draggable', 'true');
  // The last click left the pointer over a hand card, whose hover pop-up can cover the chip: move off it.
  await page.mouse.move(5, 5);
  // Not a zone for it: the opponent's strip.
  await chip(page, 'SYNTHETIC Flash Gain').first().dragTo(page.locator('[data-seat="1"]'));
  await expect(logText(page)).not.toContainText('with flashback');

  await chip(page, 'SYNTHETIC Flash Gain')
    .first()
    .dragTo(page.locator('[data-drop="battlefield"]').first());
  await expect(logText(page)).toContainText('You cast SYNTHETIC Flash Gain with flashback.');
  expect(errors).toEqual([]);
});

test('flashback by drag: a card carried out of the graveyard list reaches the board under it', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(kicker(10));
  await playUntil(page, async () => (await chip(page, 'SYNTHETIC Flash Gain').count()) > 0);

  // The last click left the pointer over a hand card, whose hover pop-up covers the strip: move off it.
  await page.mouse.move(5, 5);
  await page.getByRole('button', { name: /^Open You graveyard/ }).click();
  const list = page.getByRole('dialog', { name: /graveyard/ });
  const card = list.getByLabel('SYNTHETIC Flash Gain').first();
  await expect(card).toHaveAttribute('draggable', 'true');
  // The list covers the board, and Playwright's `dragTo` wants the target reachable before the
  // drag has started, so the mouse is moved by hand: the list lets the pointer through once the
  // card is picked up.
  const box = await card.boundingBox();
  const field = await page.locator('[data-drop="battlefield"]').first().boundingBox();
  if (box === null || field === null) throw new Error('no boxes');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 10, box.y + box.height / 2 + 10, { steps: 3 });
  await expect(page.locator('html')).toHaveAttribute('data-dnd-active', '');
  await page.mouse.move(field.x + field.width / 2, field.y + field.height / 2, { steps: 8 });
  await expect(page.locator('[data-drop="battlefield"]').first()).toHaveAttribute(
    'data-drop-label',
    'Flashback {1}{W}',
  );
  await page.mouse.up();

  await expect(logText(page)).toContainText('You cast SYNTHETIC Flash Gain with flashback.');
  await expect(list).toBeHidden();
  expect(errors).toEqual([]);
});
