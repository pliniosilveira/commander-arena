// The AI's answers to a search for "up to two basic land cards that share a land type" (D-258): the decision carries the land types of the cards offered, and the engine's own
// validation is the judge of every answer. The land is SYNTHETIC (see the engine's synthetic-bruna-search.ts).
import { applyAction, type ChooseCardsDecision, type ObjectId } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { CasualAgent, RandomLegalAgent } from '../src/index';
import { CTX } from './helpers';

const LANDSCAPE = 'SYNTHETIC Twin Landscape';

function decisionOf(g: ScenarioGame): ChooseCardsDecision {
  const d = g.state.pending;
  if (d?.kind !== 'chooseCards') throw new Error(`expected chooseCards, got ${d?.kind}`);
  return d;
}

/** Seat 0 sacrifices the Landscape and resolves its search: the library top first, the battlefield besides the land and two Plains to pay. */
function landscape(library: readonly string[], battlefield: readonly string[] = []) {
  const b = scenario().seat(0).battlefield(LANDSCAPE, 'Plains', 'Plains');
  for (const name of battlefield) b.battlefield(name);
  for (const name of library) b.library(name);
  const g = b.seat(1).build();
  g.act(0).activate(LANDSCAPE, { pay: true });
  g.pass();
  g.pass();
  return g;
}

const typesOf = (g: ScenarioGame, objects: readonly ObjectId[]): string[] =>
  objects.map((id) => {
    const card = g.state.objects[id]?.card;
    const def = card === undefined || card === null ? undefined : g.state.cards[card];
    return def === undefined ? id : (g.state.definitions[def.definition]?.name ?? id);
  });

describe('RandomLegalAgent: a search for lands that share a land type', () => {
  test('60 seeds: every answer is accepted by the engine, never two lands of different types', async () => {
    const g = landscape(['Forest', 'Island', 'Forest', 'Mountain', 'Island', 'Plains']);
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

describe('CasualAgent: a search for lands that share a land type', () => {
  const decide = async (g: ScenarioGame) => {
    const agent = new CasualAgent({ seed: 1 });
    const action = await agent.decide(g.view(0), decisionOf(g), CTX);
    expect(agent.fallbacks).toHaveLength(0);
    expect(applyAction(g.state, 0, action).ok).toBe(true);
    return action;
  };

  test('finds two lands of a type there are two of, not one of each colour it lacks', async () => {
    // It has only Plains. Offered: a Forest, a Mountain, two Islands: the colours it lacks are three, but only the Islands make a pair.
    const g = landscape(['Forest', 'Mountain', 'Island', 'Island']);
    const action = await decide(g);
    expect(action.kind === 'chooseCards' ? typesOf(g, action.objects) : []).toEqual([
      'Island',
      'Island',
    ]);
  });

  test('among pairs it takes the one of a colour it has no land of', async () => {
    // It has Plains: the two Plains in the library are a pair too, but it has that colour; the two Swamps are a colour it lacks.
    const g = landscape(['Plains', 'Plains', 'Swamp', 'Swamp']);
    const action = await decide(g);
    expect(action.kind === 'chooseCards' ? typesOf(g, action.objects) : []).toEqual([
      'Swamp',
      'Swamp',
    ]);
  });

  test('with no pair it takes one land rather than nothing', async () => {
    const g = landscape(['Forest', 'Mountain']);
    const action = await decide(g);
    expect(action.kind === 'chooseCards' ? action.objects : []).toHaveLength(1);
  });
});
