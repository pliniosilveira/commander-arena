import { expect, type Page, test } from '@playwright/test';
import { handCard, mine } from './harness/locators';
import { settled } from './harness/settle';

/**
 * The questions of the Angels slice (D-149): the cost of blocking (what the declare-blockers dock says, the total for the chosen
 * blockers, the payment after them), the choice of what to proliferate, and a spell cast by tapping creatures. The listed test decks
 * hold none of these cards, so the games use the hidden SYNTHETIC decks `synthetic-angels` and `synthetic-angels-fliers`
 * (game/precons.ts): invented cards, not real ones. A scripted player plays lands, casts the cards that are not kept (Mana Birds,
 * to have creatures) and keeps the others in the hand until the question is on screen. The engine and the AI are seeded, so a given
 * seed reaches it at the same point every time; the loop acts only on a settled page. A seed list is tried in order, so a change of
 * the AI that moves a game does not need a new seed at once.
 */
const FLIERS = 'synthetic-angels-fliers';
const ANGELS = 'synthetic-angels';
const game = (seed: number, human: string, ai: string) => `/?autostart=${human},${ai}&seed=${seed}`;

const SHOTS =
  '/tmp/claude-0/-workspace/4fe7b6d7-c54c-5b64-9a0a-fc1007e1684e/scratchpad/angels-shots';

const primary = (page: Page) => page.locator('.dec-bar [data-dec-primary]');
const prompt = (page: Page) => page.locator('.dec-prompt');
const logText = (page: Page) => page.getByRole('log');
const endDiscard = (page: Page) => page.getByRole('dialog', { name: /^Discard/ });

interface Play {
  /** True when the situation is on screen; asked only when no dialog is open. */
  readonly ready: () => Promise<boolean>;
  /** Cards matching this stay in the hand (lands and every other card are played when they can be). */
  readonly keep: RegExp;
  /** The cards the cleanup step's discard gives up first. */
  readonly fodder?: RegExp;
}

/** Plays on until `ready` holds; false when the game ends or `steps` actions did not reach it. */
async function playUntil(page: Page, play: Play, steps = 700): Promise<boolean> {
  const keepButton = page.getByRole('button', { name: 'Keep', exact: true });
  for (let step = 0; step < steps; step += 1) {
    await settled(page);
    if (await keepButton.isVisible()) {
      await keepButton.click();
      continue;
    }
    if (await endDiscard(page).isVisible()) {
      const cards = endDiscard(page).locator('.dec-card-button');
      const spare = cards.filter(
        play.fodder === undefined ? { hasNotText: play.keep } : { hasText: play.fodder },
      );
      await ((await spare.count()) > 0 ? spare : cards).first().click();
      await endDiscard(page).getByRole('button', { name: 'Confirm' }).click();
      continue;
    }
    if ((await page.locator('.dec-overlay').count()) === 0 && (await play.ready())) return true;
    if ((await page.getByText(/ wins\.$/).count()) > 0) return false;
    const cards = page.locator('.board-hand .is-clickable').filter({ hasNotText: play.keep });
    if ((await cards.count()) > 0) {
      await cards.first().click();
    } else if ((await primary(page).count()) > 0 && (await primary(page).isEnabled())) {
      await primary(page).click();
    }
  }
  return false;
}

/** Tries each seed in turn until the game reaches the situation. */
async function reach(
  page: Page,
  seeds: readonly number[],
  start: (seed: number) => string,
  play: Play,
): Promise<number> {
  for (const seed of seeds) {
    await page.goto(start(seed));
    if (await playUntil(page, play)) return seed;
  }
  throw new Error(`no seed of ${seeds.join(', ')} reaches the situation`);
}

/** Passes priority until `region` is on screen (the spell or ability resolving asks its question). */
async function passUntil(page: Page, region: ReturnType<Page['locator']>): Promise<void> {
  for (let step = 0; step < 30; step += 1) {
    await settled(page);
    if (await region.isVisible()) return;
    if ((await primary(page).count()) > 0 && (await primary(page).isEnabled())) {
      await primary(page).click();
    }
  }
  throw new Error('the question never came');
}

test('Cost of blocking: the dock says what a block costs, Confirm waits for blocks the mana pays, the payment follows', async ({
  page,
}) => {
  test.setTimeout(420_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const cost = page.getByRole('region', { name: 'Cost of blocking' });
  await reach(page, [2, 3, 5, 8], (seed) => game(seed, FLIERS, FLIERS), {
    keep: /SYNTHETIC (?!Mana Bird)/,
    ready: async () => (await cost.isVisible()) && (await primary(page).isVisible()),
  });
  // The payment of the tax is asked by hand: the toggle is on from here.
  await page.getByRole('button', { name: 'Manual mana' }).click();

  await expect(cost.locator('[data-block-cost]')).toContainText(
    /^Blocking costs \{\d+\} per creature \(SYNTHETIC Tithe Angel\)\. Your mana covers (\d+ creatures?|none) now\.$/,
  );
  await expect(primary(page)).toHaveText('No Blocks');
  await page.screenshot({ path: `${SHOTS}/block-cost-dock.png` });

  // One blocker on one attacker: the total is said, and the block is paid for once the declaration is made.
  const blockers = page.locator('[data-field-seat="0"] .board-tile.is-clickable');
  await blockers.first().click();
  await page.locator('[data-field-seat="1"] .board-tile.is-clickable').first().click();
  await expect(primary(page)).toHaveText('Block (1)');
  await expect(cost.locator('[data-block-cost]')).toContainText('1 chosen:');
  await expect(page.locator('.dec-bar')).toContainText('These blocks cost {');
  await page.screenshot({ path: `${SHOTS}/block-cost-chosen.png` });

  await primary(page).click();
  const pay = page.getByRole('region', { name: 'Payment' });
  await expect(pay).toBeVisible();
  await expect(pay.locator('[data-block-tax]')).toContainText(
    'will block once this is paid. The cost is from SYNTHETIC Tithe Angel.',
  );
  await expect(prompt(page)).toContainText('so this creature can block: tap your mana sources.');
  await expect(page.getByRole('button', { name: 'Choose other blockers' })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/block-cost-payment.png` });

  await page.getByRole('button', { name: 'Auto-pay' }).click();
  await expect(logText(page)).toContainText(/You? blocks?|blocks SYNTHETIC/);
  expect(errors).toEqual([]);
});

test('Proliferate: the dialog lists permanents with counters and players with poison, any number, and Confirm works with none', async ({
  page,
}) => {
  test.setTimeout(420_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const growth = 'SYNTHETIC Spreading Growth';
  await reach(page, [12, 1, 2, 3, 4, 5, 6, 7], (seed) => game(seed, ANGELS, 'swamp-forest'), {
    keep: /SYNTHETIC (?!Chronicle Book)/,
    fodder: /SYNTHETIC (?!Chronicle Book|Spreading Growth)/,
    // The Book enters with a page counter, so there is something to proliferate; the Growth costs {G}.
    ready: async () =>
      (await handCard(page, growth).count()) > 0 &&
      (await mine(page, 'SYNTHETIC Chronicle Book').count()) > 0,
  });
  await handCard(page, growth).first().click();
  const panel = page.getByRole('dialog', { name: 'Proliferate' });
  await passUntil(page, panel);

  await expect(panel.locator('h2')).toHaveText('Proliferate');
  await expect(panel.locator('.dec-source-text')).toContainText(`${growth}: Proliferate.`);
  await expect(panel.locator('[data-proliferate-help]')).toContainText(
    'another counter of each kind',
  );
  const confirm = panel.locator('[data-dec-primary]');
  // Nothing chosen is an answer, and the button says what it does.
  await expect(confirm).toHaveText('Proliferate nothing');
  await expect(confirm).toBeEnabled();
  const chips = panel.locator('button.dec-chip').filter({ hasText: /counter/ });
  await expect(chips.first()).toContainText('SYNTHETIC Chronicle Book (1 page counter), yours');
  await page.screenshot({ path: `${SHOTS}/proliferate-dialog.png` });

  // The Book is chosen: the label counts it; "Choose none" takes it back; "Choose all" picks every one.
  await chips.first().click();
  await expect(confirm).toHaveText('Proliferate (1)');
  await panel.locator('[data-proliferate-none]').click();
  await expect(confirm).toHaveText('Proliferate nothing');
  await panel.locator('[data-proliferate-all]').click();
  await expect(confirm).toContainText(/^Proliferate \(\d+\)$/);
  await page.screenshot({ path: `${SHOTS}/proliferate-chosen.png` });

  await confirm.click();
  await settled(page);
  await expect(logText(page)).toContainText('You proliferate.');
  await expect(panel).toBeHidden();
  expect(errors).toEqual([]);
});

test('Cast by tapping creatures: the menu names the creatures, the dialog asks which to tap, the log says how it was cast', async ({
  page,
}) => {
  test.setTimeout(420_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const angel = 'SYNTHETIC Sky Blade Angel';
  const birds = mine(page, 'SYNTHETIC Mana Bird');
  await reach(page, [16, 3, 6, 10], (seed) => game(seed, FLIERS, 'swamp-forest'), {
    keep: /SYNTHETIC (?!Mana Bird)/,
    // Five fliers: with exactly four there is nothing to choose, and the engine does not ask.
    ready: async () => (await handCard(page, angel).count()) > 0 && (await birds.count()) >= 5,
  });
  await handCard(page, angel).first().click();
  const menu = page.getByRole('group', { name: 'Choose an ability' });
  await expect(menu).toBeVisible();
  await expect(
    menu.getByRole('button', { name: 'Cast for {W}, tapping four creatures with flying' }),
  ).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/tap-alt-menu.png` });
  await menu.getByRole('button', { name: /tapping four creatures/ }).click();

  const panel = page.getByRole('region', { name: 'Permanents to tap' });
  await expect(panel).toBeVisible();
  await expect(prompt(page)).toHaveText(
    `Choose 4 untapped creatures to tap as the alternative cost of ${angel}.`,
  );
  await expect(panel.locator('h3')).toHaveText(`Tap to cast ${angel}`);
  await expect(primary(page)).toBeDisabled();
  await page.screenshot({ path: `${SHOTS}/tap-alt-dialog.png` });
  const chips = panel.locator('button.dec-chip');
  for (let i = 0; i < 4; i += 1) await chips.nth(i).click();
  await expect(primary(page)).toBeEnabled();
  await primary(page).click();
  await settled(page);
  await expect(logText(page)).toContainText(new RegExp(`You cast ${angel} by tapping creatures`));
  expect(errors).toEqual([]);
});
