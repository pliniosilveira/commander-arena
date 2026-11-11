/** Blockers beside the attackers they block, and the arrows' pairs (issue 19). */
import type { ObjectView } from '@commander-arena/engine';
import { expect, test } from 'vitest';
import { blockPairs } from '../src/ui/board/BlockArrows';
import { combatOrder } from '../src/ui/board/combat-order';
import type { CombatRole } from '../src/ui/board/resolve';

const obj = (id: string) => ({ id, name: id }) as unknown as ObjectView;
const attacker = (number: number, blocked: boolean, tentative = false): CombatRole => ({
  kind: 'attacker',
  target: 'You',
  blocked,
  number,
  blockers: blocked ? 1 : 0,
  tentative,
});
const blocker = (numbers: number[], tentative = false): CombatRole => ({
  kind: 'blocker',
  blocks: numbers.map((n) => `A${n}`),
  pairs: numbers.map((n) => ({ number: n, attacker: `o${n}` as const, name: `A${n}` })),
  tentative,
});
const ids = (list: readonly ObjectView[]) => list.map((o) => o.id);

test('blockers are ordered by the number of the attacker they block, the rest keep their place', () => {
  const row = ['x', 'b3', 'y', 'b1', 'b2'].map(obj);
  const roles = new Map<string, CombatRole>([
    ['b3', blocker([3])],
    ['b1', blocker([1])],
    ['b2', blocker([2])],
  ]);
  expect(ids(combatOrder(row, roles))).toEqual(['b1', 'b2', 'b3', 'x', 'y']);
});

test('in the attackers row the blocked attackers come first, in number order', () => {
  const row = ['a1', 'a2', 'a3', 'a4'].map(obj);
  const roles = new Map<string, CombatRole>([
    ['a1', attacker(1, false)],
    ['a2', attacker(2, true)],
    ['a3', attacker(3, false)],
    ['a4', attacker(4, true)],
  ]);
  expect(ids(combatOrder(row, roles))).toEqual(['a2', 'a4', 'a1', 'a3']);
});

test('nothing moves while the player is still picking blocks', () => {
  const row = ['x', 'b2', 'b1'].map(obj);
  const roles = new Map<string, CombatRole>([
    ['b2', blocker([2], true)],
    ['b1', blocker([1], true)],
  ]);
  expect(combatOrder(row, roles)).toBe(row);
});

test('a row with no combat is returned as it is', () => {
  const row = ['a', 'b'].map(obj);
  expect(combatOrder(row, new Map())).toBe(row);
});

test('a blocker of two attackers is ordered by the first', () => {
  const row = ['b2', 'bx'].map(obj);
  const roles = new Map<string, CombatRole>([
    ['b2', blocker([2])],
    ['bx', blocker([3, 1])],
  ]);
  expect(ids(combatOrder(row, roles))).toEqual(['bx', 'b2']);
});

test('one arrow pair for each blocker and attacker it blocks', () => {
  const roles = new Map<string, CombatRole>([
    ['a1', attacker(1, true)],
    ['b1', blocker([1])],
    ['bx', blocker([1, 2])],
  ]);
  expect(blockPairs(roles).map((p) => [p.blocker, p.attacker, p.number])).toEqual([
    ['b1', 'o1', 1],
    ['bx', 'o1', 1],
    ['bx', 'o2', 2],
  ]);
});
