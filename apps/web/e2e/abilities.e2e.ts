import { expect, type Page, test } from '@playwright/test';
import { settled } from './harness/settle';

/**
 * Activated abilities (D-075). The listed test decks hold none, so these games use the hidden
 * SYNTHETIC deck `synthetic-abilities` (game/precons.ts): invented cards, not real ones. A scripted
 * player plays lands and casts spells until the card under test can be used. The engine and the AI
 * are seeded, so a given seed reaches it at the same point every time; the loop only waits for the
 * page to settle.
 */
const game = (seed: number) => `/?autostart=synthetic-abilities,swamp-forest&seed=${seed}`;

const primary = (page: Page) => page.locator('[data-dec-primary]');
const hand = (page: Page) => page.locator('.board-hand [data-object-id]');
const field = (page: Page, name: string) =>
  page.locator('.board-field [data-object-id]', { hasText: name });
const clickable = (page: Page, name: string) =>
  page.locator('.board-field [data-object-id].is-clickable', { hasText: name });
const chooser = (page: Page) => page.locator('.dec-ability-chooser');
const logText = (page: Page) => page.getByRole('log');

/**
 * Plays on until `ready` holds. A card in the hand that has several things to do opens the chooser;
 * the loop takes its first item (Cast or Play). Cards matching `keep` are left in the hand.
 */
async function playUntil(
  page: Page,
  ready: () => Promise<boolean>,
  keep: RegExp | null = null,
): Promise<void> {
  const keepButton = page.getByRole('button', { name: 'Keep', exact: true });
  for (let step = 0; step < 500; step += 1) {
    await settled(page);
    if (await keepButton.isVisible()) {
      await keepButton.click();
    } else if (await ready()) {
      return;
    } else if (await chooser(page).isVisible()) {
      await chooser(page).getByRole('button').first().click();
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

const statOf = (page: Page, name: string) =>
  field(page, name).first().locator('.board-stat').innerText();

test('a pump creature: one click activates it, the mana is paid and it grows until end of turn', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(game(1));
  await playUntil(page, async () => (await clickable(page, 'SYNTHETIC Pump Bear').count()) > 0);

  const before = await statOf(page, 'SYNTHETIC Pump Bear');
  expect(before).toBe('2/2');
  await field(page, 'SYNTHETIC Pump Bear').first().click();

  await expect(logText(page)).toContainText("You activate SYNTHETIC Pump Bear's ability.");
  await expect.poll(() => statOf(page, 'SYNTHETIC Pump Bear')).toBe('3/3');
  expect(errors).toEqual([]);
});

test('Cycling: a card with Cast and Cycling opens the chooser, the keyboard picks Cycling', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(game(1));
  const bear = () => hand(page).filter({ hasText: 'SYNTHETIC Cycling Bear' });
  await playUntil(
    page,
    async () =>
      (await bear().locator('xpath=self::*[contains(@class, "is-clickable")]').count()) > 0,
    /SYNTHETIC Cycling Bear/,
  );

  // Two things to do with the card, so a click asks which.
  await bear().first().click();
  await expect(chooser(page)).toBeVisible();
  const items = chooser(page).getByRole('button');
  await expect(items.nth(0)).toHaveText('Cast SYNTHETIC Cycling Bear');
  await expect(items.nth(1)).toHaveText('Cycling {2}');
  // The first choice has the focus; Esc closes the chooser and nothing happens.
  await expect(items.nth(0)).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(chooser(page)).toBeHidden();
  await expect(logText(page)).not.toContainText('You cycle');

  // Open it again, move to Cycling with the arrow key and press Enter.
  const handBefore = await hand(page).count();
  await bear().first().click();
  await expect(items.nth(0)).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(items.nth(1)).toBeFocused();
  await page.keyboard.press('Enter');

  await expect(chooser(page)).toBeHidden();
  await expect(logText(page)).toContainText('You cycle SYNTHETIC Cycling Bear.');
  await expect(logText(page)).toContainText('You discard SYNTHETIC Cycling Bear.');
  // The ability resolves on its own and draws: the hand is as big as it was before.
  await expect.poll(() => hand(page).count()).toBe(handBefore);
  expect(errors).toEqual([]);
});

test('Cycling: the Cast / Cycling bubble opens above a card at the foot of the hand, fully on screen (issue 85)', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  for (const size of [
    { width: 1366, height: 768 },
    { width: 1798, height: 1003 },
  ]) {
    await page.setViewportSize(size);
    await page.goto(game(1));
    const bear = () => hand(page).filter({ hasText: 'SYNTHETIC Cycling Bear' });
    await playUntil(
      page,
      async () =>
        (await bear().locator('xpath=self::*[contains(@class, "is-clickable")]').count()) > 0,
      /SYNTHETIC Cycling Bear/,
    );
    await bear().first().click();
    await expect(chooser(page)).toBeVisible();
    // The hand card is lifted by the pointer over it (a short transition): the bubble follows it.
    const gap = async () => {
      const bubble = await chooser(page).boundingBox();
      const lifted = await bear().first().boundingBox();
      if (bubble === null || lifted === null) throw new Error('no box');
      return lifted.y - (bubble.y + bubble.height);
    };
    await expect.poll(gap).toBeGreaterThanOrEqual(-1);
    const box = await chooser(page).boundingBox();
    if (box === null) throw new Error('no box');
    // Entirely inside the window, with no part cut off at any edge.
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(size.width);
    expect(box.y + box.height).toBeLessThanOrEqual(size.height);
    // A hand card rests at the foot of the window, so the bubble opens above it, not over its name
    // (the poll above): `gap` is the room between the bubble and the card.
    // Every item is clickable where it is drawn (not covered by another element) and the keyboard reaches it.
    const items = chooser(page).getByRole('button');
    await expect(items.nth(0)).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(items.nth(1)).toBeFocused();
    for (const item of await items.all()) {
      const at = await item.boundingBox();
      if (at === null) throw new Error('no item box');
      const top = await page.evaluate(
        ([x, y]) => document.elementFromPoint(x ?? 0, y ?? 0)?.closest('button')?.textContent ?? '',
        [at.x + at.width / 2, at.y + at.height / 2],
      );
      expect(top).toBe(await item.textContent());
    }
    await page.keyboard.press('Escape');
    await expect(chooser(page)).toBeHidden();
  }
  expect(errors).toEqual([]);
});

test('a sacrifice cost: the prompt says it pays, Cancel rewinds, and Confirm sacrifices', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(game(1));
  const creatures = () =>
    page.locator('.board-field [data-object-id]', { hasText: /Bear|Firebreather|Coach|Scholar/ });
  await playUntil(
    page,
    async () =>
      (await clickable(page, 'SYNTHETIC Altar').count()) > 0 && (await creatures().count()) >= 2,
  );

  await clickable(page, 'SYNTHETIC Altar').first().click();
  const panel = page.getByRole('region', { name: 'Permanents to sacrifice' });
  await expect(panel).toContainText('Sacrifice to pay for SYNTHETIC Altar');
  await expect(page.getByText('Sacrifice a permanent to pay for SYNTHETIC Altar.')).toBeVisible();
  const cancel = page.getByRole('button', { name: 'Cancel', exact: true });
  await expect(cancel).toBeVisible();

  // Cancel (or Esc) takes the activation back: nothing was sacrificed, nothing is on the stack.
  const before = await creatures().count();
  await cancel.click();
  await expect(panel).toBeHidden();
  await expect(logText(page)).not.toContainText("You activate SYNTHETIC Altar's ability.");
  expect(await creatures().count()).toBe(before);
  await expect(clickable(page, 'SYNTHETIC Altar').first()).toBeVisible();

  // Do it for real: Esc cancels too, then pick a creature and confirm.
  await clickable(page, 'SYNTHETIC Altar').first().click();
  await expect(panel).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await clickable(page, 'SYNTHETIC Altar').first().click();
  await panel.locator('button[aria-pressed]').first().click();
  await primary(page).click();
  await expect(panel).toBeHidden();
  await expect(logText(page)).toContainText("You activate SYNTHETIC Altar's ability.");
  await expect(logText(page)).toContainText('Your life: 40 to 42.');
  expect(errors).toEqual([]);
});
