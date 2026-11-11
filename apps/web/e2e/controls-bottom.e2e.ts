import { expect, type Page, test } from '@playwright/test';
import { settled } from './harness/settle';

/**
 * The controls column keeps the buttons where the hand expects them (D-146, the owner's follow-up to
 * issue 47): the stack is at the top and grows downward, the action dock is at the bottom, just
 * above Settings, and grows upward. The primary button must not move while the stack grows and
 * shrinks. A SYNTHETIC deck with Storm (hidden, `synthetic-storm`, game/precons.ts) puts several
 * objects on the stack: with Full Control on each Storm Bolt waits there to be resolved.
 */
const bolt = 'SYNTHETIC Storm Bolt';
const game = '/?autostart=synthetic-storm,swamp-forest&seed=1';
const controls = '[data-testid="game-side-controls"]';

const primary = (page: Page) => page.locator('.dec-bar [data-dec-primary]');
const bar = (page: Page) => page.locator('.dec-bar');
const stack = (page: Page) => page.getByRole('region', { name: 'Stack' });
const stackItems = (page: Page) => stack(page).locator('.pnl-stack-item');
const handCard = (page: Page) => page.locator('.board-hand .is-clickable', { hasText: bolt });
const targets = (page: Page) => page.getByRole('region', { name: 'Legal targets' });

async function untappedLands(page: Page): Promise<number> {
  return page
    .locator('[data-field-seat="0"] .board-tile:not(.is-tapped)')
    .filter({ has: page.locator('.board-tile-name', { hasText: /^Mountain$/ }) })
    .count();
}

/** Plays lands and passes until the hand and the board are ready, with no dialog and an empty stack. */
async function playUntil(page: Page, spells: number, lands: number): Promise<void> {
  const discard = page.getByRole('dialog', { name: /^Discard/ });
  for (let step = 0; step < 1200; step += 1) {
    await settled(page);
    const noDialog = (await page.locator('.dec-overlay').count()) === 0;
    if (
      noDialog &&
      (await stackItems(page).count()) === 0 &&
      (await handCard(page).count()) >= spells &&
      (await untappedLands(page)) >= lands
    ) {
      return;
    }
    if (await page.getByRole('button', { name: 'Keep', exact: true }).isVisible()) {
      await page.getByRole('button', { name: 'Keep', exact: true }).click();
    } else if (await discard.isVisible()) {
      await discard.locator('.dec-card-button').first().click();
      await discard.getByRole('button', { name: 'Confirm' }).click();
    } else if (!noDialog) {
      throw new Error('an unexpected dialog is open');
    } else if (
      (await page.locator('.board-hand .is-clickable', { hasText: 'Basic Land' }).count()) > 0
    ) {
      await page.locator('.board-hand .is-clickable', { hasText: 'Basic Land' }).first().click();
    } else if ((await primary(page).count()) > 0 && (await primary(page).isEnabled())) {
      await primary(page).click();
    }
  }
  throw new Error('the game never reached the situation');
}

/** Starts to cast a Storm Bolt: its target question is on screen, nothing chosen yet. */
async function startCast(page: Page): Promise<void> {
  await handCard(page).first().click();
  await settled(page);
  await expect(bar(page)).toContainText('Choose a target for');
}

async function castAtOpponent(page: Page): Promise<void> {
  await startCast(page);
  await targets(page).getByRole('button', { name: 'Opponent' }).click();
  await bar(page).getByRole('button', { name: 'Confirm' }).click();
  await settled(page);
}

/** The vertical extent of the parts of the controls column, in page pixels. */
async function layout(page: Page) {
  return page.evaluate((column) => {
    const edge = (selector: string) => {
      const r = document.querySelector(selector)?.getBoundingClientRect();
      if (r === undefined) return null;
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
    };
    return {
      column: edge(column),
      stack: edge(`${column} .pnl-stack`),
      list: edge(`${column} .pnl-stack-list`),
      dock: edge(`${column} .dec-dock`),
      primary: edge(`${column} .dec-bar [data-dec-primary]`),
      settings: edge(`${column} .pnl-settings`),
    };
  }, controls);
}

type Layout = Awaited<ReturnType<typeof layout>>;
const need = <T>(value: T | null, what: string): T => {
  if (value === null) throw new Error(`${what} is not on the page`);
  return value;
};

test('the primary button keeps its place with 0, 1 and several objects on the stack; the stack stays above the dock', async ({
  page,
}) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto(game);
  // Before any action there is nothing to undo: "Undo" has no count, a shorter chip than later.
  await page.getByRole('button', { name: 'Keep', exact: true }).click();
  await expect(primary(page)).toBeAttached({ timeout: 15_000 });
  await settled(page);
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeVisible();
  const fresh = await layout(page);
  await playUntil(page, 4, 4);
  await page.getByRole('button', { name: 'Full Control' }).click();

  const empty = await layout(page);
  expect(
    Math.abs(need(fresh.primary, 'primary').top - need(empty.primary, 'primary').top),
  ).toBeLessThan(1);
  await castAtOpponent(page);
  const one = await layout(page);
  await castAtOpponent(page);
  await castAtOpponent(page);
  await castAtOpponent(page);
  const many = await layout(page);
  expect(await stackItems(page).count()).toBeGreaterThanOrEqual(6);

  // The same screen position, within a pixel, whatever the stack holds.
  const y = (l: Layout) => need(l.primary, 'the primary button').top;
  expect(Math.abs(y(one) - y(empty))).toBeLessThan(1);
  expect(Math.abs(y(many) - y(empty))).toBeLessThan(1);
  // The foot of the dock does not move either: it sits just above Settings.
  for (const l of [empty, one, many]) {
    const dock = need(l.dock, 'the dock');
    const settings = need(l.settings, 'Settings');
    expect(settings.top - dock.bottom).toBeLessThanOrEqual(12);
    expect(need(l.column, 'the column').bottom - settings.bottom).toBeLessThanOrEqual(12);
  }
  expect(Math.abs(need(many.dock, 'dock').bottom - need(empty.dock, 'dock').bottom)).toBeLessThan(
    1,
  );

  // The stack starts at the top of the column and stays above the dock, with a list that scrolls
  // inside the stack's own area when it is long.
  for (const l of [empty, one, many]) {
    const col = need(l.column, 'the column');
    const st = need(l.stack, 'the stack');
    const dock = need(l.dock, 'the dock');
    expect(st.top - col.top).toBeLessThanOrEqual(12);
    expect(st.bottom).toBeLessThanOrEqual(dock.top + 0.5);
  }
  const list = need(many.list, 'the stack list');
  expect(list.top).toBeLessThan(need(many.dock, 'dock').top);
  expect(list.bottom).toBeLessThanOrEqual(need(many.stack, 'stack').bottom + 0.5);
  // About three items stay in sight however tall the dock is.
  expect(need(many.stack, 'stack').bottom - need(many.stack, 'stack').top).toBeGreaterThan(150);
  // New objects land at the top of the list, in view.
  await expect(stackItems(page).first()).toBeInViewport();

  // The stack shrinks again as the spells resolve; the button is where it was.
  for (let step = 0; step < 40 && (await stackItems(page).count()) > 0; step += 1) {
    await primary(page).click();
    await settled(page);
  }
  const after = await layout(page);
  expect(Math.abs(y(after) - y(empty))).toBeLessThan(1);
  expect(errors).toEqual([]);
});

test('a decision panel grows the dock upward: its foot and the primary button do not move', async ({
  page,
}) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto(game);
  await playUntil(page, 2, 2);
  await page.getByRole('button', { name: 'Full Control' }).click();
  await castAtOpponent(page);
  const before = await layout(page);

  await startCast(page);
  await expect(targets(page)).toBeVisible();
  const during = await layout(page);
  const b = need(before.dock, 'the dock');
  const d = need(during.dock, 'the dock');
  // The panel is above the buttons: the dock is taller, its top higher, its foot where it was.
  expect(d.top).toBeLessThan(b.top - 40);
  expect(Math.abs(d.bottom - b.bottom)).toBeLessThan(1);
  expect(
    Math.abs(need(during.primary, 'primary').top - need(before.primary, 'primary').top),
  ).toBeLessThan(1);
  const panel = await targets(page).boundingBox();
  const confirm = await bar(page).getByRole('button', { name: 'Confirm' }).boundingBox();
  expect((panel?.y ?? 0) + (panel?.height ?? 0)).toBeLessThanOrEqual(confirm?.y ?? 0);
  // The stack above is still whole and above the dock.
  expect(need(during.stack, 'stack').bottom).toBeLessThanOrEqual(d.top + 0.5);
  await expect(stackItems(page).first()).toBeInViewport();
});

test('at 1280x720 Large nothing in the controls column covers the commander, a hand card or the pass button', async ({
  page,
}) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(game);
  await playUntil(page, 4, 4);
  await page.getByRole('button', { name: 'Full Control' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-text-size', 'large');

  /** True when the point `down` pixels under the middle of the top edge belongs to the element. */
  const reachable = (selector: string, nth: number, down = 0) =>
    page.evaluate(
      ([sel, index, dy]) => {
        const all = document.querySelectorAll(sel as string);
        const el = all[index === -1 ? all.length - 1 : (index as number)];
        if (el === undefined) return false;
        const r = el.getBoundingClientRect();
        const y = dy === 0 ? r.top + r.height / 2 : r.top + (dy as number);
        const hit = document.elementFromPoint(r.left + r.width / 2, y);
        return hit !== null && el.contains(hit);
      },
      [selector, nth, down],
    );
  const clear = async (what: string) => {
    const cmdrs = await page.locator('.board-cmdr').count();
    expect(await reachable('.board-cmdr', cmdrs - 1), `${what}: commander`).toBe(true);
    // The last hand card is the one nearest the controls column; hands overlap their cards, so the
    // point is in its upper part.
    expect(await reachable('.board-hand-card', -1, 20), `${what}: hand card`).toBe(true);
    expect(await reachable('.dec-bar [data-dec-primary]', 0), `${what}: primary`).toBe(true);
    const dock = need((await layout(page)).dock, 'the dock');
    const board = await page.locator('.board').first().boundingBox();
    expect(dock.left, `${what}: dock beside the board`).toBeGreaterThanOrEqual(
      (board?.x ?? 0) + (board?.width ?? 0) - 1,
    );
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(
      true,
    );
  };

  await clear('empty stack');
  await castAtOpponent(page);
  await clear('one object');
  await castAtOpponent(page);
  await castAtOpponent(page);
  await clear('several objects');
  await startCast(page);
  await clear('a target question');
  const panel = need((await layout(page)).dock, 'the dock');
  // Even then the stack keeps room for about three items.
  const st = need((await layout(page)).stack, 'stack');
  expect(st.bottom - st.top).toBeGreaterThanOrEqual(220);
  expect(st.bottom).toBeLessThanOrEqual(panel.top + 0.5);
});

test('the same holds with the controls on the left and in the drawer below 1100px', async ({
  page,
}) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto(game);
  await playUntil(page, 3, 3);
  await page.getByRole('button', { name: 'Full Control' }).click();
  const empty = await layout(page);

  // Controls on the left.
  await page.getByRole('button', { name: /Settings/ }).click();
  await page
    .getByRole('group', { name: 'Stack and controls side' })
    .getByRole('button', { name: 'Left', exact: true })
    .click();
  await page.getByRole('button', { name: /Settings/ }).click();
  await expect(page.locator('html')).toHaveAttribute('data-side-panel', 'left');
  await castAtOpponent(page);
  const left = await layout(page);
  expect(need(left.column, 'column').left).toBe(0);
  expect(need(left.stack, 'stack').bottom).toBeLessThanOrEqual(need(left.dock, 'dock').top + 0.5);
  expect(
    Math.abs(need(left.primary, 'primary').top - need(empty.primary, 'primary').top),
  ).toBeLessThan(1);
  await page.getByRole('button', { name: /Settings/ }).click();
  await page
    .getByRole('group', { name: 'Stack and controls side' })
    .getByRole('button', { name: 'Right', exact: true })
    .click();
  await page.getByRole('button', { name: /Settings/ }).click();

  // The drawer: the stack grows, the button stays in the same place.
  await page.setViewportSize({ width: 1000, height: 720 });
  await page.getByRole('button', { name: /Stack, controls, card and log/ }).click();
  await settled(page);
  const two = await layout(page);
  await castAtOpponent(page);
  const four = await layout(page);
  expect(
    Math.abs(need(four.primary, 'primary').top - need(two.primary, 'primary').top),
  ).toBeLessThan(1);
  expect(need(four.stack, 'stack').bottom).toBeLessThanOrEqual(need(four.dock, 'dock').top + 0.5);
  expect(need(four.stack, 'stack').top - need(four.column, 'column').top).toBeLessThanOrEqual(12);
});
