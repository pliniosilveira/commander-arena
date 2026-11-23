// CasualAgent (and so HeuristicAgent, which delegates to it) on a spell with three mandatory targets that must all differ (`differentFrom`, `alsoDifferentFrom`, CR 115.3):
// the answer names a different creature for every slot, and one the engine lists. The card is SYNTHETIC, on real engine states built with the scenario DSL.
import type { CardDefinition, TargetSpec } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { answer, expectLegal } from './casual-helpers';

const BLIGHT = 'SYNTHETIC Threefold Counters';
const SPIDER = 'Giant Spider';
const BEARS = 'Grizzly Bears';
const ELVES = 'Llanowar Elves';
const LIBRARY = Array.from({ length: 6 }, () => 'Plains');

const slot = (id: string, extra: Partial<TargetSpec> = {}): TargetSpec => ({
  id,
  what: { kind: 'object', filter: { types: ['creature'], zone: 'battlefield' } },
  ...extra,
});
const counters = (id: string) =>
  ({ kind: 'addCounters', objects: { kind: 'target', id }, counter: '-1/-1', count: 1 }) as const;

const threefold: CardDefinition = {
  oracleId: null,
  name: BLIGHT,
  layout: 'normal',
  support: 'supported',
  colorIdentity: ['B'],
  faces: [
    {
      name: BLIGHT,
      manaCost: ['1', 'B'],
      supertypes: [],
      types: ['sorcery'],
      subtypes: [],
      colors: ['B'],
      power: null,
      toughness: null,
      loyalty: null,
      defense: null,
      oracleText: 'SYNTHETIC',
      abilities: [],
      spell: {
        targets: [
          slot('t1'),
          slot('t2', { differentFrom: 't1' }),
          slot('t3', { differentFrom: 't2', alsoDifferentFrom: ['t1'] }),
        ],
        effect: { kind: 'sequence', effects: [counters('t1'), counters('t2'), counters('t3')] },
      },
    },
  ],
} as CardDefinition;

const game = (...theirs: readonly string[]) =>
  scenario()
    .define(threefold)
    .seat(0)
    .hand(BLIGHT)
    .library(...LIBRARY)
    .battlefield('Swamp', { count: 2 })
    .seat(1)
    .library(...LIBRARY)
    .battlefield(...theirs)
    .at('precombatMain', { active: 0, turn: 3 })
    .build();

describe('three mandatory targets that must all differ (CR 115.3)', () => {
  test('with three creatures, the agent targets three different ones', async () => {
    const g = game(SPIDER, BEARS, ELVES);
    g.act(0).cast(BLIGHT);
    g.expect.pending('targets', 0);
    const action = await answer(g);
    if (action.kind !== 'chooseTargets') throw new Error('expected chooseTargets');
    expect(action.targets.map((t) => t.specId)).toEqual(['t1', 't2', 't3']);
    expect(new Set(action.targets.map((t) => (t.kind === 'object' ? t.id : ''))).size).toBe(3);
    expectLegal(g, action);
  });

  test('the mirror: with only two creatures nothing the engine lists is answered with a target', async () => {
    const g = game(SPIDER, BEARS);
    g.act(0).cast(BLIGHT);
    g.expect.pending('targets', 0);
    const action = await answer(g);
    // No answer with three different targets exists: the agent cancels instead of sending one the engine refuses.
    expect(action).toEqual({ kind: 'cancel' });
  });
});
