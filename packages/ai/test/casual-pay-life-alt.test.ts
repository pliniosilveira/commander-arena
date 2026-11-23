// CasualAgent and the alternative cost that pays life ("If you control a Swamp, you may pay 4 life rather than pay this spell's mana cost", Snuff Out; CR 118.9, 118.4): it pays the
// life only when the ordinary cast cannot be paid and its life stays above `PAY_LIFE_ABOVE`, and it casts only what the engine lists. The card is SYNTHETIC, defined here.
import {
  type Action,
  type AlternativeCost,
  type CardDefinition,
  syntheticCard,
} from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { CasualAgent } from '../src/index';
import { CTX } from './helpers';

const SPELL = 'SYNTHETIC Life Instead';

const alternative: AlternativeCost = {
  kind: 'payLife',
  cost: [{ kind: 'mana', symbols: ['0'] }],
  life: 4,
  condition: { kind: 'controlsAtLeast', filter: { subtypes: ['Swamp'] }, count: 1 },
};

/** The engine's synthetic Flash Gain (an instant) with its text, cost and alternative cost replaced. */
function lifeInstead(): CardDefinition {
  const base = syntheticCard('SYNTHETIC Flash Gain');
  const face = base.faces[0];
  if (face === undefined) throw new Error('no face');
  return {
    ...base,
    name: SPELL,
    faces: [
      {
        ...face,
        name: SPELL,
        manaCost: ['3', 'B'],
        types: ['instant'],
        colors: ['B'],
        oracleText: 'Each opponent loses 3 life.',
        abilities: [],
        alternativeCosts: [alternative],
        spell: { effect: { kind: 'loseLife', player: { kind: 'eachOpponent' }, amount: 3 } },
      },
    ],
  } as CardDefinition;
}

const CARD = lifeInstead();

async function answer(g: ScenarioGame): Promise<Action> {
  const decision = g.state.pending;
  if (decision === null) throw new Error('nothing is pending');
  const view = g.view(decision.seat);
  if (view.pending === null) throw new Error('the seat does not see its decision');
  const action = await new CasualAgent({ seed: 1 }).decide(view, view.pending, CTX);
  expect(JSON.stringify(g.legalActions(decision.seat))).toContain(JSON.stringify(action));
  return action;
}

describe('pay life rather than the mana cost', () => {
  const board = (life: number, lands: readonly string[]) =>
    scenario({ seats: 3 })
      .define(CARD)
      .seat(0)
      .life(life)
      .hand(SPELL)
      .battlefield(...lands)
      .seat(1)
      .seat(2)
      .at('precombatMain', { active: 0 })
      .build();

  test('the ordinary cast cannot be paid and the life is plentiful: the life cost', async () => {
    const g = board(40, ['Swamp']);
    expect(await answer(g)).toEqual({
      kind: 'castSpell',
      object: g.id(SPELL),
      alternative: 'payLife',
    });
  });

  test('the life would be left in danger: no cast at all', async () => {
    const g = board(12, ['Swamp']);
    expect(await answer(g)).toEqual({ kind: 'pass' });
  });

  test('the mana can pay the ordinary cast: it does, and keeps its life', async () => {
    const g = board(40, ['Swamp', 'Swamp', 'Swamp', 'Swamp']);
    expect(await answer(g)).toEqual({ kind: 'castSpell', object: g.id(SPELL) });
  });
});
