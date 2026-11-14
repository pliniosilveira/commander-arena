// CasualAgent and the Feather deck's group 1 (D-451, D-453): the color it chooses for "gains protection from the color of your choice until end of turn" (src/casual-protection.ts), and
// the spells of the group it reads as helping their target (src/casual-helpful.ts), so a pump or a protection goes on its own creature. The cards are the SYNTHETIC ones of
// src/cards/fixtures/synthetic-feather-g1.ts, in states built with the scenario DSL and answered through the same decision handling the agent uses in a game; the texts of the real cards
// are the ones of the issue.
import { applyAction, getLegalActions } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { helpsItsTarget } from '../src/casual-helpful';
import { HeuristicAgent, RandomLegalAgent } from '../src/index';
import { answer, expectLegal } from './casual-helpers';
import { CTX } from './helpers';

const WARD = 'SYNTHETIC Feather Ward';
const BOLT = 'Lightning Bolt';
const BEARS = 'Grizzly Bears'; // green
const SPIDER = 'Giant Spider'; // green
const GOBLIN = 'Raging Goblin'; // red
const ANGEL = 'Serra Angel'; // white
const LIBRARY = Array.from({ length: 8 }, () => 'Plains');

describe('the color it chooses', () => {
  test('in response to a Bolt aimed at its creature it chooses red, whatever the opponent has on the battlefield', async () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .hand(WARD)
      .battlefield('Plains')
      .battlefield(BEARS, { label: 'mine' })
      .seat(1)
      .library(...LIBRARY)
      .hand(BOLT)
      .battlefield('Mountain')
      // Three white creatures: the board alone would say white.
      .battlefield(ANGEL, ANGEL, ANGEL)
      .at('precombatMain', { active: 0, priority: 0 })
      .build();
    g.act(0).pass();
    g.act(1).cast(BOLT, { targets: ['mine'], pay: true });
    g.act(1).pass();
    g.act(0).cast(WARD, { targets: ['mine'], pay: true });
    g.passAll();
    const action = await answer(g);
    expect(action).toEqual({ kind: 'chooseOption', option: 'R' });
    expectLegal(g, action);
  });

  test('with nothing aimed at the creature it chooses the color most of the opponent’s permanents have, a creature counting more than another permanent', async () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .hand(WARD)
      .battlefield('Plains')
      .battlefield(BEARS, { label: 'mine' })
      .seat(1)
      .library(...LIBRARY)
      .battlefield('Mountain', 'Mountain', 'Mountain')
      .battlefield(SPIDER, SPIDER, GOBLIN)
      .at('precombatMain', { active: 0, priority: 0 })
      .build();
    g.act(0).cast(WARD, { targets: ['mine'], pay: true });
    g.passAll();
    // Two green creatures (6 points) against one red (3): lands are colorless.
    const action = await answer(g);
    expect(action).toEqual({ kind: 'chooseOption', option: 'G' });
    expectLegal(g, action);
  });

  test('with an empty opposing board it takes the first color and the answer is legal', async () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .hand(WARD)
      .battlefield('Plains')
      .battlefield(BEARS, { label: 'mine' })
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, priority: 0 })
      .build();
    g.act(0).cast(WARD, { targets: ['mine'], pay: true });
    g.passAll();
    const action = await answer(g);
    expect(action).toEqual({ kind: 'chooseOption', option: 'W' });
    expectLegal(g, action);
  });

  test('the HeuristicAgent and the RandomLegalAgent answer with one of the five colors, which the engine accepts', async () => {
    for (const agent of [new HeuristicAgent({ seed: 3 }), new RandomLegalAgent({ seed: 3 })]) {
      const g = scenario()
        .seat(0)
        .library(...LIBRARY)
        .hand(WARD)
        .battlefield('Plains')
        .battlefield(BEARS, { label: 'mine' })
        .seat(1)
        .library(...LIBRARY)
        .battlefield(GOBLIN)
        .at('precombatMain', { active: 0, priority: 0 })
        .build();
      g.act(0).cast(WARD, { targets: ['mine'], pay: true });
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

describe('what reads as helping (the texts of the real cards of the group)', () => {
  test.each([
    [
      'Target creature you control gains protection from the color of your choice until end of turn. Draw a card.',
      true,
    ],
    ['Target creature gains protection from red until end of turn.', true],
    ['Target creature becomes red and gains haste until end of turn. Draw a card.', true],
    [
      'Target creature gains trample until end of turn. It also gets +1/+0 until end of turn if you control a Mouse. Draw a card.',
      true,
    ],
    ["Until end of turn, double target creature's power and it gains first strike.", true],
    [
      'Put a +1/+1 counter on target creature. It gains flying until end of turn. Prevent all combat damage that would be dealt to it this turn.',
      true,
    ],
    [
      "Draw a card. Until end of turn, target creature gains trample and gets +1/+0 for each card you've drawn this turn.",
      true,
    ],
    // What still reads as hurting.
    ['Target creature becomes blue until end of turn.', false],
    ['Target creature becomes red until end of turn. ~ deals 2 damage to it.', false],
    ['Prevent all combat damage that would be dealt to target creature this turn.', false],
  ])('%s', (text, helps) => {
    expect(helpsItsTarget(text)).toBe(helps);
  });
});
