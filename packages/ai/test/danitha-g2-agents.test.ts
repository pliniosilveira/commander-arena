// The agents and group 2 of the Danitha deck (D-1220, D-1221 provisional; SYNTHETIC cards of the engine fixtures `synthetic-danitha-g2.ts`): "Mill four cards. You may put a land card
// from among them into your hand." asks the question that already exists, a `chooseCards` of purpose `move` (no new decision kind), among the cards the mill put into the
// graveyard. Each agent is checked on real engine states: every answer is one the engine lists and accepts, and the casual agent takes the most expensive card it may.
import { getLegalActions } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { CasualAgent, HeuristicAgent, RandomLegalAgent } from '../src/index';
import { answer, expectLegal, sameAction } from './casual-helpers';
import { askHeuristic } from './heuristic-helpers';

const TILLING = 'SYNTHETIC Mill Four Tilling';
const SCOUT = 'SYNTHETIC Mill Three Scout';

/** The four cards on top are `top`; the spell is resolving and its question is pending. */
function asked(spell: string, top: readonly string[]): ScenarioGame {
  let b = scenario().seat(0).hand(spell).pool('GCC');
  for (const [i, name] of top.entries())
    b = b.library(name, { label: String.fromCharCode(97 + i) });
  const g = b
    .library('Swamp')
    .library('Plains')
    .seat(1)
    .library('Plains')
    .library('Plains')
    .at('precombatMain', { active: 0, turn: 1 })
    .build();
  g.act(0).cast(spell, { pay: true });
  g.passAll();
  g.expect.pending('chooseCards', 0);
  return g;
}

const TOP = ['Island', 'Grizzly Bears', 'Lightning Bolt', 'Serra Angel'];

const agents: readonly [string, () => { decide: CasualAgent['decide'] }][] = [
  ['random', () => new RandomLegalAgent({ seed: 3 })],
  ['casual', () => new CasualAgent({ seed: 3 })],
];

describe('the question of the cards milled', () => {
  test.each(agents)('the %s agent answers with an action the engine lists', async (_n, make) => {
    const g = asked(TILLING, TOP);
    expectLegal(g, await answer(g, make()));
  });

  test('the heuristic agent answers with an action the engine lists', async () => {
    const g = asked(TILLING, TOP);
    expectLegal(g, await askHeuristic(g, new HeuristicAgent({ seed: 1 })));
  });

  test('the casual agent takes the most expensive permanent card it may: Serra Angel, not the instant', async () => {
    const g = asked(TILLING, TOP);
    const a = await answer(g, new CasualAgent({ seed: 3 }));
    expect(a).toEqual({ kind: 'chooseCards', objects: [g.id('d')] });
  });

  test('a card that was not milled is never chosen (a card already in the graveyard is not offered)', async () => {
    let b = scenario().seat(0).hand(TILLING).pool('GCC').graveyard('Serra Angel');
    for (const [i, name] of [
      'Island',
      'Lightning Bolt',
      'Lightning Bolt',
      'Lightning Bolt',
    ].entries())
      b = b.library(name, { label: String.fromCharCode(97 + i) });
    const g = b
      .library('Swamp')
      .seat(1)
      .library('Plains')
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.act(0).cast(TILLING, { pay: true });
    g.passAll();
    const a = await answer(g, new CasualAgent({ seed: 3 }));
    expectLegal(g, a);
    expect(a).toEqual({ kind: 'chooseCards', objects: [g.id('a')] });
  });

  test('only the deciding seat is asked, and declining is a legal answer', () => {
    const g = asked(SCOUT, ['Island', 'Grizzly Bears', 'Forest', 'Serra Angel']);
    expect(getLegalActions(g.state, 1)).toEqual([]);
    expect(
      getLegalActions(g.state, 0).some((a) => sameAction(a, { kind: 'chooseCards', objects: [] })),
    ).toBe(true);
  });
});
