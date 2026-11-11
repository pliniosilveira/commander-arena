// CasualAgent and RandomLegalAgent answer "do one of these, as this resolves" (`chooseOne`, D-175, CR 608.2d) with an option the engine lists and
// accepts, on real engine states built with the scenario DSL and the SYNTHETIC cards of the engine's `synthetic-choose-one.ts`.
import { type Action, applyAction, getLegalActions } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { CasualAgent, RandomLegalAgent } from '../src/index';
import { CTX } from './helpers';

const LIBRARY = Array.from({ length: 8 }, () => 'Forest');

function offered(card: string): ScenarioGame {
  const g = scenario()
    .seat(0)
    .library(...LIBRARY)
    .hand(card)
    .battlefield('Forest', 'Forest', 'Forest')
    .seat(1)
    .library(...LIBRARY)
    .build();
  g.act(0).cast(card, { pay: true });
  g.passAll();
  return g;
}

async function decide(g: ScenarioGame, agent: CasualAgent | RandomLegalAgent): Promise<Action> {
  const view = g.view(0);
  if (view.pending === null) throw new Error('the seat does not see its decision');
  return agent.decide(view, view.pending, CTX);
}

function expectLegal(g: ScenarioGame, action: Action) {
  expect(
    getLegalActions(g.state, 0).some((a) => JSON.stringify(a) === JSON.stringify(action)),
  ).toBe(true);
  expect(applyAction(g.state, 0, action).ok).toBe(true);
}

describe('an instruction chosen as an effect resolves', () => {
  test('the casual agent takes the Treasure when one is offered', async () => {
    const g = offered('SYNTHETIC Fork Rite');
    g.expect.pending('chooseOption', 0);
    const a = await decide(g, new CasualAgent({ seed: 1 }));
    expect(a).toEqual({ kind: 'chooseOption', option: 'create a Treasure token' });
    expectLegal(g, a);
  });

  test('with neither a Treasure nor a card offered it takes the first option', async () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .hand('SYNTHETIC Fork Charm')
      .battlefield('Forest', 'Grizzly Bears')
      .seat(1)
      .library(...LIBRARY)
      .build();
    g.act(0).cast('SYNTHETIC Fork Charm', { targets: ['Grizzly Bears'], pay: true });
    g.passAll();
    const a = await decide(g, new CasualAgent({ seed: 1 }));
    expect(a).toEqual({ kind: 'chooseOption', option: 'gains flying' });
    expectLegal(g, a);
  });

  test('the random agent answers with an option the engine lists', async () => {
    const g = offered('SYNTHETIC Fork Rite');
    const a = await decide(g, new RandomLegalAgent({ seed: 3 }));
    expect(a.kind).toBe('chooseOption');
    expectLegal(g, a);
  });
});
