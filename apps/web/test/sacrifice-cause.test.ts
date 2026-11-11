import type { ChoosePermanentDecision, ObjectId, ObjectView } from '@commander-arena/engine';
import { expect, test } from 'vitest';
import { sacrificeCause } from '../src/ui/decisions/permanents';

/** Whose sacrifice this is and what caused it (D-131): the dock panel of a sacrifice that an effect makes. */
const o = (n: number): ObjectId => `o${n}`;
const decision = (source: ObjectId, forCost = false): ChoosePermanentDecision => ({
  id: 'd1',
  seat: 0,
  kind: 'choosePermanent',
  source,
  purpose: 'sacrifice',
  min: 1,
  max: 1,
  legal: [o(1), o(2)],
  ...(forCost ? { forCost: true } : {}),
});
const view = (fields: Partial<ObjectView>): ObjectView =>
  ({ name: 'Cause', controller: 1, types: ['sorcery'], ...fields }) as ObjectView;
const index = (entries: readonly [ObjectId, ObjectView][]) => new Map(entries);

test("a spell of the opponent: whose it is, and that the choice is the viewer's", () => {
  const idx = index([[o(9), view({ name: 'Culling' })]]);
  expect(sacrificeCause(decision(o(9)), idx, 0)).toBe(
    "Your sacrifice, from your opponent's Culling.",
  );
  // The viewer's own spell says "your".
  expect(sacrificeCause(decision(o(9)), idx, 1)).toBe('Your sacrifice, from your Culling.');
});

test('a triggered ability that makes every player sacrifice says so, and the order of the choices', () => {
  const ability = {
    kind: 'triggered',
    trigger: { kind: 'landfall' },
    effect: {
      kind: 'sacrifice',
      objects: { kind: 'choose', filter: { types: ['creature'] } },
      player: { kind: 'eachPlayer' },
    },
  };
  const idx = index([
    [o(9), view({ name: 'Bag Marauder', ability: ability as never, abilitySource: o(5) })],
    [o(5), view({ name: 'Bag Marauder', types: ['creature'] })],
  ]);
  expect(sacrificeCause(decision(o(9)), idx, 1)).toBe(
    'Your sacrifice, from your Bag Marauder: Each player sacrifices a creature of their choice. Each player chooses their own, the active player first.',
  );
});

test('a sacrifice that is a cost, and a choice that is no sacrifice, have no such line', () => {
  const idx = index([[o(9), view({})]]);
  expect(sacrificeCause(decision(o(9), true), idx, 0)).toBeNull();
  expect(sacrificeCause({ ...decision(o(9)), purpose: 'effect' }, idx, 0)).toBeNull();
  expect(sacrificeCause(decision(o(8)), idx, 0)).toBeNull();
});
