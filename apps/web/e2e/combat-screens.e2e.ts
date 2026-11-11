import { expect, type Page, test } from '@playwright/test';
import { reachAttackers, reachBlocks, reachDivision } from './harness/blocks';
import { settled } from './harness/settle';

/**
 * The combat screens (issues 106, 92, 19, 9). Both players play the hidden SYNTHETIC deck
 * `synthetic-hasty-goblins` (game/precons.ts): identical Goblins with haste, so the opponent attacks with
 * several and the declare blockers question opens (the same script as pairing.e2e.ts).
 */
const game = (seed: number) =>
  `/?autostart=synthetic-hasty-goblins,synthetic-hasty-goblins&seed=${seed}`;

const mine = (page: Page) => page.locator('[data-field-seat="0"] .board-tile.is-clickable');

async function toBlocks(page: Page, attackers: number, blockers: number): Promise<void> {
  await page.goto(game(1));
  await page.getByRole('button', { name: 'Keep', exact: true }).click();
  await page.getByRole('button', { name: 'Full Control' }).click();
  await reachBlocks(page, attackers, blockers);
}

const takes = async (page: Page): Promise<number> => {
  const text = await page
    .locator('[data-passing-target="seat-0"] .dec-pass-head')
    .innerText({ timeout: 5_000 });
  return Number(/\d+/.exec(text)?.[0]);
};

test.describe('issue 106: damage getting through while blocking', () => {
  test('the panel shows what you take and falls as blockers are picked', async ({ page }) => {
    test.setTimeout(150_000);
    await toBlocks(page, 2, 1);
    const panel = page.getByRole('region', { name: 'Damage getting through' });
    await expect(panel).toBeVisible();
    const before = await takes(page);
    expect(before).toBeGreaterThan(0);
    await expect(panel.locator('.dec-pass-left')).toContainText(/Life \d+ to \d+/);

    // Block the first attacker with the first blocker: that attacker's damage leaves the total.
    await mine(page).first().click();
    await page.locator('[data-field-seat="1"] .board-tile[data-pairs="1"]').click();
    await expect(async () => {
      const gone = (await panel.locator('[data-passing-none]').count()) > 0;
      expect(gone || (await takes(page)) < before).toBe(true);
    }).toPass({ timeout: 5_000 });

    // Releasing the blocker puts the damage back.
    await mine(page).first().click();
    await expect.poll(() => takes(page)).toBe(before);
  });
});

test.describe('issue 92: dividing combat damage leaves the board visible', () => {
  test('a docked panel with the card of every creature, and the board still readable', async ({
    page,
  }) => {
    test.setTimeout(200_000);
    await page.goto('/?autostart=synthetic-trample,synthetic-rats&seed=1');
    await page.getByRole('button', { name: 'Keep', exact: true }).click();
    await reachDivision(page);
    const panel = page.getByRole('region', { name: 'Divide combat damage' });
    // Not a modal: no dialog, no overlay over the battlefield.
    await expect(page.getByRole('dialog', { name: 'Divide combat damage' })).toHaveCount(0);
    await expect(page.locator('.dec-overlay')).toHaveCount(0);
    // The panel is in the controls column, beside the board.
    expect(
      await page.evaluate(() => {
        const dock = document.querySelector('.dec-damage-dock')?.getBoundingClientRect();
        const board = document.querySelector('.board')?.getBoundingClientRect();
        return dock !== undefined && board !== undefined && dock.left >= board.right - 0.5;
      }),
    ).toBe(true);
    // The trampler, the blocker and the player each have a row; the creatures show their card and numbers.
    await expect(panel.locator('.dec-damage-thumb')).toHaveCount(2);
    await expect(panel).toContainText('SYNTHETIC Trampler 4/4');
    await expect(panel).toContainText('Yargle, Glutton of Urborg');
    await expect(panel).toContainText('9/3');
    await expect(panel).toContainText('lethal: 3');
    await expect(panel).toContainText('tramples over');

    // Hovering the blocker's row lights it on the board and shows its card in the preview panel.
    const row = panel.locator('[data-damage-row]').first();
    const id = await row.getAttribute('data-damage-row');
    await row.hover();
    await expect(page.locator(`[data-object-id="${id}"][data-assign-hot="true"]`)).toBeVisible();
    await expect(page.locator('.board-preview')).toContainText('Yargle, Glutton of Urborg', {
      timeout: 5_000,
    });
    await page.mouse.move(5, 5);
    await expect(page.locator('[data-assign-hot="true"]')).toHaveCount(0);

    // The battlefield stays hoverable: a board tile is under the pointer, not behind a backdrop.
    const tile = page.locator('[data-field-seat="1"] .board-tile.is-blocking').first();
    await tile.hover();
    await expect(page.locator('.board-preview')).toContainText('Yargle, Glutton of Urborg', {
      timeout: 5_000,
    });

    // Confirm sends the default division; the game goes on.
    await page.getByRole('button', { name: 'Confirm' }).click();
    await expect(panel).toBeHidden({ timeout: 10_000 });
  });
});

test.describe('issue 19: the declare attackers buttons', () => {
  test('"Attack with all" is on the left, "Declare attackers (N)" on the right', async ({
    page,
  }) => {
    test.setTimeout(150_000);
    await page.goto(game(1));
    await page.getByRole('button', { name: 'Keep', exact: true }).click();
    await reachAttackers(page);
    const allOut = page.getByRole('button', { name: 'Attack with all', exact: true });
    const attack = page.locator('.dec-bar [data-dec-primary]');
    await expect(attack).toHaveText('No Attack');
    const a = await allOut.boundingBox();
    const b = await attack.boundingBox();
    if (a === null || b === null) throw new Error('a button is not on screen');
    expect(a.x + a.width).toBeLessThanOrEqual(b.x + 1);
    await allOut.click();
    await expect(attack).toHaveText(/^Declare attackers \(\d+\)$/);
  });
});

test.describe('issue 19: who blocks whom', () => {
  test('an arrow joins each blocker to its attacker, and declared blockers stand with it', async ({
    page,
  }) => {
    test.setTimeout(150_000);
    await toBlocks(page, 2, 1);
    const arrows = page.locator('.block-arrow');
    await expect(arrows).toHaveCount(0);
    const theirs = page.locator('[data-field-seat="1"] .board-tile.is-attacking');

    // Block the second attacker: one arrow, the tiles stay where they are while picking.
    const order = await theirs.evaluateAll((tiles) =>
      tiles.map((t) => t.getAttribute('data-pairs')),
    );
    await mine(page).first().click();
    await page.locator('[data-field-seat="1"] .board-tile[data-pairs="2"]').click();
    await expect(arrows).toHaveCount(1);
    expect(
      await theirs.evaluateAll((tiles) => tiles.map((t) => t.getAttribute('data-pairs'))),
    ).toEqual(order);

    // Declared: the arrow stays, and the blocked attacker moves to the front of its row.
    await page.locator('.dec-bar [data-dec-primary]').click();
    await expect(page.getByRole('region', { name: 'Damage getting through' })).toHaveCount(0);
    await expect(arrows).toHaveCount(1);
    await expect(theirs.first()).toHaveAttribute('data-pairs', '2');
  });
});

test.describe('issue 9: combat animations', () => {
  const TRAMPLE = '/?autostart=synthetic-trample,synthetic-rats&seed=1';

  interface Seen {
    /** Effects that were added: its class, text and the time. */
    added: { cls: string; text: string; at: number }[];
    /** How long each number and ghost stayed on the page, in milliseconds. */
    lived: { cls: string; ms: number }[];
    /** When the log gained a line, to see when the game went on after the damage. */
    lines: { text: string; at: number }[];
  }

  /** Watches the effects layer and the log: what is added, how long it stays, when the log moves. */
  async function watchEffects(page: Page): Promise<void> {
    await page.addInitScript(() => {
      const seen = { added: [], lived: [], lines: [] } as {
        added: { cls: string; text: string; at: number }[];
        lived: { cls: string; ms: number }[];
        lines: { text: string; at: number }[];
      };
      Object.assign(window, { __seen: seen });
      const born = new WeakMap<Node, number>();
      const tracked = /(^|\s)fx-(num|ghost)(\s|$)/;
      new MutationObserver((records) => {
        const now = performance.now();
        for (const record of records) {
          for (const node of record.addedNodes) {
            if (!(node instanceof HTMLElement)) continue;
            const cls = String(node.className);
            if (cls.includes('fx-')) {
              seen.added.push({ cls, text: node.textContent ?? '', at: now });
              if (tracked.test(cls)) born.set(node, now);
            }
            if (node.closest('[role="log"]') !== null) {
              seen.lines.push({ text: node.textContent ?? '', at: now });
            }
          }
          for (const node of record.removedNodes) {
            const start = born.get(node);
            if (start !== undefined && node instanceof HTMLElement) {
              seen.lived.push({ cls: String(node.className), ms: now - start });
            }
          }
        }
      }).observe(document, { childList: true, subtree: true });
    });
  }
  const seenOf = (page: Page) =>
    page.evaluate(() => (window as unknown as { __seen: Seen }).__seen);
  const count = (seen: Seen, name: string) => seen.added.filter((a) => a.cls.includes(name)).length;

  /** Plays to the division of damage and confirms it: a trampler and a blocker that kill each other. */
  async function deal(page: Page): Promise<void> {
    await page.goto(TRAMPLE);
    await page.getByRole('button', { name: 'Keep', exact: true }).click();
    await reachDivision(page);
    await page.getByRole('button', { name: 'Confirm' }).click();
    await expect(page.getByRole('region', { name: 'Divide combat damage' })).toBeHidden({
      timeout: 10_000,
    });
  }

  const chooseSpeed = async (page: Page, speed: 'Fast' | 'Normal' | 'Slow') => {
    await page.getByRole('button', { name: /Settings/ }).click();
    await page
      .getByRole('group', { name: 'Animation speed' })
      .getByRole('button', { name: speed })
      .click();
    // Close Settings again: open, it covers the action buttons the script presses.
    await page.getByRole('button', { name: /Settings/ }).click();
  };

  test('a hit and a death play slowly, one after another, and stay long enough to be seen', async ({
    page,
  }) => {
    test.setTimeout(200_000);
    await watchEffects(page);
    await deal(page);
    // The numbers and the ghosts of the trampler and the blocker that killed each other.
    await expect.poll(async () => count(await seenOf(page), 'fx-num')).toBeGreaterThanOrEqual(3);
    // Still on the page about a second after the first number appeared (the brief's bar).
    const first = (await seenOf(page)).added.find((a) => a.cls.includes('fx-num'));
    expect(first).toBeDefined();
    await page.waitForTimeout(1_000);
    const elapsed = await page.evaluate((at) => performance.now() - at, first?.at ?? 0);
    expect(elapsed).toBeGreaterThanOrEqual(1_000);
    await expect(page.locator('.fx-num').first()).toBeVisible();
    await expect(page.locator('.fx-ghost').first()).toBeVisible();
    // The layer takes no pointer, and every effect leaves in the end.
    expect(
      await page.evaluate(
        () => getComputedStyle(document.querySelector('.fx-layer') as Element).pointerEvents,
      ),
    ).toBe('none');
    await expect(page.locator('.fx-layer > *')).toHaveCount(0, { timeout: 12_000 });

    const seen = await seenOf(page);
    expect(count(seen, 'fx-ghost') - count(seen, 'fx-ghost-label')).toBeGreaterThanOrEqual(2);
    expect(count(seen, 'fx-ring')).toBeGreaterThanOrEqual(2);
    expect(count(seen, 'fx-spark')).toBeGreaterThanOrEqual(6);
    expect(count(seen, 'fx-shard')).toBeGreaterThanOrEqual(6);
    // A number lingers for more than a second; a creature that dies stays for about two.
    const numbers = seen.lived.filter((l) => /\bfx-num\b/.test(l.cls));
    const ghosts = seen.lived.filter((l) => l.cls.split(' ').includes('fx-ghost'));
    expect(numbers.length).toBeGreaterThanOrEqual(3);
    for (const n of numbers) expect(n.ms).toBeGreaterThanOrEqual(1_000);
    for (const g of ghosts) expect(g.ms).toBeGreaterThanOrEqual(2_000);
    // Staggered: the numbers do not all appear together.
    const starts = seen.added.filter((a) => a.cls.includes('fx-num')).map((a) => a.at);
    for (let i = 1; i < starts.length; i += 1) {
      expect((starts[i] ?? 0) - (starts[i - 1] ?? 0)).toBeGreaterThanOrEqual(300);
    }
    // Signed numbers: damage reads with a minus.
    expect(
      seen.added.filter((a) => a.cls.includes('fx-num')).every((a) => /^\u2212\d+/.test(a.text)),
    ).toBe(true);
  });

  test('the autopilot waits for the effects, and still reaches the next decision', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await watchEffects(page);
    await deal(page);
    await expect.poll(async () => count(await seenOf(page), 'fx-num')).toBeGreaterThanOrEqual(1);
    const first = (await seenOf(page)).added.find((a) => a.cls.includes('fx-num'));
    // "Passing" shows while it waits, and the click that seizes priority is never refused.
    await expect(page.locator('.dec-passing')).toBeVisible();
    // The next thing the game logs after the damage comes only after a visible pause.
    await expect
      .poll(
        async () => {
          const seen = await seenOf(page);
          const damaged = seen.lines.findIndex((l) => /combat damage/.test(l.text));
          const later = seen.lines
            .slice(damaged + 1)
            .find((l) => /begins|You (play|cast|attack)/.test(l.text));
          return later === undefined ? -1 : Math.round(later.at - (first?.at ?? 0));
        },
        { timeout: 30_000 },
      )
      .toBeGreaterThanOrEqual(1_200);
    // And the game goes on: a decision of the player is on screen and settled in the end.
    await settled(page, 60_000);
    await expect(page.locator('.dec-bar')).toBeVisible();
  });

  test('clicking while it waits takes priority at once', async ({ page }) => {
    test.setTimeout(240_000);
    await watchEffects(page);
    await deal(page);
    const passing = page.locator('.dec-passing');
    await expect(passing).toBeVisible();
    const before = Date.now();
    await passing.click();
    // The autopilot stops at once, not after the wait: the player holds priority.
    await expect(passing).toBeHidden({ timeout: 1_000 });
    expect(Date.now() - before).toBeLessThan(1_500);
    await expect(page.locator('.dec-bar [data-dec-primary]')).toBeEnabled();
  });

  test('the speed setting scales the effects and the choice is kept', async ({ page }) => {
    test.setTimeout(240_000);
    await watchEffects(page);
    await page.goto(TRAMPLE);
    await page.getByRole('button', { name: 'Keep', exact: true }).click();
    await page.getByRole('button', { name: /Settings/ }).click();
    const group = page.getByRole('group', { name: 'Animation speed' });
    await expect(group.getByRole('button', { name: 'Normal' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await group.getByRole('button', { name: 'Fast' }).click();
    await expect(group.getByRole('button', { name: 'Fast' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(await page.evaluate(() => document.documentElement.dataset.animationSpeed)).toBe('fast');
    await page.getByRole('button', { name: /Settings/ }).click();
    await reachDivision(page);
    await page.getByRole('button', { name: 'Confirm' }).click();
    await expect.poll(async () => count(await seenOf(page), 'fx-num')).toBeGreaterThanOrEqual(3);
    await expect(page.locator('.fx-layer > *')).toHaveCount(0, { timeout: 12_000 });
    // Fast is about half of Normal: a number stays between half a second and a second.
    const numbers = (await seenOf(page)).lived.filter((l) => /\bfx-num\b/.test(l.cls));
    for (const n of numbers) {
      expect(n.ms).toBeGreaterThanOrEqual(500);
      expect(n.ms).toBeLessThan(1_000);
    }

    // Remembered: a new page load starts on Fast, and the control shows it.
    await page.reload();
    expect(await page.evaluate(() => document.documentElement.dataset.animationSpeed)).toBe('fast');
    await page.getByRole('button', { name: /Settings/ }).click();
    await expect(
      page.getByRole('group', { name: 'Animation speed' }).getByRole('button', { name: 'Fast' }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  test('Slow stretches the effects to about one and a half times Normal', async ({ page }) => {
    test.setTimeout(240_000);
    await watchEffects(page);
    await page.goto(TRAMPLE);
    await page.getByRole('button', { name: 'Keep', exact: true }).click();
    await chooseSpeed(page, 'Slow');
    await reachDivision(page);
    await page.getByRole('button', { name: 'Confirm' }).click();
    await expect.poll(async () => count(await seenOf(page), 'fx-num')).toBeGreaterThanOrEqual(3);
    await expect(page.locator('.fx-layer > *')).toHaveCount(0, { timeout: 20_000 });
    const numbers = (await seenOf(page)).lived.filter((l) => /\bfx-num\b/.test(l.cls));
    for (const n of numbers) expect(n.ms).toBeGreaterThanOrEqual(1_800);
  });

  test('the Combat animations setting turns them off, and the choice is kept', async ({ page }) => {
    test.setTimeout(200_000);
    await watchEffects(page);
    await page.goto(TRAMPLE);
    await page.getByRole('button', { name: 'Keep', exact: true }).click();
    await page.getByRole('button', { name: /Settings/ }).click();
    const box = page.getByRole('checkbox', { name: 'Combat animations' });
    await expect(box).toBeChecked();
    await box.uncheck();
    // Close Settings again: open, it covers the action buttons the script presses.
    await page.getByRole('button', { name: /Settings/ }).click();
    await reachDivision(page);
    await page.getByRole('button', { name: 'Confirm' }).click();
    await expect(page.getByRole('region', { name: 'Divide combat damage' })).toBeHidden({
      timeout: 10_000,
    });
    // The damage was dealt (the log says so) and nothing was drawn, and nothing made the game wait.
    await expect(
      page
        .getByRole('log')
        .getByText(/combat damage to/)
        .first(),
    ).toBeVisible();
    await page.waitForTimeout(1_000);
    expect((await seenOf(page)).added.filter((a) => a.cls.includes('fx-'))).toEqual([]);

    // Remembered: a new page load starts with it off.
    await page.reload();
    expect(await page.evaluate(() => document.documentElement.dataset.combatAnimations)).toBe(
      'false',
    );
  });

  test('reduced motion draws nothing though the setting is on', async ({ page }) => {
    test.setTimeout(200_000);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await watchEffects(page);
    await deal(page);
    await page.waitForTimeout(1_000);
    expect((await seenOf(page)).added).toEqual([]);
    // The autopilot did not wait for pictures that were never drawn: it is not "Passing" for seconds.
    await settled(page, 30_000);
  });
});
