// HeuristicAgent main phase: a play is cast only when the board it leaves is better than the board
// without it (`spellDelta`, evaluate(after) - evaluate(before) on the determinized sample). Board wipes
// are the case that counts: the old filters only looked at the text and at how many creatures each side
// had. Real engine states from the scenario DSL.
import type { CardDefinition } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { HeuristicAgent } from '../src/index';
import { askHeuristic, creature, lastReason } from './heuristic-helpers';

const WRATH = 'SYNTHETIC Wrath'; // sorcery 2WW: "Destroy all creatures."
const BEARS = 'Grizzly Bears';
const V5 = 'SYNTHETIC Vanilla 5/5';

/** SYNTHETIC: a wipe whose text no text filter recognizes ("every", not "all" or "each"). */
const PURGE: CardDefinition = {
  oracleId: null,
  name: 'SYNTHETIC Purge',
  layout: 'normal',
  faces: [
    {
      name: 'SYNTHETIC Purge',
      manaCost: ['2', 'W', 'W'],
      supertypes: [],
      types: ['sorcery'],
      subtypes: [],
      colors: ['W'],
      power: null,
      toughness: null,
      loyalty: null,
      defense: null,
      oracleText: 'Destroy every creature.',
      abilities: [],
      spell: {
        effect: {
          kind: 'destroy',
          objects: { kind: 'each', filter: { zone: 'battlefield', types: ['creature'] } },
        },
      },
    },
  ],
  colorIdentity: ['W'],
  support: 'supported',
};

const SMALL = creature('SYNTHETIC Small', 1, 1, [], { cost: ['1'] });

function wipeGame(wipe: string, own: string[], theirs: string[]) {
  let b = scenario()
    .define(PURGE)
    .define(SMALL)
    .seat(0)
    .hand(wipe)
    .battlefield('Plains', 'Plains', 'Plains', 'Plains')
    .library('Plains', { count: 4 });
  for (const name of own) b = b.battlefield(name);
  b = b.seat(1).library('Plains', { count: 4 });
  for (const name of theirs) b = b.battlefield(name);
  return b.at('precombatMain', { active: 0 }).build();
}

describe.each([
  ['a wipe the text filter knows', WRATH],
  ['a wipe the text filter does not know', PURGE.name],
])('%s', (_label, wipe) => {
  test('it is cast when the opponent loses more than the agent', async () => {
    const g = wipeGame(wipe, [BEARS], [BEARS, BEARS, BEARS, BEARS, BEARS]);
    const action = await askHeuristic(g);
    expect(action).toMatchObject({ kind: 'castSpell', object: g.id(wipe) });
  });

  test('it is held when the agent has five creatures and the opponent one', async () => {
    const g = wipeGame(wipe, [BEARS, BEARS, BEARS, BEARS, BEARS], [BEARS]);
    const agent = new HeuristicAgent({ seed: 1 });
    expect(await askHeuristic(g, agent)).toEqual({ kind: 'pass' });
  });

  test('it is held when the agent has fewer creatures but they are worth far more', async () => {
    // The opponent has two 1/1s, the agent one 5/5: the count says wipe, the board says do not.
    const g = wipeGame(wipe, [V5], [SMALL.name, SMALL.name]);
    const agent = new HeuristicAgent({ seed: 1 });
    expect(await askHeuristic(g, agent)).toEqual({ kind: 'pass' });
    expect(lastReason(agent)?.reason).not.toBe('curve');
  });
});
