/** The log line of `damagePrevented` (CR 615), worded from fake states like the other describe tests. */
import type { GameState } from '@commander-arena/engine';
import { expect, test } from 'vitest';
import { describeEvent } from '../src/game/describe';

const state = () =>
  ({
    objects: {
      o1: { card: 'c1', token: null, stack: null, controller: 0 },
      o2: { card: 'c2', token: null, stack: null, controller: 1 },
    },
    cards: { c1: { definition: 'd1' }, c2: { definition: 'd2' } },
    definitions: { d1: { name: 'Fire Giant' }, d2: { name: 'Grizzly Bears' } },
    lki: {},
    pending: null,
  }) as unknown as GameState;

const line = (to: object, viewer: number, combat = false) =>
  describeEvent(
    { kind: 'damagePrevented', source: 'o1', to, amount: 3, combat } as never,
    state(),
    state(),
    viewer,
  );

test('damage to a creature, to you and to the opponent is "prevented", combat or not', () => {
  const toBears = line({ kind: 'object', id: 'o2' }, 0);
  expect(toBears?.text).toBe("Fire Giant's 3 damage to Grizzly Bears is prevented.");
  expect(toBears?.level).toBe('major');
  expect(toBears?.rule).toBe('CR 615');
  expect(toBears?.objects).toEqual(['o1', 'o2']);
  expect(line({ kind: 'player', seat: 0 }, 0)?.text).toBe(
    "Fire Giant's 3 damage to you is prevented.",
  );
  expect(line({ kind: 'player', seat: 1 }, 0, true)?.text).toBe(
    "Fire Giant's 3 damage to Opponent is prevented.",
  );
  expect(line({ kind: 'player', seat: 1 }, 1)?.text).toBe(
    "Fire Giant's 3 damage to you is prevented.",
  );
});
