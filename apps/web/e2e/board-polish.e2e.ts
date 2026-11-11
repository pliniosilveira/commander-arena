import { expect, type Page, test } from '@playwright/test';
import { handLand } from './harness/locators';
import { untilHandPlayable } from './harness/resolve';
import { scrollProblems } from './harness/scroll';
import { settled } from './harness/settle';

/**
 * Board and layout polish (issues 59, 137, 58, 36 and 84, D-239 to D-243). Each test names its issue.
 */

/**
 * Plays on (keeps the opening hand, plays whatever can be played, passes) until `ready` holds. The
 * opponent plays the hidden SYNTHETIC deck with Hideaway, the human the listed Swamp and Forest deck.
 */
async function playUntil(page: Page, ready: () => Promise<boolean>, steps = 900): Promise<void> {
  const keep = page.getByRole('button', { name: 'Keep', exact: true });
  const primary = page.locator('[data-dec-primary]');
  for (let i = 0; i < steps; i += 1) {
    await settled(page);
    if (await keep.isVisible()) {
      await keep.click();
      continue;
    }
    if (await ready()) return;
    const discard = page.locator('.dec-card-button');
    if ((await discard.count()) > 0) {
      await discard.first().click();
      await page.getByRole('button', { name: 'Confirm' }).click();
      continue;
    }
    const hand = page.locator('.board-hand .is-clickable');
    if ((await hand.count()) > 0) await hand.first().click();
    else if ((await primary.count()) > 0 && (await primary.isEnabled())) await primary.click();
  }
  throw new Error('the game never reached the situation');
}

test("issue 59: the opponent's face-down card sits inside its place in the exile viewer, with its label", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1366, height: 700 });
  await page.goto('/?autostart=swamp-forest,synthetic-dinosaurs&seed=4');
  const chip = page.locator('.board-exile-chip.is-opponent');
  await playUntil(page, async () => (await chip.count()) > 0);

  // The strip of face-down cards is a plain row of chips: no bullet, inside the board's column.
  const strip = page.locator('.board-exile-strip');
  expect(
    await strip.evaluate((el) => getComputedStyle(el.firstElementChild ?? el).listStyleType),
  ).toBe('none');

  await page.getByRole('button', { name: /^Open exile/ }).click();
  const viewer = page.getByRole('dialog', { name: /^Exile/ });
  const body = viewer.locator('.board-modal-body');
  const cardButton = viewer.locator('.board-zone-card', { has: page.locator('[data-face-down]') });
  await expect(cardButton).toHaveCount(1);
  const marks = cardButton.locator('.board-zone-marks');
  await expect(marks).toHaveText("Opponent's");

  const inside = async () => {
    const [b, c, m] = await Promise.all([
      body.boundingBox(),
      cardButton.boundingBox(),
      marks.boundingBox(),
    ]);
    if (b === null || c === null || m === null) throw new Error('no box');
    return { b, c, m };
  };
  const { b, c, m } = await inside();
  // The button holds the card and its label, and the body of the viewer holds the button whole.
  expect(m.y + m.height).toBeLessThanOrEqual(c.y + c.height + 0.5);
  expect(c.y + c.height).toBeLessThanOrEqual(b.y + b.height);
  expect(c.x).toBeGreaterThanOrEqual(b.x);
  // Nothing in it scrolls: one card needs no scroll bar.
  expect(await body.evaluate((el) => el.scrollHeight <= el.clientHeight)).toBe(true);
  expect(errors).toEqual([]);
});

/** The picture a card of the test gets: one bright colour, so the board shows what it does to it. */
const BRIGHT = { r: 250, g: 215, b: 120 };

test('issue 137: a card on the battlefield shows its picture at full brightness', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // Scryfall is not reachable from the tests: every image request gets the same plain bright picture.
  await page.route('https://api.scryfall.com/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      body: `<svg xmlns="http://www.w3.org/2000/svg" width="626" height="457"><rect width="100%" height="100%" fill="rgb(${BRIGHT.r},${BRIGHT.g},${BRIGHT.b})"/></svg>`,
    }),
  );
  await page.goto('/?autostart=white-knights,swamp-forest&seed=7');
  await page.getByRole('button', { name: 'Keep', exact: true }).click();
  await untilHandPlayable(page);
  await handLand(page).first().click();
  const tile = page.locator('[data-field-seat="0"] .board-tile', { hasText: 'Plains' }).first();
  const art = tile.locator('.board-tile-art.is-loaded');
  await expect(art).toHaveCount(1);
  await settled(page);
  await page.mouse.move(2, 2);

  // The picture has no filter and no cover over it.
  expect(await art.evaluate((el) => getComputedStyle(el).filter)).toBe('none');
  // (it fades in over a fifth of a second)
  await expect.poll(() => art.evaluate((el) => getComputedStyle(el).opacity)).toBe('1');

  // What a player sees in the middle of the tile (no name, no mark there) is the picture itself:
  // the colour of the screen is the colour of the picture (a filter of 62 percent gave 155, 133, 74).
  const box = await tile.boundingBox();
  if (box === null) throw new Error('no box');
  const shot = await page.screenshot({
    clip: { x: box.x + box.width / 2 - 4, y: box.y + box.height / 2 - 4, width: 8, height: 8 },
  });
  const seen = await page.evaluate(
    async (png) => {
      const bitmap = await createImageBitmap(
        new Blob([new Uint8Array(png)], { type: 'image/png' }),
      );
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext('2d');
      if (context === null) throw new Error('no canvas');
      context.drawImage(bitmap, 0, 0);
      const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
      const sum = [0, 0, 0];
      for (let i = 0; i < data.length; i += 4) {
        sum[0] = (sum[0] ?? 0) + (data[i] ?? 0);
        sum[1] = (sum[1] ?? 0) + (data[i + 1] ?? 0);
        sum[2] = (sum[2] ?? 0) + (data[i + 2] ?? 0);
      }
      const n = data.length / 4;
      return sum.map((v) => v / n);
    },
    [...shot],
  );
  expect(seen[0]).toBeGreaterThanOrEqual(BRIGHT.r * 0.95);
  expect(seen[1]).toBeGreaterThanOrEqual(BRIGHT.g * 0.95);
  expect(seen[2]).toBeGreaterThanOrEqual(BRIGHT.b * 0.95);
  expect(errors).toEqual([]);
});

test('issue 58: the active player is marked by the border alone, on all four sides, with no tint', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?autostart=white-knights,swamp-forest&seed=7');
  await page.getByRole('button', { name: 'Keep', exact: true }).click();
  await untilHandPlayable(page);
  await settled(page);

  type Look = { background: string; shadow: string; borderLeft: string };
  const look = (selector: string): Promise<Look> =>
    page.locator(selector).evaluate((el) => {
      const style = getComputedStyle(el);
      return {
        background: style.backgroundColor,
        shadow: style.boxShadow,
        borderLeft: style.borderLeftColor,
      };
    });
  const edge = await page.evaluate(() => {
    const probe = document.createElement('i');
    probe.style.color = 'var(--active-edge)';
    document.body.append(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  });

  // It is the player's own turn: their strip, battlefield and hand are the active area.
  const active = {
    strip: await look('.board-strip-me.is-active-area'),
    field: await look('.board-field-me.is-active-area'),
    hand: await look('.board-hand.is-active-area'),
  };
  const idle = {
    strip: await look('.board-strip-opp.is-idle-area'),
    field: await look('.board-field-opp.is-idle-area'),
  };
  // No tint: the ground of an active part is the ground of an idle one.
  expect(active.strip.background).toBe(idle.strip.background);
  expect(active.field.background).toBe(idle.field.background);
  expect(active.hand.background).toBe('rgba(0, 0, 0, 0)');
  // The edge: left and right on every part, the top on the first (the battlefield of the viewer)
  // and the bottom on the last (the hand); the strip's own left border takes the colour too.
  // A computed shadow reads "rgb(217, 164, 65) 4px 0px 0px 0px inset, ...": the offsets of its inset lines.
  const insets = (shadow: string): string[] =>
    [...shadow.matchAll(/(rgba?\([^)]*\)) (-?\d+)px (-?\d+)px 0px 0px inset/g)]
      .filter((m) => m[1] === edge)
      .map((m) => `${m[2]},${m[3]}`);
  const has = (shadow: string, x: number, y: number) => insets(shadow).includes(`${x},${y}`);
  expect(active.strip.borderLeft).toBe(edge);
  expect(active.strip.shadow).toContain(edge);
  for (const part of [active.field, active.hand]) {
    expect(has(part.shadow, 4, 0)).toBe(true); // the left edge
    expect(has(part.shadow, -4, 0)).toBe(true); // the right edge
  }
  expect(has(active.field.shadow, 0, 3)).toBe(true); // the top of the area
  expect(has(active.hand.shadow, 0, -3)).toBe(true); // the bottom of the area
  // The idle area has no edge.
  expect(idle.field.shadow).toBe('none');
  expect(errors).toEqual([]);
});

test('issue 84: the monarch is a small card in a strip beside the battlefield, not a permanent', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // The hidden SYNTHETIC deck with Court Herald, a creature that makes its controller the monarch.
  await page.goto('/?autostart=synthetic-monarch,synthetic-hasty-goblins&seed=1');
  // No strip before anyone is the monarch.
  await expect(page.locator('.board-emblems')).toHaveCount(0);
  await playUntil(page, async () => (await page.locator('[data-monarch]').count()) > 0);
  await settled(page);

  const strip = page.locator('.board-emblems[data-emblems-seat="0"]');
  await expect(strip).toHaveCount(1);
  await expect(page.locator('.board-emblems')).toHaveCount(1);
  const card = strip.locator('[data-emblem-kind="monarch"]');
  await expect(card).toHaveCount(1);
  await expect(card).toContainText('The Monarch');
  await expect(card).toContainText('draws a card');
  // It is no permanent: no tile, not draggable, and the strip is beside the rows, not over them.
  await expect(card).not.toHaveClass(/board-tile/);
  await expect(card).not.toHaveAttribute('draggable', 'true');
  const rows = page.locator('[data-field-seat="0"] .board-field-rows');
  const [s, r] = await Promise.all([strip.boundingBox(), rows.boundingBox()]);
  if (s === null || r === null) throw new Error('no box');
  expect(s.x + s.width).toBeLessThanOrEqual(r.x + 1);
  expect(s.y).toBeGreaterThanOrEqual(r.y - 1);
  expect(s.y + s.height).toBeLessThanOrEqual(r.y + r.height + 1);
  // The crown on the strip of the player stays too.
  await expect(page.locator('.board-strip-me [data-monarch="0"]')).toHaveText(/Monarch/);

  // Hovering the card shows it, with its words, in the preview panel.
  await card.hover();
  const preview = page.locator('.board-preview-card');
  await expect(preview).toContainText('The Monarch');
  await expect(preview).toContainText('Designation');
  await expect(preview).toContainText('its controller becomes the monarch');
  await expect(page.locator('.board-preview-details')).toContainText('You are the monarch');
  // No stray bar from the strip.
  expect(await page.evaluate(scrollProblems)).toEqual([]);
  expect(errors).toEqual([]);
});

test("a lifted hand card is drawn over the field: the land stack's count badge does not cover it", async ({
  page,
}) => {
  // A short window squeezes the field down to the hand, so a lifted card overlaps the land stack.
  await page.setViewportSize({ width: 1366, height: 600 });
  await page.goto('/?autostart=synthetic-lands,white-knights&seed=5');
  await page.getByRole('button', { name: 'Keep', exact: true }).click();
  const badge = page.locator('.board-land-count').first();
  for (let step = 0; step < 300 && (await badge.count()) === 0; step += 1) {
    await settled(page);
    const playable = page.locator('.board-hand .is-clickable');
    if ((await playable.count()) > 0) {
      await playable.first().click();
      continue;
    }
    const button = page.locator('[data-dec-primary]');
    if (await button.isVisible()) await button.click();
    await page.waitForTimeout(60);
  }
  await settled(page);
  await expect(badge).toBeVisible();
  // The badge ignores the pointer, so a hit test would skip it: let it take part, to read the paint order.
  await page.addStyleTag({ content: '.board-land-count { pointer-events: auto !important; }' });
  const b = await badge.boundingBox();
  if (b === null) throw new Error('no badge box');

  const cards = page.locator('.board-hand-card');
  let overlapped = 0;
  for (let i = 0; i < (await cards.count()); i += 1) {
    await cards.nth(i).hover();
    await page.waitForTimeout(250); // the lift is a transition
    const c = await cards.nth(i).boundingBox();
    const cx = b.x + b.width / 2;
    const cy = b.y + b.height / 2;
    // Only a card that covers the middle of the badge says anything about which one is drawn on top.
    if (c === null || cx < c.x || cx > c.x + c.width || cy < c.y || cy > c.y + c.height) continue;
    overlapped += 1;
    const top = await page.evaluate(
      ([x, y]) => document.elementFromPoint(x, y)?.className?.toString() ?? '',
      [cx, cy] as [number, number],
    );
    expect(top, `card ${i} lifted over the badge`).not.toContain('board-land-count');
  }
  // The window is short enough for at least one lifted card to reach the badge; if not, the test says nothing.
  expect(overlapped).toBeGreaterThan(0);
});
