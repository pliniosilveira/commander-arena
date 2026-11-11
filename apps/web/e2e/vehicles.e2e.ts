import { expect, type Page, test } from '@playwright/test';
import { mine } from './harness/locators';
import { settled } from './harness/settle';

/**
 * Vehicles and Crew (CR 301.7, 702.122). The listed test decks hold no Vehicle, so these games use
 * the hidden SYNTHETIC deck `synthetic-vehicles` (game/precons.ts): invented cards, not real ones,
 * against the listed deck "Rats and Spiders" (a quiet opponent: against its own deck the scripted
 * player is dead by turn 16). A scripted player plays lands, creatures, Vehicles and Sol Rings
 * until a SYNTHETIC Rattle Wagon (Crew 3, 4/4) can be crewed by two untapped Grizzly Bears (power
 * 2 each). The engine and the AI are seeded, so a given seed reaches it at the same point every
 * time; the loop only waits for the page to settle. Seeds 2, 3, 4, 6, 10 and 11 reach it.
 */
const game = (seed: number) => `/?autostart=synthetic-vehicles,swamp-forest&seed=${seed}`;
const SEED = 2;
const WAGON = 'SYNTHETIC Rattle Wagon';

const primary = (page: Page) => page.locator('.dec-bar [data-dec-primary]');
/** Presses the bar's primary button if there is an enabled one right now; never waits for it. */
const press = (page: Page) =>
  primary(page)
    .click({ timeout: 150 })
    .catch(() => undefined);
const discardDialog = (page: Page) => page.getByRole('dialog', { name: /^Discard/ });
const crewPanel = (page: Page) => page.getByRole('region', { name: `Crew ${WAGON}` });
const logText = (page: Page) => page.getByRole('log');
const bearsReady = (page: Page) =>
  page.locator('[data-field-seat="0"] .board-tile:not(.is-tapped)', {
    hasText: 'Grizzly Bears',
  });

/** Plays on until a Wagon of ours can be activated and two untapped Bears can crew it. */
async function playUntilCrewable(page: Page): Promise<void> {
  const keepButton = page.getByRole('button', { name: 'Keep', exact: true });
  for (let step = 0; step < 600; step += 1) {
    await settled(page);
    if (await keepButton.isVisible()) {
      await keepButton.click();
    } else if (await discardDialog(page).isVisible()) {
      await discardDialog(page).locator('.dec-card-button').first().click();
      await discardDialog(page).getByRole('button', { name: 'Confirm' }).click();
    } else if (
      (await page.locator('.dec-overlay').count()) === 0 &&
      (await mine(page, WAGON).and(page.locator('.is-clickable')).count()) > 0 &&
      (await bearsReady(page).count()) >= 2
    ) {
      return;
    } else {
      const cards = page.locator('.board-hand .is-clickable');
      if ((await cards.count()) > 0) {
        await cards.first().click();
      } else {
        await press(page);
      }
    }
  }
  throw new Error('the game never reached the situation');
}

test('crew: click the Wagon, tap two Bears, see the badge and the live 4/4', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(game(SEED));
  await playUntilCrewable(page);

  // Uncrewed: the printed pair is greyed in the P/T place, there is no live P/T and no badge.
  const wagon = mine(page, WAGON);
  await expect(wagon.locator('.board-stat-printed')).toHaveText('4/4');
  await expect(wagon.locator('.board-stat-pt')).toHaveCount(0);
  await expect(wagon.getByText('crewed', { exact: true })).toHaveCount(0);
  await expect(wagon.locator('.board-kw')).toHaveText('Crew');

  await wagon.click();
  const panel = crewPanel(page);
  await expect(panel).toBeVisible();
  await expect(page.locator('.dec-prompt')).toContainText(
    `Tap creatures with total power 3 or greater to crew ${WAGON}.`,
  );
  await expect(panel.locator('.dec-crew-total')).toHaveText('Total power: 0 of 3');
  await expect(primary(page)).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible();

  const bears = panel.getByRole('button', { name: /^Grizzly Bears/ });
  await expect(bears.first()).toContainText('(2 power)');
  await bears.nth(0).click();
  await expect(panel.locator('.dec-crew-total')).toHaveText('Total power: 2 of 3');
  await expect(panel.locator('.dec-crew-total')).toHaveAttribute('data-valid', 'false');
  await expect(primary(page)).toBeDisabled();
  await bears.nth(1).click();
  await expect(panel.locator('.dec-crew-total')).toHaveText('Total power: 4 of 3');
  await expect(panel.locator('.dec-crew-total')).toHaveAttribute('data-valid', 'true');
  await expect(page.locator('.board-ibadge', { hasText: 'Crew' })).toHaveCount(2);
  await expect(primary(page)).toBeEnabled();

  await primary(page).click();
  await expect(panel).toBeHidden();
  await expect(logText(page)).toContainText(
    `You crew ${WAGON} with Grizzly Bears and Grizzly Bears.`,
  );
  // The ability resolves by itself (it is ours and nothing responds): a live 4/4 and the badge.
  for (let step = 0; step < 12; step += 1) {
    await settled(page);
    if ((await wagon.locator('.board-stat-pt').count()) > 0) break;
    await press(page);
  }
  await expect(wagon.locator('.board-stat-pt')).toHaveText('4/4');
  await expect(wagon.locator('.board-stat-printed')).toHaveCount(0);
  await expect(wagon.getByText('crewed', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('crew: Esc takes the choice back and nothing is tapped', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(game(SEED));
  await playUntilCrewable(page);
  const untappedBears = await bearsReady(page).count();

  await mine(page, WAGON).click();
  await expect(crewPanel(page)).toBeVisible();
  await crewPanel(page)
    .getByRole('button', { name: /^Grizzly Bears/ })
    .first()
    .click();
  await page.keyboard.press('Escape');
  await expect(crewPanel(page)).toBeHidden();
  await expect(bearsReady(page)).toHaveCount(untappedBears);
  await expect(mine(page, WAGON).locator('.board-stat-printed')).toHaveText('4/4');
  await expect(logText(page)).not.toContainText('You crew');
  expect(errors).toEqual([]);
});
