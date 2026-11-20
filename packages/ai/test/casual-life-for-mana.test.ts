// "Rather than pay the mana cost of the next spell you cast this turn, you may pay life equal to that spell's mana value" (Marshland Bloodcaster, issue 190): the engine lists a
// `castSpell { alternative: 'lifeForMana' }` option beside the ordinary cast. The agents pay life only for a card the mana cannot cast and only while the life left stays above
// `PAY_LIFE_ABOVE`; they never send what the engine did not list, and none of them stalls with the option on the table (CR 118.9, 119.4).
import type { Action } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { CasualAgent, GreedyAgent, HeuristicAgent } from '../src/index';
import { CTX } from './helpers';

const CASTER = 'SYNTHETIC Life Caster';

function armed(life: number, mana = ''): ScenarioGame {
  const g = scenario()
    .seat(0)
    .life(life)
    .pool(mana)
    .battlefield(CASTER)
    .hand('Grizzly Bears')
    .seat(1)
    .library('Island', 'Island', 'Island')
    .at('precombatMain', { active: 0, turn: 3 })
    .build();
  g.act(0).activate(CASTER);
  g.passAll();
  return g;
}

async function answer(
  g: ScenarioGame,
  agent: CasualAgent | GreedyAgent | HeuristicAgent,
): Promise<Action> {
  const decision = g.state.pending;
  if (decision === null) throw new Error('nothing is pending');
  const view = g.view(decision.seat);
  if (view.pending === null) throw new Error('the seat does not see its decision');
  const action = await agent.decide(view, view.pending, CTX);
  expect(JSON.stringify(g.legalActions(decision.seat))).toContain(JSON.stringify(action));
  return action;
}

const agents = {
  casual: () => new CasualAgent({ seed: 1 }),
  greedy: () => new GreedyAgent({ seed: 1 }),
  heuristic: () => new HeuristicAgent({ seed: 1 }),
};

describe.each(Object.entries(agents))('%s agent', (_name, make) => {
  test('a card it cannot pay for is cast for life while the life stays high', async () => {
    const g = armed(20);
    const action = await answer(g, make());
    expect(action).toEqual({
      kind: 'castSpell',
      object: g.id('Grizzly Bears'),
      alternative: 'lifeForMana',
    });
  });

  test('it never pays life that would leave it in danger', async () => {
    const g = armed(11);
    const action = await answer(g, make());
    expect(action.kind).not.toBe('castSpell');
  });
});

test('the casual agent pays mana, not life, for a card it can pay for', async () => {
  const g = armed(20, 'GG');
  const action = await answer(g, new CasualAgent({ seed: 1 }));
  expect(action).toEqual({ kind: 'castSpell', object: g.id('Grizzly Bears') });
});
