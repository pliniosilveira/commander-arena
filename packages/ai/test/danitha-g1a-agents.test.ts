// The agents and group 1A of the Danitha deck (D-1200, D-1201; SYNTHETIC cards of the engine fixtures `synthetic-danitha-g1a.ts`): "Reveal the top five cards of your library. You
// may put a creature or enchantment card from among them into your hand. Put the rest into your graveyard." asks the question that already exists, a `chooseCards` of purpose
// `lookTake` (no new decision kind): the cards revealed are public, the card taken is the player's choice. Each agent is checked on real engine states: every answer is one the
// engine lists and accepts; the casual agent takes the most expensive card it may, and the question is the same whether the top is revealed or only looked at.
import { getLegalActions } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { CasualAgent, HeuristicAgent, RandomLegalAgent } from '../src/index';
import { answer, expectLegal, sameAction } from './casual-helpers';
import { askHeuristic } from './heuristic-helpers';

const SORCERY = 'SYNTHETIC Reveal Five Sorcery';
const SPAWN = 'SYNTHETIC Reveal Four Permanent Spawn';

/** The five cards on top: Island, Grizzly Bears (2), Lightning Bolt, Serra Angel (5) and Forest; the card is resolving, and its question is pending. */
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

const TOP = ['Island', 'Grizzly Bears', 'Lightning Bolt', 'Serra Angel', 'Forest'];

const agents: readonly [string, () => { decide: CasualAgent['decide'] }][] = [
  ['random', () => new RandomLegalAgent({ seed: 3 })],
  ['casual', () => new CasualAgent({ seed: 3 })],
];

describe('the question of the cards revealed', () => {
  test.each(agents)('the %s agent answers with an action the engine lists', async (_n, make) => {
    const g = asked(SORCERY, TOP);
    expectLegal(g, await answer(g, make()));
  });

  test('the heuristic agent answers with an action the engine lists', async () => {
    const g = asked(SORCERY, TOP);
    const a = await askHeuristic(g, new HeuristicAgent({ seed: 1 }));
    expectLegal(g, a);
  });

  test('the casual agent takes the most expensive card it may: Serra Angel, not Grizzly Bears', async () => {
    const g = asked(SORCERY, TOP);
    const a = await answer(g, new CasualAgent({ seed: 3 }));
    expect(a).toEqual({ kind: 'chooseCards', objects: [g.id('d')] });
  });

  test('with only lands and an instant to find, a card that may not be taken is never chosen, and a permanent card may', async () => {
    const g = asked(SPAWN, ['Lightning Bolt', 'Island', 'Forest', 'Lightning Bolt', 'Swamp']);
    const a = await answer(g, new CasualAgent({ seed: 3 }));
    expectLegal(g, a);
    if (a.kind !== 'chooseCards') throw new Error('expected chooseCards');
    expect(a.objects).toHaveLength(1);
    expect([g.id('b'), g.id('c')]).toContain(a.objects[0]);
  });

  test('only the deciding seat is asked: the other seat has nothing to answer', () => {
    const g = asked(SORCERY, TOP);
    expect(getLegalActions(g.state, 1)).toEqual([]);
    expect(
      getLegalActions(g.state, 0).some((a) => sameAction(a, { kind: 'chooseCards', objects: [] })),
    ).toBe(true);
  });
});
