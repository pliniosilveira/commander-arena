// HeuristicAgent instant-speed windows: the play of the opponent's end step is judged like a main-phase
// play, by what it does to the board on the sample (`vetPlays`). A board wipe at instant speed that the
// text filter does not know was cast at the end of the opponent's turn whatever the boards were.
import type { CardDefinition } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { HeuristicAgent } from '../src/index';
import { askHeuristic, lastReason } from './heuristic-helpers';

const BEARS = 'Grizzly Bears';

/** SYNTHETIC: an instant that destroys every creature; its text is one no text filter recognizes. */
const FLASH_PURGE: CardDefinition = {
  oracleId: null,
  name: 'SYNTHETIC Flash Purge',
  layout: 'normal',
  faces: [
    {
      name: 'SYNTHETIC Flash Purge',
      manaCost: ['2', 'W', 'W'],
      supertypes: [],
      types: ['instant'],
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

function endStep(own: number, theirs: number) {
  let b = scenario()
    .define(FLASH_PURGE)
    .seat(0)
    .hand(FLASH_PURGE.name)
    .battlefield('Plains', 'Plains', 'Plains', 'Plains')
    .library('Plains', { count: 4 });
  for (let i = 0; i < own; i += 1) b = b.battlefield(BEARS);
  b = b.seat(1).library('Plains', { count: 4 });
  for (let i = 0; i < theirs; i += 1) b = b.battlefield(BEARS);
  const g = b.at('end', { active: 1 }).build();
  g.act(1).pass();
  return g;
}

describe("the opponent's end step", () => {
  test('a wipe is cast when the opponent loses more than the agent', async () => {
    const g = endStep(1, 5);
    const agent = new HeuristicAgent({ seed: 1 });
    expect(await askHeuristic(g, agent)).toMatchObject({
      kind: 'castSpell',
      object: g.id(FLASH_PURGE.name),
    });
    expect(lastReason(agent)?.reason).toBe('end-step');
  });

  test('a wipe is held when the agent has five creatures and the opponent one', async () => {
    const g = endStep(5, 1);
    expect(await askHeuristic(g)).toEqual({ kind: 'pass' });
  });
});
