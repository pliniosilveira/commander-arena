// The AI's answer to "Each player chooses a party from among creatures they control, then sacrifices the rest" (a `chooseParty` decision, CR 700.8d, 701.21a). The cards are SYNTHETIC
// (written as the engine's AST). The agent keeps the party worth most: a creature with two of the types fills the place that lets the others stay.
import { applyAction, type CardDefinition, type PartyType } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { CasualAgent, GreedyAgent, HeuristicAgent, RandomLegalAgent } from '../src/index';
import { CTX } from './helpers';

const face = (
  name: string,
  manaCost: string[],
  types: ('creature' | 'sorcery')[],
  subtypes: string[],
  extra: Partial<CardDefinition['faces'][number]> = {},
): CardDefinition => ({
  oracleId: null,
  name,
  layout: 'normal',
  faces: [
    {
      name,
      manaCost,
      supertypes: [],
      types,
      subtypes,
      colors: [],
      power: types.includes('creature') ? 2 : null,
      toughness: types.includes('creature') ? 2 : null,
      loyalty: null,
      defense: null,
      oracleText: 'SYNTHETIC.',
      abilities: [],
      spell: null,
      ...extra,
    },
  ],
  colorIdentity: [],
  support: 'supported',
});

const PURGE = face('SYNTHETIC AI Party Purge', ['1'], ['sorcery'], [], {
  spell: { effect: { kind: 'chooseParty', players: { kind: 'eachPlayer' } } },
});
const HIGH_CLERIC = face('SYNTHETIC AI High Cleric', ['5'], ['creature'], ['Human', 'Cleric']);
const CLERIC_WIZARD = face(
  'SYNTHETIC AI Cleric Wizard',
  ['3'],
  ['creature'],
  ['Elf', 'Cleric', 'Wizard'],
);
const LOW_WIZARD = face('SYNTHETIC AI Low Wizard', ['1'], ['creature'], ['Human', 'Wizard']);
const ROGUE = face('SYNTHETIC AI Rogue', ['2'], ['creature'], ['Human', 'Rogue']);
const BEAR = face('SYNTHETIC AI Bear', ['2'], ['creature'], ['Bear']);

describe('"Each player chooses a party from among creatures they control, then sacrifices the rest"', () => {
  const start = (seats: 2 | 3 = 2) => {
    let b = scenario({ seats });
    for (const card of [PURGE, HIGH_CLERIC, CLERIC_WIZARD, LOW_WIZARD, ROGUE, BEAR]) {
      b = b.define(card);
    }
    b.seat(0)
      .hand(PURGE.name)
      .pool('C')
      .battlefield(HIGH_CLERIC.name, CLERIC_WIZARD.name, LOW_WIZARD.name, ROGUE.name, BEAR.name);
    for (let seat = 1; seat < seats; seat += 1) {
      b.seat(seat).battlefield(HIGH_CLERIC.name, BEAR.name);
    }
    const g = b.at('precombatMain', { active: 0 }).build();
    g.act(0).cast(PURGE.name, { pay: true });
    g.passAll();
    return g;
  };

  test('the casual agent keeps the party worth most: the Cleric Wizard stands in as the Wizard', async () => {
    const g = start();
    const view = g.view(0);
    if (view.pending?.kind !== 'chooseParty') throw new Error('no party decision');
    const action = await new CasualAgent({ seed: 1 }).decide(view, view.pending, CTX);
    if (action.kind !== 'chooseParty') throw new Error(`answered ${action.kind}`);
    const filled = (type: PartyType) => action.party.find((m) => m.type === type)?.object;
    const mine = (name: string) => g.id({ name, seat: 0 });
    expect(action.party.map((m) => m.type).sort()).toEqual(['Cleric', 'Rogue', 'Wizard']);
    expect(filled('Cleric')).toBe(mine(HIGH_CLERIC.name));
    expect(filled('Wizard')).toBe(mine(CLERIC_WIZARD.name));
    expect(filled('Rogue')).toBe(mine(ROGUE.name));
    expect(applyAction(g.state, 0, action).ok).toBe(true);
  });

  test('every agent answers a party the engine accepts', async () => {
    const agents = [
      new CasualAgent({ seed: 1 }),
      new GreedyAgent({ seed: 1 }),
      new HeuristicAgent({ seed: 1 }),
      new RandomLegalAgent({ seed: 1 }),
    ];
    for (const agent of agents) {
      const g = start(3);
      const view = g.view(0);
      if (view.pending === null) throw new Error('the seat does not see its decision');
      const action = await agent.decide(view, view.pending, CTX);
      expect(action.kind, agent.name).toBe('chooseParty');
      expect(applyAction(g.state, 0, action).ok, agent.name).toBe(true);
    }
  });

  test('the casual agent plays the whole spell through at three seats, in turn order', async () => {
    const g = start(3);
    const casual = new CasualAgent({ seed: 3 });
    const seats: number[] = [];
    while (g.state.pending?.kind === 'chooseParty') {
      const seat = g.state.pending.seat;
      seats.push(seat);
      const view = g.view(seat);
      if (view.pending === null) throw new Error('no decision');
      g.choose(seat, await casual.decide(view, view.pending, CTX));
    }
    expect(seats).toEqual([0, 1, 2]);
    // The Bears are not party creatures: gone from every board.
    expect(g.find({ name: BEAR.name, zone: 'battlefield', seat: 1 })).toHaveLength(0);
    expect(g.find({ name: HIGH_CLERIC.name, zone: 'battlefield', seat: 2 })).toHaveLength(1);
  });
});
