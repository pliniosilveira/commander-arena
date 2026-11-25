// CasualAgent and the alternative cost that pays other mana ("You may pay {1}{B} rather than pay this spell's mana cost", Baleful Mastery; CR 118.9): it casts the spell for that cost when
// the ordinary cast cannot be paid, and only what the engine lists. The card is SYNTHETIC, defined here.
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

const SPELL = 'SYNTHETIC Mana Instead';

const alternative: AlternativeCost = {
  kind: 'payMana',
  cost: [{ kind: 'mana', symbols: ['1', 'B'] }],
};

/** The engine's synthetic Flash Gain (an instant) with its text, cost and alternative cost replaced. */
function manaInstead(): CardDefinition {
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

const CARD = manaInstead();

async function answer(g: ScenarioGame): Promise<Action> {
  const decision = g.state.pending;
  if (decision === null) throw new Error('nothing is pending');
  const view = g.view(decision.seat);
  if (view.pending === null) throw new Error('the seat does not see its decision');
  const action = await new CasualAgent({ seed: 1 }).decide(view, view.pending, CTX);
  expect(JSON.stringify(g.legalActions(decision.seat))).toContain(JSON.stringify(action));
  return action;
}

describe('pay other mana rather than the mana cost', () => {
  const board = (lands: readonly string[]) =>
    scenario({ seats: 3 })
      .define(CARD)
      .seat(0)
      .hand(SPELL)
      .battlefield(...lands)
      .seat(1)
      .seat(2)
      .at('precombatMain', { active: 0 })
      .build();

  test('the ordinary cast cannot be paid: the alternative cost', async () => {
    const g = board(['Swamp', 'Swamp']);
    expect(await answer(g)).toEqual({
      kind: 'castSpell',
      object: g.id(SPELL),
      alternative: 'payMana',
    });
  });

  test('the ordinary cast can be paid: it is the one without a drawback', async () => {
    const g = board(['Swamp', 'Swamp', 'Swamp', 'Swamp']);
    const action = await answer(g);
    expect(action).toMatchObject({ kind: 'castSpell', object: g.id(SPELL) });
    expect(action).not.toHaveProperty('alternative', 'payMana');
  });
});
