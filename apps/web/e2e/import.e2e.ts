import { expect, type Page, test } from '@playwright/test';
import { fakeScryfall } from './harness/synthetic-scryfall';

/**
 * The deck import flow (M4). Scryfall is replaced by intercepted requests that answer
 * `POST /cards/collection` with SYNTHETIC cards generated from the requested names: nothing here is
 * real card data. The bears are vanilla (supported); every fourth one has the text "Draw a card.",
 * which the parser does not read yet (unsupported). The fake lives in harness/synthetic-scryfall.ts.
 */

/** The same list with only the supported bears (none whose number divides by four): all supported. */
function supportedList(): string {
  const lines = ['Commander', '1 SYNTHETIC Commander', '', 'Deck', '69 Plains'];
  for (let n = 1; n <= 39; n += 1) {
    if (n % 4 !== 0) lines.push(`1 SYNTHETIC Bear ${String(n).padStart(2, '0')}`);
  }
  return `${lines.join('\n')}\n`;
}

/** One commander, sixty Plains and 39 distinct bears: 100 cards, nine of them unsupported. */
function hundredCardList(): string {
  const lines = ['Commander', '1 SYNTHETIC Commander', '', 'Deck', '60 Plains'];
  for (let n = 1; n <= 39; n += 1) lines.push(`1 SYNTHETIC Bear ${String(n).padStart(2, '0')}`);
  return `${lines.join('\n')}\n`;
}

async function openImport(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Import a deck' }).click();
  await expect(page.getByRole('heading', { name: 'Import a deck' })).toBeVisible();
}

async function importHundred(page: Page, text = hundredCardList()): Promise<void> {
  await page.getByLabel('Deck name').fill('SYNTHETIC Hundred');
  await page.getByLabel(/^Decklist/).fill(text);
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(page.getByTestId('coverage-headline')).toBeVisible({ timeout: 30_000 });
}

test('import a 100-card list, read the coverage report and see why a card is unsupported', async ({
  page,
}) => {
  await fakeScryfall(page);
  await openImport(page);
  await importHundred(page);

  await expect(page.getByTestId('coverage-headline')).toHaveText('91 of 100 cards supported');
  // The nine unsupported cards make the deck invalid (D-056), though it follows the Commander rules.
  await expect(
    page.getByRole('region', { name: 'Deck check' }).getByText(/9 cards have abilities the engine/),
  ).toBeVisible();
  const table = page.getByRole('table');
  await expect(table.getByRole('row')).toHaveCount(1 + 1 + 1 + 39); // head, commander, Plains, bears
  await expect(table.getByText('Unsupported', { exact: true })).toHaveCount(9);

  // The template panel groups what blocks the deck by sentence shape (nine bears share one).
  await page.getByText(/What blocks this deck\?/).click();
  await expect(page.getByTestId('template-panel')).toContainText('9 cards');
  await expect(page.getByTestId('template-panel')).toContainText('Draw a card.');
  await expect(page.getByTestId('block-split')).toContainText(/Of 9 unsupported cards: /);

  // The filter keeps only the unsupported cards.
  await page.getByLabel(/Unsupported only/).check();
  await expect(table.getByRole('row')).toHaveCount(1 + 9);
  await page.getByLabel('All cards').check();

  // "Why unsupported?" shows the Oracle text with the unparsed ability marked.
  await page.getByRole('button', { name: /Why unsupported\? for SYNTHETIC Bear 04/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeFocused();
  await expect(dialog).toContainText('be played yet');
  await expect(dialog.locator('mark')).toContainText('Draw a card.');
  await expect(dialog).toContainText('Closest rule');
  // The v2 diagnostic says in words whether the grammar or the engine is the limit.
  await expect(dialog.getByTestId('unparsed-reason')).toContainText(
    /The grammar (does not read this wording yet|reads this, but the engine cannot run it yet)/,
  );
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  // Focus returns to the button that opened it.
  await expect(
    page.getByRole('button', { name: /Why unsupported\? for SYNTHETIC Bear 04/ }),
  ).toBeFocused();
});

test('a deck with an unsupported card cannot be played, and the panel names the problem', async ({
  page,
}) => {
  await fakeScryfall(page);
  await openImport(page);
  await importHundred(page);

  const results = page.getByTestId('import-results');
  await expect(results).toContainText('The deck cannot be played yet');
  await expect(results).toContainText('abilities the engine cannot run yet');
  // The deck check lists the unsupported cards as an error, by name.
  await expect(results.getByText(/SYNTHETIC Bear 04/).first()).toBeVisible();
  await expect(page.getByText('Play anyway')).toHaveCount(0);
});

async function stubGithub(page: Page): Promise<void> {
  // GitHub itself is not reached: the new tab is answered with a blank page, and its address is read.
  await page
    .context()
    .route('https://github.com/**', (route) =>
      route.fulfill({ contentType: 'text/html', body: '<title>issue</title>' }),
    );
}

test('a deck with unsupported cards has one button that opens GitHub with the issue filled in', async ({
  page,
}) => {
  await fakeScryfall(page);
  await stubGithub(page);
  await openImport(page);
  await importHundred(page);

  const button = page.getByTestId('report-issue');
  await expect(button).toBeVisible();
  const [popup] = await Promise.all([page.waitForEvent('popup'), button.click()]);
  const url = new URL(popup.url());
  expect(url.origin + url.pathname).toBe(
    'https://github.com/pliniosilveira/commander-arena/issues/new',
  );
  expect(url.searchParams.get('title')).toBe('deck support SYNTHETIC Hundred');
  const body = url.searchParams.get('body') ?? '';
  expect(body).toContain('Commander\n1x SYNTHETIC Commander');
  expect(body).toContain('Template report for "SYNTHETIC Hundred": 9 unsupported card(s).');
  expect(body).toContain('Unsupported cards (9): ');
  // Each unsupported card: its cost and type line, and why it is blocked.
  expect(body).toContain('### SYNTHETIC Bear 04');
  expect(body).toContain('### SYNTHETIC Bear 36');
  // The card data, compressed: what `pnpm corpus:from-issue` reads back into the golden corpus.
  expect(body).toContain('Card data for the golden corpus (9 card(s), gzip+base64url)');
  await expect(page.getByTestId('import-results')).toContainText('GitHub opened');
});

test('a deck whose cards are all supported has no button to ask for support', async ({ page }) => {
  await fakeScryfall(page);
  await openImport(page);
  await importHundred(page, supportedList());
  await expect(page.getByTestId('coverage-headline')).toBeVisible();
  await expect(page.getByTestId('report-issue')).toHaveCount(0);
});

test('an imported deck whose cards are all supported is saved and played from the menu (issue 19)', async ({
  page,
}) => {
  await fakeScryfall(page);
  await openImport(page);
  await importHundred(page, supportedList());

  await expect(page.getByTestId('coverage-headline')).toContainText('100 of 100');
  // There is no "Play this deck" box on the screen: the results say where the deck is played.
  await expect(page.getByRole('button', { name: 'Play this deck' })).toHaveCount(0);
  await expect(page.getByText('Play this deck')).toHaveCount(0);
  await expect(page.getByTestId('play-note')).toContainText('The deck is ready.');
  await page.getByRole('button', { name: 'Save deck' }).click();
  await expect(page.getByText('Saved "SYNTHETIC Hundred".')).toBeVisible();
  await page.getByRole('button', { name: 'Back to menu' }).click();
  await page
    .locator('fieldset', { hasText: 'Your deck' })
    .getByRole('radio', { name: /SYNTHETIC Hundred/ })
    .check();
  await page.getByRole('button', { name: 'Start game' }).click();

  // The first decision is the mulligan, with cards of this deck in the opening hand.
  const mulligan = page.getByRole('dialog', { name: 'Opening hand' });
  await expect(mulligan).toBeVisible({ timeout: 30_000 });
  const cards = mulligan.locator('.dec-hand .dec-card');
  await expect(cards.first()).toBeVisible();
  const text = (await mulligan.locator('.dec-hand').innerText()).replaceAll('\n', ' ');
  expect(text).toMatch(/SYNTHETIC Bear|Plains|SYNTHETIC Commander/);
  expect(text).not.toMatch(/Isamaru|Yargle|Llanowar/);
});

test('saved decks: save, list, open and delete', async ({ page }) => {
  await fakeScryfall(page);
  await openImport(page);
  await page.getByLabel('Deck name').fill('SYNTHETIC Saved');
  await page.getByLabel(/^Decklist/).fill(hundredCardList());
  await page.getByRole('button', { name: 'Save deck' }).click();
  await expect(page.getByText('Saved "SYNTHETIC Saved".')).toBeVisible();

  await page.getByRole('button', { name: 'Your decks' }).click();
  await expect(page.locator('strong', { hasText: 'SYNTHETIC Saved' })).toBeVisible();
  await page.getByRole('button', { name: /^Open/ }).first().click();
  await expect(page.getByTestId('coverage-headline')).toHaveText('91 of 100 cards supported', {
    timeout: 30_000,
  });
  await expect(page.getByLabel('Deck name')).toHaveValue('SYNTHETIC Saved');

  await page.getByRole('button', { name: 'Your decks' }).click();
  await page
    .getByRole('button', { name: /^Delete/ })
    .first()
    .click();
  await expect(page.locator('strong', { hasText: 'SYNTHETIC Saved' })).toHaveCount(0);
});

test('a commander chosen after the import is still the commander after Save and Open (issue 123)', async ({
  page,
}) => {
  await fakeScryfall(page);
  await openImport(page);
  // The list marks no commander: the commander is one more line of the deck.
  const unmarked = hundredCardList().replace('Commander\n1 SYNTHETIC Commander\n\nDeck\n', '');
  await importHundred(page, `${unmarked}1 SYNTHETIC Commander\n`);
  await page.getByRole('checkbox', { name: /SYNTHETIC Commander/ }).check();
  await page.getByRole('button', { name: 'Use this commander' }).click();
  await expect(page.getByRole('heading', { name: 'Choose your commander' })).toHaveCount(0, {
    timeout: 30_000,
  });
  await page.getByRole('button', { name: 'Save deck' }).click();
  await expect(page.getByText('Saved "SYNTHETIC Hundred".')).toBeVisible();

  // Leave and come back: the commander is read from the saved deck, not asked for again.
  await page.getByRole('button', { name: 'Your decks' }).click();
  await page.getByRole('button', { name: /^Open/ }).first().click();
  await expect(page.getByTestId('coverage-headline')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('heading', { name: 'Choose your commander' })).toHaveCount(0);
  await expect(page.getByLabel(/^Decklist/)).toHaveValue(/SYNTHETIC Commander \*CMDR\*/);
});

test('the example button fills in the real list of the installed precon', async ({ page }) => {
  await openImport(page);
  const example = page.getByRole('button', { name: 'Fill in an example' });
  await example.click();
  await expect(page.getByLabel('Deck name')).not.toHaveValue('');
  await expect(page.getByLabel(/^Decklist/)).toHaveValue(/Commander/);
});

test('parse errors and unknown names', async ({ page }) => {
  await fakeScryfall(page);
  await openImport(page);
  await page.getByLabel(/^Decklist/).fill('Commander\n1 Nonexistent Card Name\n\n???\n');
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(page.getByText(/Cards Scryfall could not find/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('import-results').getByText('Nonexistent Card Name')).toBeVisible();
});

test('offline: every Scryfall request fails and the screen says so without crashing', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('https://api.scryfall.com/**', (route) => route.abort());
  await openImport(page);
  await page.getByLabel('Deck name').fill('SYNTHETIC Offline');
  await page.getByLabel(/^Decklist/).fill(hundredCardList());
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(page.getByText(/Scryfall could not be reached/).first()).toBeVisible({
    timeout: 60_000,
  });
  // The screen still works: go back to the menu.
  await page.getByRole('button', { name: 'Back to menu' }).click();
  await expect(page.getByRole('button', { name: 'Start game' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('the menu starts the installed precon without any connection', async ({ page }) => {
  await page.route('https://api.scryfall.com/**', (route) => route.abort());
  await page.goto('/');
  await page.getByRole('button', { name: 'Start game' }).click();
  await expect(page.getByRole('dialog', { name: 'Opening hand' })).toBeVisible({ timeout: 30_000 });
});

test('a hidden test deck still starts by id without any connection', async ({ page }) => {
  await page.route('https://api.scryfall.com/**', (route) => route.abort());
  await page.goto('/?autostart=white-knights,swamp-forest&seed=7');
  await expect(page.getByRole('dialog', { name: 'Opening hand' })).toBeVisible({ timeout: 15_000 });
});
