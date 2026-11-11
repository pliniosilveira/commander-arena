import { expect, type Page, test } from '@playwright/test';
import { handCard, mine } from './harness/locators';
import { settled } from './harness/settle';

/**
 * The "cast later" family (D-128): Suspend, Madness, Foretell and the delayed draw. The listed decks hold
 * none, so these games use the hidden SYNTHETIC decks `synthetic-suspend`, `synthetic-madness`,
 * `synthetic-foretell` and `synthetic-delayed` (game/precons.ts): invented cards, not real ones. The
 * engine and the AI are seeded and every click answers a settled page (e2e/harness/settle.ts), so a seed
 * reaches the same situation however slow the machine is.
 */
const game = (human: string, ai: string, seed: number) => `/?autostart=${human},${ai}&seed=${seed}`;

const bar = (page: Page) => page.locator('.dec-bar');
const primary = (page: Page) => page.locator('.dec-bar [data-dec-primary]');
const logText = (page: Page) => page.getByRole('log');
const stack = (page: Page) => page.getByRole('region', { name: 'Stack' });
const chooser = (page: Page) => page.getByRole('group', { name: 'Choose an ability' });
const exileStrip = (page: Page) =>
  page.getByRole('list', { name: 'Suspended and foretold cards in exile' });
const handCount = async (page: Page): Promise<number> =>
  Number(await page.locator('.board-strip-me [title="Cards in hand"] b').innerText());

/** Untapped lands of the player. */
async function lands(page: Page): Promise<number> {
  return page
    .locator('[data-field-seat="0"] .board-tile:not(.is-tapped)')
    .filter({
      has: page.locator('.board-tile-name', { hasText: /^(Plains|Island|Swamp|Mountain|Forest)$/ }),
    })
    .count();
}

/** Keeps the hand. */
async function start(page: Page, human: string, ai: string, seed: number): Promise<void> {
  await page.goto(game(human, ai, seed));
  await page.getByRole('button', { name: 'Keep', exact: true }).click();
}

/**
 * Plays on until `ready` holds on a settled page with no dialog open (or `ready` itself looks at one):
 * lands first when `lands` is set, the primary button otherwise; a hand over its limit discards its
 * first card.
 */
async function playUntil(
  page: Page,
  ready: () => Promise<boolean>,
  playLands = true,
  max = 1200,
): Promise<void> {
  const discard = page.getByRole('dialog', { name: /^Discard/ });
  for (let step = 0; step < max; step += 1) {
    await settled(page);
    if (await ready()) return;
    if (await page.getByRole('dialog', { name: /^You (win|lose)/ }).isVisible()) {
      throw new Error('the game ended before it reached the situation');
    }
    if (await discard.isVisible()) {
      await discard.locator('.dec-card-button').first().click();
      await discard.getByRole('button', { name: 'Confirm' }).click();
    } else if ((await page.locator('.dec-overlay').count()) > 0) {
      throw new Error('an unexpected dialog is open');
    } else if (
      playLands &&
      (await page.locator('.board-hand .is-clickable', { hasText: 'Basic Land' }).count()) > 0
    ) {
      await page.locator('.board-hand .is-clickable', { hasText: 'Basic Land' }).first().click();
    } else if ((await primary(page).count()) > 0 && (await primary(page).isEnabled())) {
      await primary(page).click();
    }
  }
  throw new Error('the game never reached the situation');
}

const noDialog = async (page: Page) => (await page.locator('.dec-overlay').count()) === 0;
const stackEmpty = async (page: Page) =>
  (await stack(page).locator('.pnl-stack-item').count()) === 0;

test('Suspend: the button, the payment (Cancel gives priority back), the counters, the free cast with haste', async ({
  page,
}) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const bear = 'SYNTHETIC Suspend Bear';
  await start(page, 'synthetic-suspend', 'swamp-forest', 1);
  await playUntil(
    page,
    async () =>
      (await noDialog(page)) &&
      (await stackEmpty(page)) &&
      (await lands(page)) >= 1 &&
      (await handCard(page, bear).count()) > 0,
  );
  await page.getByRole('button', { name: 'Manual mana' }).click();

  // The card can only be suspended now ({G} of three lands it does not have): the click asks.
  await handCard(page, bear).first().click();
  const suspend = chooser(page).getByRole('button', { name: /^Suspend 3 — \{G\}/ });
  await expect(suspend).toBeVisible();
  await suspend.click();
  await settled(page);
  await expect(bar(page)).toContainText(
    `Pay {G} to suspend ${bear} with 3 time counters: tap your mana sources.`,
  );
  await expect(page.locator('[data-special-pay]')).toContainText('Cancel keeps it in your hand.');

  // Cancel gives priority back; the card is still in the hand.
  await bar(page).getByRole('button', { name: 'Cancel' }).click();
  await settled(page);
  await expect(bar(page)).not.toContainText('to suspend');
  await expect(handCard(page, bear).first()).toBeVisible();
  await expect(exileStrip(page)).toHaveCount(0);

  await handCard(page, bear).first().click();
  await chooser(page)
    .getByRole('button', { name: /^Suspend 3/ })
    .click();
  await settled(page);
  await bar(page).getByRole('button', { name: 'Auto-pay' }).click();
  await settled(page);
  await expect(logText(page)).toContainText(`You suspended ${bear} with 3 time counters.`);
  await expect(exileStrip(page)).toContainText(`${bear} time 3`);

  // From now on stop at every priority: each of our upkeeps takes a counter off, worded on the stack.
  await page.getByRole('button', { name: 'Full Control' }).click();
  const wording = stack(page).locator('[data-later-wording]');
  await playUntil(page, async () => (await wording.count()) > 0);
  await expect(wording).toHaveText(`Remove a time counter from ${bear}.`);
  await expect(stack(page).locator('.pnl-stack-when').first()).toHaveText(
    'At the beginning of your upkeep',
  );
  await primary(page).click();
  await settled(page);
  await expect(exileStrip(page)).toContainText(`${bear} time 2`);

  // The last counter: the ability that casts it, then the question.
  await playUntil(
    page,
    async () => (await wording.count()) > 0 && (await wording.innerText()).startsWith('Cast'),
  );
  await expect(wording).toHaveText(`Cast ${bear} without paying its mana cost.`);
  await primary(page).click();
  await settled(page);
  const dialog = page.getByRole('dialog', { name: 'Suspend' });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.dec-sub')).toHaveText(
    `Cast ${bear} now without paying its mana cost? (its last time counter was removed)`,
  );
  await expect(
    dialog.getByRole('button', { name: "Don't cast it (it stays in exile)" }),
  ).toBeVisible();
  await dialog.getByRole('button', { name: 'Cast it', exact: true }).click();
  await settled(page);

  // The spell carries the badge; the permanent has haste and says why.
  await expect(stack(page).getByText('suspended', { exact: true })).toBeVisible();
  await expect(logText(page)).toContainText(
    `You cast ${bear} without paying its mana cost (suspend).`,
  );
  await primary(page).click();
  await settled(page);
  const tile = mine(page, bear);
  await expect(tile).toHaveCount(1);
  await tile.first().hover();
  await expect(page.locator('.board-preview')).toContainText('Cast from suspend: it has haste');
  await expect(exileStrip(page)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('Madness: cycling discards the card to exile, the question names the cost, the cast is badged', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const cycler = 'SYNTHETIC Madness Cycler';
  await start(page, 'synthetic-madness', 'swamp-forest', 1);
  await playUntil(
    page,
    async () =>
      (await noDialog(page)) &&
      (await stackEmpty(page)) &&
      (await lands(page)) >= 2 &&
      (await handCard(page, cycler).count()) > 0,
  );
  await page.getByRole('button', { name: 'Full Control' }).click();

  // Cycling {1}: the card is discarded as a cost and exiled by madness instead of the graveyard.
  await handCard(page, cycler).first().click();
  await settled(page);
  await expect(logText(page)).toContainText(`${cycler} was exiled with madness.`);
  const wording = stack(page).locator('[data-later-wording]');
  await expect(wording).toHaveText(`Cast ${cycler} for its madness cost.`);
  await expect(stack(page).locator('.pnl-stack-when').first()).toHaveText(
    `When ${cycler} is exiled with madness`,
  );
  await primary(page).click();
  await settled(page);

  const dialog = page.getByRole('dialog', { name: 'Madness' });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.dec-sub')).toHaveText(`Cast ${cycler} for its madness cost {B}?`);
  await expect(
    dialog.getByRole('button', { name: "Don't cast it (it goes to the graveyard)" }),
  ).toBeVisible();
  await dialog.getByRole('button', { name: 'Cast it for {B}' }).click();
  await settled(page);
  await expect(logText(page)).toContainText(`You cast ${cycler} for its madness cost.`);
  await expect(stack(page).getByText('madness', { exact: true })).toBeVisible();
  await primary(page).click();
  await settled(page);
  await expect(mine(page, cycler)).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('Foretell: the button, our own card face down, cast for the foretell cost from the next turn', async ({
  page,
}) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const giant = 'SYNTHETIC Foretell Giant';
  await start(page, 'synthetic-foretell', 'swamp-forest', 1);
  await playUntil(
    page,
    async () =>
      (await noDialog(page)) &&
      (await stackEmpty(page)) &&
      (await lands(page)) >= 2 &&
      (await handCard(page, giant).count()) > 0,
  );
  await page.getByRole('button', { name: 'Manual mana' }).click();

  await handCard(page, giant).first().click();
  await chooser(page)
    .getByRole('button', { name: /^Foretell \{2\}/ })
    .click();
  await settled(page);
  await expect(bar(page)).toContainText(`Pay {2} to foretell ${giant}: tap your mana sources.`);
  await bar(page).getByRole('button', { name: 'Cancel' }).click();
  await settled(page);
  await expect(handCard(page, giant).first()).toBeVisible();
  await handCard(page, giant).first().click();
  await chooser(page)
    .getByRole('button', { name: /^Foretell \{2\}/ })
    .click();
  await settled(page);
  await bar(page).getByRole('button', { name: 'Auto-pay' }).click();
  await settled(page);

  // Ours: named in the log and the strip, marked Foretold, not castable yet.
  await expect(logText(page)).toContainText(`You foretold ${giant}.`);
  await expect(exileStrip(page)).toContainText(`${giant} Foretold`);
  await page.getByRole('button', { name: /^Open exile/ }).click();
  const viewer = page.getByRole('dialog', { name: /^Exile/ });
  await expect(viewer.locator('[data-exile-mark="Foretold"]')).toHaveCount(1);
  await expect(viewer.getByText('Yours')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.board-flashback-chip', { hasText: 'Cast for' })).toHaveCount(0);

  // From a later turn: "Cast for {1}{G}" above the hand, one click casts it.
  const chip = page.locator('.board-flashback-chip', { hasText: 'Cast for {1}{G}' });
  await playUntil(page, async () => (await noDialog(page)) && (await chip.count()) > 0);
  await expect(chip.first()).toHaveAttribute('aria-label', `Cast for {1}{G}: ${giant}`);
  // Full Control, so the spell stays on the stack for us to read.
  await page.getByRole('button', { name: 'Full Control' }).click();
  await chip.first().click();
  await settled(page);
  if ((await bar(page).getByRole('button', { name: 'Auto-pay' }).count()) > 0) {
    await bar(page).getByRole('button', { name: 'Auto-pay' }).click();
    await settled(page);
  }
  await expect(logText(page)).toContainText(`You cast ${giant} for its foretell cost.`);
  await expect(stack(page).getByText('foretold', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('Foretell, the other side: a face-down card, and nothing on the page names it', async ({
  page,
}) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const giant = 'SYNTHETIC Foretell Giant';
  await start(page, 'swamp-forest', 'synthetic-foretell', 1);
  const chip = exileStrip(page).locator('.board-exile-chip.is-opponent');
  await playUntil(page, async () => (await noDialog(page)) && (await chip.count()) > 0);

  // The strip, the log, the exile viewer and the preview: a card back, the opponent's, no name.
  await expect(chip.first()).toHaveAttribute('aria-label', /^Face-down card \(face down\)/);
  await expect(logText(page)).toContainText('Opponent foretold a card.');
  await expect(page.locator('body')).not.toContainText(giant);
  await page.getByRole('button', { name: /^Open exile/ }).click();
  const viewer = page.getByRole('dialog', { name: /^Exile/ });
  const back = viewer.getByRole('button', { name: 'Face-down card (face down)' });
  await expect(back).toHaveCount(1);
  await expect(back.locator('[data-face-down]')).toBeVisible();
  await expect(viewer.getByText("Opponent's")).toBeVisible();
  await back.hover();
  await expect(page.locator('.board-preview')).toContainText('A face-down card in exile');
  await expect(page.locator('body')).not.toContainText(giant);
  expect(await page.content()).not.toContain(giant);
  await page.keyboard.press('Escape');

  // Once the opponent casts it the card is on the stack, and then it is public.
  await playUntil(page, async () => (await logText(page).innerText()).includes(`casts ${giant}`));
  await expect(logText(page)).toContainText(`Opponent casts ${giant} for its foretell cost`);
  expect(errors).toEqual([]);
});

test('The delayed draw: worded on the stack at the next upkeep, then we draw', async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const spell = 'SYNTHETIC Delayed Insight';
  await start(page, 'synthetic-delayed', 'swamp-forest', 1);
  await playUntil(
    page,
    async () =>
      (await noDialog(page)) &&
      (await stackEmpty(page)) &&
      (await lands(page)) >= 2 &&
      (await handCard(page, spell).count()) > 0,
  );
  await page.getByRole('button', { name: 'Full Control' }).click();
  await handCard(page, spell).first().click();
  await settled(page);
  await expect(logText(page)).toContainText(`You cast ${spell}.`);
  await primary(page).click();
  await settled(page);
  await expect(stackEmpty(page)).resolves.toBe(true);

  // The delayed ability goes on the stack as the next turn's upkeep begins.
  const when = stack(page).locator('.pnl-stack-item.pnl-triggered .pnl-stack-when');
  await playUntil(page, async () => (await when.count()) > 0, false);
  await expect(when).toHaveText("At the beginning of the next turn's upkeep, draw a card");
  await expect(stack(page).locator('.pnl-stack-item.pnl-triggered')).toContainText(spell);
  const before = await handCount(page);
  await primary(page).click();
  await settled(page);
  expect(await handCount(page)).toBe(before + 1);
  expect(errors).toEqual([]);
});
