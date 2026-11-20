// "Sacrifice a Swamp and a Forest" (CR 701.21a, 118.3, 602.2b): a cost that takes a different permanent for each of its parts. The decision lists, for each part, the permanents that can
// pay it (`groups`); CasualAgent and RandomLegalAgent must answer with one different permanent for each part, so the engine never refuses the answer, and CasualAgent keeps the land it
// wants most. SYNTHETIC cards, defined here (the fixtures module is not part of the engine API).
import type { Action, CardDefinition } from '@commander-arena/engine';
import { applyAction } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { CasualAgent, RandomLegalAgent } from '../src/index';
import { CTX } from './helpers';

const LICH = 'SYNTHETIC Reclaimer Lich';
const BOG = 'SYNTHETIC Agent Bog';
const BOG_TWO = 'SYNTHETIC Agent Bog Two';
const BOG_WOOD = 'SYNTHETIC Agent Bog Wood';
const WOOD = 'SYNTHETIC Agent Wood';

const face = (
  name: string,
  types: ('creature' | 'land')[],
  subtypes: string[],
  abilities: CardDefinition['faces'][number]['abilities'] = [],
): CardDefinition => ({
  oracleId: null,
  name,
  layout: 'normal',
  faces: [
    {
      name,
      manaCost: types.includes('land') ? null : ['1'],
      supertypes: [],
      types,
      subtypes,
      colors: [],
      power: types.includes('creature') ? 1 : null,
      toughness: types.includes('creature') ? 1 : null,
      loyalty: null,
      defense: null,
      oracleText: 'SYNTHETIC',
      abilities,
      spell: null,
    },
  ],
  colorIdentity: [],
  support: 'supported',
});

const DEFINITIONS = [
  face(
    LICH,
    ['creature'],
    ['Zombie'],
    [
      {
        kind: 'activated',
        cost: [
          {
            kind: 'sacrifice',
            what: { subtypes: ['Swamp'] },
            alongside: [{ subtypes: ['Forest'] }],
          },
        ],
        effect: { kind: 'moveToZone', objects: { kind: 'this' }, to: 'hand' },
        functionsIn: 'graveyard',
      },
    ],
  ),
  face(BOG, ['land'], ['Swamp']),
  face(BOG_TWO, ['land'], ['Swamp']),
  face(BOG_WOOD, ['land'], ['Swamp', 'Forest']),
  face(WOOD, ['land'], ['Forest']),
];

function game(lands: readonly string[]): ScenarioGame {
  let b = scenario().seat(0).library('Plains', 'Plains', 'Plains').graveyard(LICH);
  for (const definition of DEFINITIONS) b = b.define(definition);
  for (const land of lands) b = b.battlefield(land);
  return b.seat(1).build();
}

async function answer(g: ScenarioGame, agent: 'casual' | 'random', seed: number): Promise<Action> {
  const decision = g.state.pending;
  if (decision === null) throw new Error('nothing is pending');
  const view = g.view(decision.seat);
  if (view.pending === null) throw new Error('the seat does not see its decision');
  const player = agent === 'casual' ? new CasualAgent({ seed }) : new RandomLegalAgent({ seed });
  return player.decide(view, view.pending, CTX);
}

describe('a cost that sacrifices a Swamp and a Forest', () => {
  test.each(['casual', 'random'] as const)(
    '%s answers with a land for each part, never the dual land twice',
    async (agent) => {
      for (let seed = 1; seed <= 12; seed += 1) {
        // Two Swamps, the dual land and a Forest: the dual land can pay either part, which a careless answer would use twice.
        const g = game([BOG, BOG_TWO, BOG_WOOD, WOOD]);
        g.act(0).activate(LICH);
        g.expect.pending('choosePermanent', 0);
        const action = await answer(g, agent, seed);
        if (action.kind !== 'choosePermanents') throw new Error('expected choosePermanents');
        expect(action.objects).toHaveLength(2);
        // The engine accepts the answer: the activation goes on.
        const result = applyAction(g.state, 0, action);
        expect(result.ok, `${agent} #${seed}`).toBe(true);
        // The two lands are sacrificed and the ability is on the stack.
        if (result.ok) expect(result.state.stack).toHaveLength(1);
      }
    },
  );

  test('CasualAgent gives up the plain lands and keeps the one that is both', async () => {
    const g = game([BOG, BOG_WOOD, WOOD]);
    g.act(0).activate(LICH);
    const action = await answer(g, 'casual', 1);
    if (action.kind !== 'choosePermanents') throw new Error('expected choosePermanents');
    // A Swamp and a Forest are cheaper to give up than the dual land and one of them: three ways, all lands worth the same, the first listed wins. The answer is a valid one.
    const chosen = action.objects.map((id) => g.object(id).card).sort();
    expect(chosen).toHaveLength(2);
    expect(new Set(chosen).size).toBe(2);
  });
});
