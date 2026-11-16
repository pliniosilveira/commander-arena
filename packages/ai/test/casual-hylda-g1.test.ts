// CasualAgent and the Hylda deck's group 1 (D-514): the card type it chooses for "gains protection from the card type of your choice until end of turn" (src/casual-protection.ts). The
// card is the SYNTHETIC one of src/cards/fixtures/synthetic-hylda-g1.ts, in states built with the scenario DSL and answered through the same decision handling the agent uses in a game.
import { applyAction, getLegalActions } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { HeuristicAgent, RandomLegalAgent } from '../src/index';
import { answer, expectLegal } from './casual-helpers';
import { CTX } from './helpers';

const HALFLING = 'SYNTHETIC Citadel Halfling';
const BOLT = 'Lightning Bolt';
const BEARS = 'Grizzly Bears';
const SPIDER = 'Giant Spider';
const LIBRARY = Array.from({ length: 8 }, () => 'Plains');

describe('the card type it chooses', () => {
  test('in response to a Bolt aimed at its creature it chooses instant, whatever the opponent has on the battlefield', async () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(HALFLING)
      .battlefield(BEARS, { label: 'mine' })
      .seat(1)
      .library(...LIBRARY)
      .hand(BOLT)
      .battlefield('Mountain')
      .battlefield(SPIDER, SPIDER)
      .at('precombatMain', { active: 0, priority: 0, turn: 3 })
      .build();
    g.act(0).pass();
    g.act(1).cast(BOLT, { targets: ['mine'], pay: true });
    g.act(1).pass();
    g.act(0).activate(HALFLING, { targets: ['mine'] });
    g.passAll();
    const action = await answer(g);
    expect(action).toEqual({ kind: 'chooseOption', option: 'instant' });
    expectLegal(g, action);
  });

  test('with nothing aimed at the creature it chooses the card type most of the opponent’s permanents have: creatures, which can block it', async () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(HALFLING)
      .battlefield(BEARS, { label: 'mine' })
      .seat(1)
      .library(...LIBRARY)
      .battlefield('Mountain', 'Mountain', 'Mountain')
      .battlefield(SPIDER)
      .at('precombatMain', { active: 0, priority: 0, turn: 3 })
      .build();
    g.act(0).activate(HALFLING, { targets: ['mine'] });
    g.passAll();
    const action = await answer(g);
    expect(action).toEqual({ kind: 'chooseOption', option: 'creature' });
    expectLegal(g, action);
  });

  test('with an empty opposing board it takes creature and the answer is legal', async () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(HALFLING)
      .battlefield(BEARS, { label: 'mine' })
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, priority: 0, turn: 3 })
      .build();
    g.act(0).activate(HALFLING, { targets: ['mine'] });
    g.passAll();
    const action = await answer(g);
    expect(action).toEqual({ kind: 'chooseOption', option: 'creature' });
    expectLegal(g, action);
  });

  test('the HeuristicAgent and the RandomLegalAgent answer with one of the nine card types, which the engine accepts', async () => {
    for (const agent of [new HeuristicAgent({ seed: 3 }), new RandomLegalAgent({ seed: 3 })]) {
      const g = scenario()
        .seat(0)
        .library(...LIBRARY)
        .battlefield(HALFLING)
        .battlefield(BEARS, { label: 'mine' })
        .seat(1)
        .library(...LIBRARY)
        .battlefield(SPIDER)
        .at('precombatMain', { active: 0, priority: 0, turn: 3 })
        .build();
      g.act(0).activate(HALFLING, { targets: ['mine'] });
      g.passAll();
      const view = g.view(0);
      if (view.pending === null) throw new Error('no decision');
      const action = await agent.decide(view, view.pending, CTX);
      expect(action.kind).toBe('chooseOption');
      expect(
        getLegalActions(g.state, 0).some((a) => JSON.stringify(a) === JSON.stringify(action)),
      ).toBe(true);
      expect(applyAction(g.state, 0, action).ok).toBe(true);
    }
  });
});
