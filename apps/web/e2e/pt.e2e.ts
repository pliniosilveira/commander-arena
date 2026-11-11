import { expect, type Page, test } from '@playwright/test';
import { settled } from './harness/settle';

/**
 * Counted and defined power and toughness (D-109, D-115), in the hidden SYNTHETIC deck `synthetic-pt`
 * (game/precons.ts: invented cards, not real ones) against "Rats and Spiders". A scripted player plays
 * every land and spell it can and acts once on each settled page. A card that prints a star for power and
 * toughness shows `*` in the hand with its ability in the title, and on the battlefield its tile shows the number the ability
 * gives: for "equal to the number of lands you control", as many as there are lands, which grows with
 * every land played. The engine and the AI are seeded, so a seed reaches the same game every time.
 */
const game = (seed: number) => `/?autostart=synthetic-pt,swamp-forest&seed=${seed}`;

// Any seed that plays a Land Lurker and then another land passes; this one does within a few turns.
const SEED = 1;

const primary = (page: Page) => page.locator('[data-dec-primary]');
const LURKER = 'SYNTHETIC Land Lurker';

const lands = (page: Page) =>
  page
    .locator('[data-field-seat="0"] .board-tile')
    .filter({ has: page.locator('.board-tile-name', { hasText: /^(Forest|Mountain|Island)$/ }) })
    .count();
const lurker = (page: Page) =>
  page
    .locator('[data-field-seat="0"] .board-tile')
    .filter({ has: page.locator('.board-tile-name', { hasText: LURKER }) });

test('a */* creature: * in the hand, then the land count on its tile as lands enter', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(game(SEED));
  const keepButton = page.getByRole('button', { name: 'Keep', exact: true });
  const seen = new Set<number>();
  let star = false;
  for (let step = 0; step < 500 && !(star && seen.size >= 2); step += 1) {
    await settled(page);
    if (await keepButton.isVisible()) {
      await keepButton.click();
      continue;
    }
    // In the hand it prints */*: the corner says so, and the title says what defines it.
    const inHand = page.locator('.board-hand .board-card', { hasText: LURKER });
    if ((await inHand.count()) > 0 && !star) {
      const stat = inHand.first().locator('.board-stat');
      await expect(stat).toHaveText('*/*');
      await expect(stat).toHaveAttribute(
        'title',
        /^Defined by an ability: equal to the number of lands you control \(now \d+\/\d+\)$/,
      );
      star = true;
    }
    // On the battlefield it is the number, and the number is the land count.
    if ((await lurker(page).count()) > 0) {
      const n = await lands(page);
      const tile = lurker(page).first();
      await expect(tile.locator('.board-stat')).toHaveText(`${n}/${n}`);
      await expect(tile.locator('.board-stat')).toHaveAttribute(
        'title',
        'Defined by an ability: equal to the number of lands you control',
      );
      seen.add(n);
    }
    const cards = page.locator('.board-hand .is-clickable');
    if ((await cards.count()) > 0) {
      await cards.first().click();
    } else if ((await primary(page).count()) > 0 && (await primary(page).isEnabled())) {
      await primary(page).click();
    }
  }
  expect(star, 'a Land Lurker was in the hand').toBe(true);
  expect([...seen].length, 'the tile followed at least two land counts').toBeGreaterThanOrEqual(2);
  expect(errors).toEqual([]);
});

test('the preview of a */* card in play lists what defines it', async ({ page }) => {
  await page.goto(game(SEED));
  const keepButton = page.getByRole('button', { name: 'Keep', exact: true });
  for (let step = 0; step < 500 && (await lurker(page).count()) === 0; step += 1) {
    await settled(page);
    if (await keepButton.isVisible()) {
      await keepButton.click();
      continue;
    }
    const cards = page.locator('.board-hand .is-clickable');
    if ((await cards.count()) > 0) {
      await cards.first().click();
    } else if ((await primary(page).count()) > 0 && (await primary(page).isEnabled())) {
      await primary(page).click();
    }
  }
  await settled(page);
  await lurker(page).first().hover();
  const preview = page.getByRole('complementary', { name: 'Card preview' });
  await expect(preview).toContainText('Defined');
  await expect(preview).toContainText(
    'Defined by an ability: equal to the number of lands you control',
  );
});
