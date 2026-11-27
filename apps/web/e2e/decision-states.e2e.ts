import { expect, type Page, test } from '@playwright/test';
import { build } from 'vite';

/**
 * Decisions the play-through e2e tests do not reach, drawn from states built with the engine's
 * scenario DSL (harness/decisions-entry.tsx): the untap checklist, the attack-target reselect, the
 * pay-life number, the two piles, and the graveyard zone viewer. Each state is mounted on the real
 * game screen; the cards are SYNTHETIC fixtures or real ones.
 */
let script = '';
let css = '';

test.beforeAll(async () => {
  const output = await build({
    configFile: false,
    logLevel: 'silent',
    define: { 'process.env.NODE_ENV': '"production"' },
    build: {
      write: false,
      minify: false,
      cssCodeSplit: false,
      lib: {
        entry: new URL('./harness/decisions-entry.tsx', import.meta.url).pathname,
        name: 'Decisions',
        formats: ['iife'],
      },
    },
  });
  for (const result of Array.isArray(output) ? output : [output]) {
    if (!('output' in result)) continue;
    for (const item of result.output) {
      if (item.type === 'chunk' && item.isEntry) script = item.code;
      else if (item.type === 'asset' && item.fileName.endsWith('.css')) css += String(item.source);
    }
  }
  if (script === '') throw new Error('the decision states bundle was not built');
});

async function show(page: Page, state: string): Promise<void> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('about:blank');
  await page.setContent('<!doctype html><html><head></head><body></body></html>');
  if (css !== '') await page.addStyleTag({ content: css });
  await page.addScriptTag({ content: `${script}\nDecisions.mount(${JSON.stringify(state)});` });
  expect(errors).toEqual([]);
  await expect(page.getByTestId('game')).toBeVisible();
}

test('untap step: a checklist of the tapped permanents that may stay tapped', async ({ page }) => {
  await show(page, 'untap');
  const dialog = page.getByRole('dialog', { name: 'Untap step' });
  await expect(dialog).toBeVisible();
  expect(await dialog.getByRole('checkbox').count()).toBeGreaterThanOrEqual(2);
});

test('attack target: one button per player or planeswalker, the current one marked', async ({
  page,
}) => {
  await show(page, 'attack-target');
  const dialog = page.getByRole('dialog', { name: 'Reselect attack' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('attacking now');
});

test('pay any amount of life: a number from 0 to the life total', async ({ page }) => {
  await show(page, 'life-paid');
  await expect(page.getByRole('dialog')).toContainText('pay any amount of life');
});

test('two piles: the player who separates sees a dock panel', async ({ page }) => {
  await show(page, 'piles-separate');
  await expect(
    page.getByRole('region', { name: 'Cards to separate into two piles' }),
  ).toBeVisible();
});

test('two piles: the player who chooses sees both piles in a modal', async ({ page }) => {
  await show(page, 'piles-choose');
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel(/^Pile 1/)).toBeVisible();
  await expect(dialog.getByLabel(/^Pile 2/)).toBeVisible();
});

test('graveyard: the zone viewer lists the cards of the graveyard that was opened', async ({
  page,
}) => {
  await show(page, 'graveyard');
  await page.getByRole('button', { name: /graveyard, 4 cards/i }).click();
  const dialog = page.getByRole('dialog', { name: /graveyard/i });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.board-zone-card')).toHaveCount(4);
});

test('card name: a text box that has the focus, with the names the game shows', async ({
  page,
}) => {
  await show(page, 'card-name');
  const dialog = page.getByRole('dialog', { name: 'Choose a card name' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Card name')).toBeVisible();
});

test('party: a dialog with a row of creatures for each party type', async ({ page }) => {
  await show(page, 'party');
  await expect(page.getByRole('dialog', { name: 'Choose a party' })).toBeVisible();
});
