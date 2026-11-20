// CasualAgent on the new places "blight" is asked (Lorwyn Eclipsed, CR 701.68a), on real engine states built with the scenario DSL and SYNTHETIC cards:
//   - "As an additional cost to cast this spell, you may blight 1" (a `choosePermanent` of purpose `blight`, `min` 0): the agent pays it only with a creature that survives the counter;
//   - "Ward—Blight 2" asked of the agent (a `confirmOptional` of purpose `ward`, then the choice of the creature): the answers are ones the engine lists.
import type { CardDefinition } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { answer, expectLegal } from './casual-helpers';

const STUDY = 'SYNTHETIC Blight Study';
const WARDEN = 'SYNTHETIC Blight Warden';
const SPIDER = 'Giant Spider'; // 2/4
const ELVES = 'Llanowar Elves'; // 1/1
const BOLT = 'Lightning Bolt';
const LIBRARY = Array.from({ length: 6 }, () => 'Plains');

const draw = { kind: 'draw', player: { kind: 'you' }, count: 1 } as const;

const face = (name: string, types: readonly ('sorcery' | 'creature')[]) => ({
  name,
  manaCost: ['1', 'R'],
  supertypes: [],
  types,
  subtypes: [],
  colors: ['R'],
  power: types.includes('creature') ? 2 : null,
  toughness: types.includes('creature') ? 2 : null,
  loyalty: null,
  defense: null,
  oracleText: 'SYNTHETIC',
});

const study: CardDefinition = {
  oracleId: null,
  name: STUDY,
  layout: 'normal',
  support: 'supported',
  colorIdentity: ['R'],
  faces: [
    {
      ...face(STUDY, ['sorcery']),
      abilities: [],
      additionalCosts: [{ kind: 'blight', count: 1, optional: true }],
      spell: { effect: draw },
    },
  ],
} as CardDefinition;

const warden: CardDefinition = {
  oracleId: null,
  name: WARDEN,
  layout: 'normal',
  support: 'supported',
  colorIdentity: ['R'],
  faces: [
    {
      ...face(WARDEN, ['creature']),
      abilities: [
        { kind: 'keyword', keyword: { kind: 'ward', cost: [{ kind: 'blight', count: 2 }] } },
      ],
      spell: null,
    },
  ],
} as CardDefinition;

describe('the optional blight of a spell’s additional cost', () => {
  const game = (...mine: readonly string[]) =>
    scenario()
      .define(study)
      .seat(0)
      .hand(STUDY)
      .library(...LIBRARY)
      .battlefield('Mountain', { count: 2 })
      .battlefield(...mine)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('with a creature that survives the counter, the agent pays', async () => {
    const g = game(ELVES, SPIDER);
    g.act(0).cast(STUDY, { pay: true });
    g.expect.pending('choosePermanent', 0);
    const action = await answer(g);
    expect(action).toEqual({ kind: 'choosePermanents', objects: [g.id(SPIDER)] });
    expectLegal(g, action);
  });

  test('with only a creature that would die of it, the agent chooses none', async () => {
    const g = game(ELVES);
    g.act(0).cast(STUDY, { pay: true });
    g.expect.pending('choosePermanent', 0);
    const action = await answer(g);
    expect(action).toEqual({ kind: 'choosePermanents', objects: [] });
    expectLegal(g, action);
  });
});

describe('"Ward—Blight 2" asked of the agent', () => {
  test('the agent keeps its spell: it accepts, and the creature it chooses is a listed one', async () => {
    const g = scenario()
      .define(warden)
      .seat(0)
      .hand(BOLT)
      .library(...LIBRARY)
      .battlefield('Mountain', { count: 2 })
      .battlefield(SPIDER, ELVES)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(WARDEN)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).cast(BOLT, { targets: [WARDEN], pay: true });
    g.passAll();
    g.expect.pending('confirmOptional', 0);
    const accept = await answer(g);
    expect(accept).toEqual({ kind: 'acceptOptional' });
    expectLegal(g, accept);
    g.choose(accept);
    g.expect.pending('choosePermanent', 0);
    const chosen = await answer(g);
    expectLegal(g, chosen);
  });
});
