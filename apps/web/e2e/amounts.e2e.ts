import { expect, type Locator, type Page, test } from '@playwright/test';
import { handCard, handLand, mine } from './harness/locators';
import { settled } from './harness/settle';

/**
 * Counted amounts, tapped tokens, a bite and an each-player sacrifice (D-131). The listed decks hold none
 * of them, so these games use the hidden SYNTHETIC deck `synthetic-amounts` (game/precons.ts): invented cards,
 * not real ones. The opponent plays the listed `swamp-forest` deck, whose creatures are what the bite and the
 * sacrifice meet. A scripted player with Full Control plays lands and casts what `next` asks for; the engine
 * and the AI are seeded and every click answers a settled page (e2e/harness/settle.ts), so a seed reaches the
 * same situation however slow the machine is.
 */
const game = (seed: number) => `/?autostart=synthetic-amounts,swamp-forest&seed=${seed}`;

const primary = (page: Page) => page.locator('.dec-bar [data-dec-primary]');
const bar = (page: Page) => page.locator('.dec-bar');
const logText = (page: Page) => page.getByRole('log');
const stack = (page: Page) => page.getByRole('region', { name: 'Stack' });
const stackItems = (page: Page) => stack(page).locator('.pnl-stack-item');
const theirs = (page: Page, name: string | RegExp): Locator =>
  page.locator('[data-field-seat="1"] .board-tile', { hasText: name });

const MY_ZOMBIES = /SYNTHETIC (Plain Zombie|Zombie Mourner|Bag Marauder)/;
const THEIR_CREATURES = /Llanowar Elves|Typhoid Rats|Giant Spider|Grizzly Bears/;

/** Keeps the hand and turns Full Control on, so everything stays on the stack for us to see. */
async function start(page: Page, seed: number): Promise<void> {
  await page.goto(game(seed));
  await page.getByRole('button', { name: 'Keep', exact: true }).click();
  await page.getByRole('button', { name: 'Full Control' }).click();
}

/**
 * Plays on until `ready` holds on a settled page: lands first, then the card `next` names when the hand has
 * it castable, and the primary button otherwise. A hand over its limit discards its first card.
 */
async function playUntil(
  page: Page,
  ready: () => Promise<boolean>,
  next: () => Promise<string | RegExp | null> = async () => null,
): Promise<void> {
  const discard = page.getByRole('dialog', { name: /^Discard/ });
  for (let step = 0; step < 1200; step += 1) {
    await settled(page);
    if (await ready()) return;
    if (await page.getByRole('dialog', { name: /^You (win|lose)/ }).isVisible()) {
      throw new Error('the game ended before it reached the situation');
    }
    if (await discard.isVisible()) {
      await discard.locator('.dec-card-button').first().click();
      await discard.getByRole('button', { name: 'Confirm' }).click();
      continue;
    }
    if ((await page.locator('.dec-overlay').count()) > 0) {
      throw new Error('an unexpected dialog is open');
    }
    const idle = (await stackItems(page).count()) === 0;
    const wanted = idle ? await next() : null;
    if (idle && (await handLand(page).count()) > 0) {
      await handLand(page).first().click();
    } else if (wanted !== null && (await handCard(page, wanted).count()) > 0) {
      // A full hand overlaps its cards, so the pointer can land on a neighbour: send the click to the card.
      await handCard(page, wanted).first().dispatchEvent('click');
    } else if ((await primary(page).count()) > 0 && (await primary(page).isEnabled())) {
      await primary(page).click();
    }
  }
  throw new Error('the game never reached the situation');
}

test('a token spell that counts Zombies makes that many tapped Treasure tokens', async ({
  page,
}) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await start(page, 1);
  const tapped = page.locator('[data-field-seat="0"] .board-tile.is-tapped', {
    hasText: 'Treasure',
  });
  await playUntil(
    page,
    async () => (await tapped.count()) > 0 && (await stackItems(page).count()) === 0,
    async () =>
      (await mine(page, MY_ZOMBIES).count()) >= 2
        ? 'SYNTHETIC Tapped Hoard'
        : /SYNTHETIC (Plain Zombie|Zombie Mourner)/,
  );
  // One token for each Zombie, all of them tapped: none came untapped and was tapped afterwards.
  const zombies = await mine(page, MY_ZOMBIES).count();
  expect(zombies).toBeGreaterThanOrEqual(2);
  await expect(mine(page, 'Treasure')).toHaveCount(zombies);
  await expect(tapped).toHaveCount(zombies);
  await expect(logText(page).getByText('You create a Treasure token.')).toHaveCount(zombies);
  expect(errors).toEqual([]);
});

test('the stack says "where X is the number of Zombies you control" for a trigger that reads it', async ({
  page,
}) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await start(page, 1);
  const mourner = 'SYNTHETIC Zombie Mourner';
  await playUntil(
    page,
    async () =>
      (await stack(page)
        .getByText(/where X is/)
        .count()) > 0,
    async () => ((await mine(page, mourner).count()) === 0 ? mourner : null),
  );
  const item = stackItems(page).first();
  await expect(item).toContainText(
    'At the beginning of your upkeep, you draw X cards. You lose X life, where X is the number of Zombies you control',
  );
  // X is read as the instructions run (CR 107.3c): the life lost is the number of Zombies there are now.
  const zombies = await mine(page, MY_ZOMBIES).count();
  await primary(page).click();
  await settled(page);
  const lines = logText(page).getByText(/^Your life: \d+ to \d+\.$/);
  await expect(lines).toHaveCount(1);
  const [, before, after] = /(\d+) to (\d+)/.exec(await lines.first().innerText()) ?? [];
  expect(Number(before) - Number(after)).toBe(zombies);
  expect(errors).toEqual([]);
});

test('a bite: the creature deals the damage, the target is chosen, nothing is dealt back', async ({
  page,
}) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await start(page, 1);
  const bite = 'SYNTHETIC Gnash Down';
  await playUntil(
    page,
    async () =>
      (await handCard(page, bite).count()) > 0 &&
      (await mine(page, MY_ZOMBIES).count()) > 0 &&
      (await theirs(page, THEIR_CREATURES).count()) > 0 &&
      (await stackItems(page).count()) === 0,
    async () =>
      (await mine(page, MY_ZOMBIES).count()) === 0
        ? /SYNTHETIC (Plain Zombie|Zombie Mourner)/
        : null,
  );
  const yours = await mine(page, MY_ZOMBIES).first().locator('.board-tile-name').innerText();
  await handCard(page, bite).first().click();
  await settled(page);
  await expect(bar(page)).toContainText(`Choose a target for ${bite}`);
  const chips = page.getByRole('region', { name: 'Legal targets' }).getByRole('button');
  // Both slots are in one list: the creature that bites, then the creature that is bitten.
  await chips.filter({ hasText: yours }).first().click();
  await chips.filter({ hasText: THEIR_CREATURES }).first().click();
  await primary(page).click();
  await settled(page);
  await primary(page).click();
  await settled(page);
  // The log names the creature as the source of the damage, and no damage came back.
  await expect(logText(page).getByText(new RegExp(`${yours} deals \\d+ damage to `))).toHaveCount(
    1,
  );
  await expect(logText(page).getByText(new RegExp(`deals \\d+ damage to ${yours}`))).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('each player sacrifices a creature: whose sacrifice it is, and both players choose', async ({
  page,
}) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await start(page, 1);
  const marauder = 'SYNTHETIC Bag Marauder';
  const panel = page.getByRole('region', { name: 'Permanents to sacrifice' });
  await playUntil(
    page,
    async () => panel.isVisible(),
    async () => {
      // A second creature first, so that the sacrifice is a choice, and an opponent who has one too.
      if ((await theirs(page, THEIR_CREATURES).count()) === 0) return null;
      return (await mine(page, MY_ZOMBIES).count()) === 0
        ? /SYNTHETIC (Plain Zombie|Zombie Mourner)/
        : marauder;
    },
  );
  await expect(panel).toContainText(`Sacrifice for ${marauder}`);
  await expect(panel.locator('[data-sacrifice-cause]')).toHaveText(
    `Your sacrifice, from your ${marauder}: Each player sacrifices a creature of their choice. Each player chooses their own, the active player first.`,
  );
  await panel.getByRole('button').first().click();
  await primary(page).click();
  await settled(page);
  await expect(logText(page)).toContainText('You sacrifice');
  await expect(logText(page)).toContainText('Opponent sacrifices');
  expect(errors).toEqual([]);
});
