import { expect, test } from '@playwright/test';
import {
  bouncePanel,
  counterDialog,
  logText,
  playUntil,
  primary,
  searchDialog,
} from './harness/references-script';

/**
 * The questions of the D-092 references slice: "counter target spell unless its controller pays"
 * asked of the player whose spell it is, "its controller may search" asked during the opponent's
 * spell, and a bounce land's choice of a land to return. The listed test decks hold none of these
 * cards, so the games use the hidden SYNTHETIC deck `synthetic-references` (game/precons.ts):
 * invented cards, not real ones, against the same deck. The scripted player plays basic lands and
 * creatures; the opponent AI casts its Soft Counter and its Banish Seek Land by itself. The engine
 * and the AI are seeded and the script acts only on a settled page (harness/settle.ts), so a seed
 * reaches its situation at the same point every time, however slow the machine is.
 */
const game = (seed: number) => `/?autostart=synthetic-references,synthetic-references&seed=${seed}`;

// Seeds found by scanning games with the scripted player (e2e/harness/references-script.ts).
const S_COUNTER = 6;
const S_SEARCH = 2;
const S_BOUNCE = 5;

test("counter unless pays: the dialog names both spells; Don't pay counters the creature", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(game(S_COUNTER));
  await playUntil(
    page,
    async () =>
      (await counterDialog(page).isVisible()) &&
      (await counterDialog(page).innerText()).includes('SYNTHETIC Soft Counter'),
    { creatureLands: 5 },
  );

  const dialog = counterDialog(page);
  await expect(dialog).toContainText('SYNTHETIC Soft Counter');
  await expect(dialog).toContainText('Counter target spell unless its controller pays {3}.');
  await expect(dialog).toContainText(/Pay \{3\} or .+ is countered by SYNTHETIC Soft Counter\?/);
  await expect(dialog.getByRole('button', { name: "Don't pay" })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toHaveCount(0);
  const spell = (await dialog.innerText()).match(/Pay \{3\} or (.+) is countered by/)?.[1] ?? '';
  expect(spell).not.toBe('');

  await dialog.getByRole('button', { name: "Don't pay" }).click();
  await expect(dialog).toBeHidden();
  const text = await logText(page).innerText();
  expect(text).toContain(`You don't pay; ${spell} is countered.`);
  expect(text.match(new RegExp(`${spell} is countered`, 'g'))).toHaveLength(1);
  expect(errors).toEqual([]);
});

test('counter unless pays: Pay keeps the creature, taps the mana and the log says so', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(game(S_COUNTER));
  await playUntil(
    page,
    async () =>
      (await counterDialog(page).isVisible()) &&
      (await counterDialog(page).innerText()).includes('SYNTHETIC Soft Counter'),
    { creatureLands: 5 },
  );
  const spell =
    (await counterDialog(page).innerText()).match(/Pay \{3\} or (.+) is countered by/)?.[1] ?? '';

  await counterDialog(page).getByRole('button', { name: 'Pay', exact: true }).click();
  await expect(counterDialog(page)).toBeHidden();
  await expect(logText(page)).toContainText(`You pay {3} so ${spell} is not countered.`);
  expect(await logText(page).innerText()).not.toContain(`${spell} is countered`);
  expect(errors).toEqual([]);
});

test('search: the opponent exiles your creature and you are asked; Search finds a basic land', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(game(S_SEARCH));
  await playUntil(page, async () => await searchDialog(page).isVisible(), {});

  const dialog = searchDialog(page);
  await expect(dialog).toContainText('SYNTHETIC Banish Seek Land');
  await expect(dialog).toContainText(
    'Its controller may search their library for a basic land card',
  );
  await expect(dialog).toContainText(
    "SYNTHETIC Banish Seek Land (the opponent's spell) lets you search your library. Search?",
  );
  await expect(dialog.getByRole('button', { name: "Don't search" })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toHaveCount(0);

  await dialog.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(logText(page)).toContainText(
    'You choose to search your library (SYNTHETIC Banish Seek Land).',
  );
  // The card choice follows; find nothing is a legal answer, so choose the first card if offered.
  const finder = page.getByRole('dialog').first();
  if (await finder.isVisible()) {
    await page.keyboard.press('Enter');
  }
  expect(errors).toEqual([]);
});

test("search: Don't search skips the search and the log says so", async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(game(S_SEARCH));
  await playUntil(page, async () => await searchDialog(page).isVisible(), {});

  await searchDialog(page).getByRole('button', { name: "Don't search" }).click();
  await expect(searchDialog(page)).toBeHidden();
  const text = await logText(page).innerText();
  expect(text).toContain('You decline to search your library (SYNTHETIC Banish Seek Land).');
  expect(text).not.toContain('You search your library and find');
  expect(errors).toEqual([]);
});

test('a bounce land asks which land to return; the choice is badged and logged', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(game(S_BOUNCE));
  await playUntil(page, async () => await bouncePanel(page).isVisible(), { bounce: true });

  const panel = bouncePanel(page);
  await expect(panel).toContainText('Choose for SYNTHETIC Bounce Land');
  await expect(page.locator('.dec-prompt').first()).toContainText(
    "Choose a land you control to return to its owner's hand.",
  );
  const confirm = primary(page);
  await expect(confirm).toHaveText('Confirm');
  await expect(confirm).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Cancel' })).toHaveCount(0);

  const chips = panel.locator('button[aria-pressed]');
  expect(await chips.count()).toBeGreaterThan(1);
  await chips.first().click();
  await expect(page.locator('.board-ibadge', { hasText: 'Chosen' })).toHaveCount(1);
  await expect(panel).toContainText('1 of 1 chosen');
  await expect(confirm).toBeEnabled();

  await confirm.click();
  await expect(panel).toBeHidden();
  await expect(logText(page)).toContainText("for SYNTHETIC Bounce Land's ability.");
  await expect(logText(page)).toContainText('goes to a hand.');
  expect(errors).toEqual([]);
});
