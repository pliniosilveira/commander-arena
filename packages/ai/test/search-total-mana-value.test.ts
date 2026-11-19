// The AI's answers to a search for "any number of creature cards with total mana value 6 or less" (CR 701.23, 202.3): the decision carries the mana value of every card
// offered and the limit, and the engine's own validation is the judge of every answer. The cards are SYNTHETIC (see the engine's synthetic-hulk-search.ts).
import { applyAction, type ChooseCardsDecision } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { CasualAgent, RandomLegalAgent } from '../src/index';
import { CTX } from './helpers';

const HULK = 'SYNTHETIC Hulking Beast';

function decisionOf(g: ScenarioGame): ChooseCardsDecision {
  const d = g.state.pending;
  if (d?.kind !== 'chooseCards') throw new Error(`expected chooseCards, got ${d?.kind}`);
  return d;
}

/** Seat 0 kills its own Hulk with a Bolt; the trigger searches the library cards given (name and label). */
function hulk(library: readonly (readonly [string, string])[]) {
  const b = scenario().seat(0).battlefield(HULK, 'Mountain').hand('Lightning Bolt');
  for (const [name, label] of library) b.library(name, { label });
  const g = b.seat(1).library('Island').at('precombatMain').build();
  g.act(0).cast('Lightning Bolt', { targets: [HULK], pay: true });
  g.passAll();
  g.passAll();
  return g;
}

const LIBRARY: readonly (readonly [string, string])[] = [
  ['SYNTHETIC Free Beast', 'free'],
  ['SYNTHETIC Two Beast', 'two'],
  ['SYNTHETIC Four Beast', 'four'],
  ['SYNTHETIC Six Beast', 'six'],
  ['SYNTHETIC X Beast', 'x1'],
];

describe('RandomLegalAgent: a search with a total mana value', () => {
  test('60 seeds: every answer is accepted by the engine, never over the limit', async () => {
    const g = hulk(LIBRARY);
    const d = decisionOf(g);
    const view = g.view(0);
    for (let seed = 1; seed <= 60; seed += 1) {
      const agent = new RandomLegalAgent({ seed });
      const action = await agent.decide(view, d, CTX);
      expect(action.kind, `seed ${seed}`).toBe('chooseCards');
      expect(applyAction(g.state, 0, action).ok, `seed ${seed}`).toBe(true);
      expect(agent.fallbacks, `seed ${seed}`).toHaveLength(0);
    }
  });
});

describe('CasualAgent: a search with a total mana value', () => {
  test('finds the most it can within the limit, the most expensive cards first, and the engine accepts it', async () => {
    const g = hulk(LIBRARY);
    const agent = new CasualAgent({ seed: 1 });
    const action = await agent.decide(g.view(0), decisionOf(g), CTX);
    expect(agent.fallbacks).toHaveLength(0);
    expect(action).toEqual({
      kind: 'chooseCards',
      objects: expect.arrayContaining([g.id('six'), g.id('free')]),
    });
    // The Six Beast fills the limit; the free card (and the {X}{1} card, 1, only if it fits: it does not) is added.
    if (action.kind !== 'chooseCards') throw new Error('expected chooseCards');
    expect(action.objects).toHaveLength(2);
    expect(applyAction(g.state, 0, action).ok).toBe(true);
  });

  test('takes everything when everything fits', async () => {
    const g = hulk([
      ['SYNTHETIC Free Beast', 'free'],
      ['SYNTHETIC Two Beast', 'two'],
      ['SYNTHETIC X Beast', 'x1'],
    ]);
    const agent = new CasualAgent({ seed: 1 });
    const action = await agent.decide(g.view(0), decisionOf(g), CTX);
    if (action.kind !== 'chooseCards') throw new Error('expected chooseCards');
    expect([...action.objects].sort()).toEqual([g.id('free'), g.id('two'), g.id('x1')].sort());
    expect(applyAction(g.state, 0, action).ok).toBe(true);
  });
});
