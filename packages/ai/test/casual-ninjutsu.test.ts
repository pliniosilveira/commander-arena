// CasualAgent and Ninjutsu (src/casual-ninjutsu.ts; CR 702.49a, UNVERIFIED rule number: the CR text is not in the repository), on real engine states built with the scenario DSL and a
// SYNTHETIC Ninja: after the blockers are declared the agent puts a Ninja that hits harder than its weakest unblocked attacker in that attacker's place, and answers the cost's question
// (which attacker to return) with a creature the engine lists.
import type { CardDefinition } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { answer, answerFor, expectLegal } from './casual-helpers';

const NINJA = 'SYNTHETIC Casual Ninja';
const WEAK = 'SYNTHETIC Vanilla 1/1';
const STRONG = 'SYNTHETIC Vanilla 5/5';
const LIBRARY = Array.from({ length: 6 }, () => 'Swamp');

const ninja = (power: number): CardDefinition => ({
  oracleId: null,
  name: NINJA,
  layout: 'normal',
  support: 'supported',
  colorIdentity: ['B'],
  faces: [
    {
      name: NINJA,
      manaCost: ['1', 'B'],
      supertypes: [],
      types: ['creature'],
      subtypes: ['Human', 'Ninja'],
      colors: ['B'],
      power,
      toughness: 2,
      loyalty: null,
      defense: null,
      oracleText: 'SYNTHETIC',
      spell: null,
      abilities: [
        {
          kind: 'keyword',
          keyword: { kind: 'ninjutsu', cost: [{ kind: 'mana', symbols: ['1', 'B'] }] },
        },
      ],
    },
  ],
});

/** Seat 0 attacks with `attackers`, nothing blocks, and priority is at declare blockers with the Ninja in hand and two Swamps. */
function unblocked(power: number, attackers: readonly string[]) {
  const g = scenario()
    .define(ninja(power))
    .seat(0)
    .battlefield(...attackers, 'Swamp', 'Swamp')
    .hand(NINJA)
    .library(...LIBRARY)
    .seat(1)
    .library(...LIBRARY)
    .at('precombatMain', { active: 0 })
    .build();
  g.advanceTo('declareAttackers');
  g.act(0).attack([...attackers]);
  g.advanceTo('declareBlockers');
  return g;
}

describe('Ninjutsu', () => {
  test('a Ninja with more power than the unblocked attacker is put in its place', async () => {
    const g = unblocked(4, [WEAK]);
    const action = await answerFor(g);
    expect(action).toMatchObject({ kind: 'activate', object: g.id(NINJA) });
    expectLegal(g, action);
  });

  test('a Ninja with no more power than the unblocked attacker stays in hand', async () => {
    const g = unblocked(1, [WEAK]);
    expect(await answerFor(g)).toEqual({ kind: 'pass' });
  });

  test('the question of which attacker to return is answered with one the engine lists: the weaker', async () => {
    const g = unblocked(4, [WEAK, STRONG]);
    g.act(0).activate(NINJA, { pay: true });
    g.expect.pending('choosePermanent', 0);
    const action = await answer(g);
    expect(action).toEqual({ kind: 'choosePermanents', objects: [g.id(WEAK)] });
    expectLegal(g, action);
  });
});
