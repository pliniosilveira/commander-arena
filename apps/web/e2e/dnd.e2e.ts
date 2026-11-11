import { expect, type Page, test } from '@playwright/test';
import { untilHandPlayable } from './harness/resolve';
import { settled } from './harness/settle';

/** Drag and drop is an addition to clicking: every test here drives the real HTML5 drag events. */

async function toMain(page: Page) {
  await page.goto('/?autostart=white-knights,swamp-forest&seed=7');
  await page.getByRole('button', { name: 'Keep', exact: true }).click();
  await expect(page.locator('[data-dec-primary]')).toBeVisible({ timeout: 15_000 });
  // The opponent plays first: wait for my turn, when a land of the hand becomes playable. The
  // primary button is already there during the opponent's turn, so it is no signal. The game stops
  // at each opponent spell until the player presses Resolve (D-199), so press it on the way.
  await untilHandPlayable(page);
  await expect(page.locator('.board-hand [data-object-id][draggable="true"]').first()).toBeVisible({
    timeout: 15_000,
  });
}

const hand = (page: Page) => page.locator('.board-hand [data-object-id]');
const mine = (page: Page) => page.locator('[data-field-seat="0"]');
const primary = (page: Page) => page.locator('[data-dec-primary]');

/** Plays a Plains by dragging it, so the colored mana for a Healer's Hawk is there. */
async function dragPlains(page: Page) {
  const plains = hand(page).filter({ hasText: 'Basic Land' }).first();
  await expect(plains).toHaveAttribute('draggable', 'true');
  await plains.dragTo(page.locator('[data-drop="battlefield"]'));
  await expect(mine(page).locator('[data-object-id]', { hasText: 'Plains' })).toHaveCount(1);
}

test('a land dragged from the hand onto the battlefield is played, as by a click', async ({
  page,
}) => {
  await toMain(page);
  const before = await hand(page).count();
  const plains = hand(page).filter({ hasText: 'Basic Land' }).first();
  await plains.dragTo(page.locator('[data-drop="battlefield"]'));

  await expect(page.getByRole('log')).toContainText('You play Plains');
  await expect(mine(page).locator('[data-object-id]', { hasText: 'Plains' })).toHaveCount(1);
  await expect(hand(page)).toHaveCount(before - 1);
  // The hand is still there and the played land is gone from it.
  await expect(hand(page).first()).toBeVisible();
});

test('cards that cannot be played are not draggable', async ({ page }) => {
  await toMain(page);
  // Turn one with no land down: no spell is castable yet, only the lands are.
  const draggable = page.locator('.board-hand [data-object-id][draggable="true"]');
  const count = await draggable.count();
  expect(count).toBeGreaterThan(0);
  for (const label of await draggable.evaluateAll((els) =>
    els.map((e) => e.getAttribute('aria-label') ?? ''),
  )) {
    expect(label).toContain('Plains');
  }
  await expect(hand(page).filter({ hasText: "Healer's Hawk" }).first()).toHaveAttribute(
    'draggable',
    'false',
  );
});

test('a drop outside every zone sends no action and the card stays in the hand', async ({
  page,
}) => {
  await toMain(page);
  const before = await hand(page).count();
  const plains = hand(page).filter({ hasText: 'Basic Land' }).first();
  // The exile bar between the two battlefields is not a drop zone.
  await plains.dragTo(page.locator('.board-mid'));
  await plains.dragTo(page.getByRole('log'));

  await expect(hand(page)).toHaveCount(before);
  await expect(page.getByRole('log')).not.toContainText('You play');
  await expect(mine(page).locator('[data-object-id]')).toHaveCount(0);
  await expect(plains).toHaveAttribute('draggable', 'true');
  // Clicking still plays it.
  await plains.click();
  await expect(page.getByRole('log')).toContainText('You play Plains');
});

test('valid zones are outlined with their label while a card is held, and only then', async ({
  page,
}) => {
  await toMain(page);
  const plains = hand(page).filter({ hasText: 'Basic Land' }).first();
  const field = page.locator('[data-drop="battlefield"]');
  await expect(field).not.toHaveAttribute('data-drop-state', /.+/);

  const box = await plains.boundingBox();
  const target = await field.boundingBox();
  if (box === null || target === null) throw new Error('no boxes');
  await page.mouse.move(box.x + box.width / 2, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y - 30, { steps: 4 });
  await expect(field).toHaveAttribute('data-drop-state', 'valid');
  await expect(field).toHaveAttribute('data-drop-label', 'Play Plains');
  await expect(page.locator('html')).toHaveAttribute('data-dnd-stack', 'valid');
  // The preview stays quiet and nothing else is dimmed.
  await expect(page.locator('.is-dimmed')).toHaveCount(0);
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 6 });
  await expect(field).toHaveAttribute('data-drop-state', 'over');
  await page.mouse.up();

  await expect(page.getByRole('log')).toContainText('You play Plains');
  await expect(field).not.toHaveAttribute('data-drop-state', /.+/);
  await expect(page.locator('html')).not.toHaveAttribute('data-dnd-stack', /.+/);
});

test('a spell dragged onto the battlefield is cast', async ({ page }) => {
  await toMain(page);
  await dragPlains(page);
  const hawk = hand(page).filter({ hasText: "Healer's Hawk" }).first();
  await expect(hawk).toHaveAttribute('draggable', 'true');
  await hawk.dragTo(page.locator('[data-drop="battlefield"]'));

  await expect(page.getByRole('log')).toContainText("You cast Healer's Hawk");
  await expect(page.getByRole('region', { name: 'Stack' })).toContainText("Healer's Hawk");

  // Let it resolve: it joins the battlefield.
  await primary(page).click();
  await expect(mine(page).locator('[data-object-id]', { hasText: "Healer's Hawk" })).toHaveCount(1);
});

test('attackers: drag a creature at the opponent, then back to take it out of the attack', async ({
  page,
}) => {
  await toMain(page);
  await dragPlains(page);
  await hand(page)
    .filter({ hasText: "Healer's Hawk" })
    .first()
    .dragTo(page.locator('[data-drop="battlefield"]'));
  await expect(page.getByRole('log')).toContainText("You cast Healer's Hawk");

  // Click the primary button (resolve, to combat, next step...) until the attack declaration.
  for (let i = 0; i < 14; i += 1) {
    await settled(page);
    const label = (await primary(page).innerText()).trim();
    if (/^(No Attack|Declare attackers)/.test(label)) break;
    await primary(page).click();
  }
  await expect(primary(page)).toHaveText(/No Attack/, { timeout: 15_000 });

  const hawk = mine(page).locator('[data-object-id]', { hasText: "Healer's Hawk" });
  await expect(hawk).toHaveAttribute('draggable', 'true');
  // A land is no candidate: not draggable, never offered a zone.
  await expect(
    mine(page).locator('[data-object-id]', { hasText: 'Plains' }).first(),
  ).toHaveAttribute('draggable', 'false');

  await hawk.dragTo(page.locator('[data-seat="1"]'));
  await expect(primary(page)).toHaveText(/Declare attackers \(1\)/);
  await expect(hawk).toContainText('Attacking');

  await hawk.dragTo(page.locator('[data-drop="battlefield"]'));
  await expect(primary(page)).toHaveText(/No Attack/);
});

test('the stack panel is a drop zone too: a land dropped there is played', async ({ page }) => {
  await toMain(page);
  await hand(page)
    .filter({ hasText: 'Basic Land' })
    .first()
    .dragTo(page.locator('[data-drop="stack"]'));
  await expect(page.getByRole('log')).toContainText('You play Plains');
  await expect(mine(page).locator('[data-object-id]', { hasText: 'Plains' })).toHaveCount(1);
});

test('hovering still previews a card after a card was dragged out of the hand, also after Esc', async ({
  page,
}) => {
  await toMain(page);
  await dragPlains(page);
  await settled(page);
  const preview = page.getByRole('complementary', { name: 'Card preview' });
  const other = hand(page).first();
  await other.hover();
  await expect(preview.locator('[data-preview-id]')).toBeVisible();
  // Pin with a right click, then unpin with Esc: the hover shows again on the next card.
  await other.click({ button: 'right' });
  await expect(preview).toContainText('Pinned');
  await page.keyboard.press('Escape');
  await expect(preview).not.toContainText('Pinned');
  await mine(page).locator('[data-object-id]', { hasText: 'Plains' }).hover();
  await expect(preview.locator('[data-preview-id]')).toContainText('Plains');
});
