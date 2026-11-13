// The agents and group 3 of the Hashaton deck (D-378 to D-380, provisional; SYNTHETIC cards of the engine fixtures `synthetic-hashaton-g3.ts`): "twice that many of those
// tokens", "draw two cards instead" and "can't have -1/-1 counters put on them" ask no new question. The one question they can bring is the order of two replacements of
// the creation of tokens, which is the `chooseOption` of purpose `replacement` that the Dragon and Thopter effects already ask (D-221); a replaced draw can bring the
// commander question of CR 903.9b for each of its draws. Each agent is checked on real engine states: every answer is one the engine lists and accepts.
import { getLegalActions } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { CasualAgent, HeuristicAgent, RandomLegalAgent } from '../src/index';
import { answer, expectLegal } from './casual-helpers';
import { askHeuristic } from './heuristic-helpers';

const LIBRARY = Array.from({ length: 12 }, () => 'Island');
const COMMANDER = 'Isamaru, Hound of Konda';

const agents: readonly [string, () => { decide: CasualAgent['decide'] }][] = [
  ['random', () => new RandomLegalAgent({ seed: 3 })],
  ['casual', () => new CasualAgent({ seed: 3 })],
];

/** The Thopter effect and the doubling are out and Treasure Pair resolves: the order of the two matters (5 tokens or 6), so the creator is asked. */
function atOrderQuestion(): ScenarioGame {
  const g = scenario()
    .seat(0)
    .hand('SYNTHETIC Treasure Pair')
    .battlefield('SYNTHETIC Thopter Automaton', 'SYNTHETIC Token Reign', 'Mountain', 'Mountain')
    .library(...LIBRARY)
    .seat(1)
    .library(...LIBRARY)
    .at('precombatMain')
    .build();
  g.act(0).cast('SYNTHETIC Treasure Pair', { pay: true });
  g.passAll();
  g.expect.pending('chooseOption', 0);
  return g;
}

/** A commander is on top of the library and Quick Study's draw is replaced by two: the question of CR 903.9b is asked for the first of them. */
function atCommanderQuestion(): ScenarioGame {
  const g = scenario()
    .seat(0)
    .hand('SYNTHETIC Quick Study')
    .battlefield('SYNTHETIC Draw Reign', 'Island')
    .library(COMMANDER, { commander: true })
    .library(...LIBRARY)
    .seat(1)
    .library(...LIBRARY)
    .at('precombatMain', { active: 0, turn: 3 })
    .build();
  g.act(0).cast('SYNTHETIC Quick Study', { pay: true });
  g.passAll();
  g.expect.pending('commanderZone', 0);
  return g;
}

describe('the order of the replacements of tokens: the question of old', () => {
  test.each(agents)('the %s agent answers with an action the engine lists', async (_n, make) => {
    const g = atOrderQuestion();
    const a = await answer(g, make());
    expectLegal(g, a);
  });

  test('the heuristic agent answers with an action the engine lists', async () => {
    const g = atOrderQuestion();
    const a = await askHeuristic(g, new HeuristicAgent({ seed: 1 }));
    expectLegal(g, a);
  });

  test('the question is the replacement `chooseOption`, with the effect of the doubling among the choices', () => {
    const g = atOrderQuestion();
    const d = g.state.pending;
    if (d?.kind !== 'chooseOption') throw new Error('not asked');
    expect(d.purpose).toBe('replacement');
    expect(d.replacement?.choices.map((c) => c.text)).toContain(
      'Create twice that many of those tokens instead',
    );
    expect(getLegalActions(g.state, 0).map((a) => a.kind)).toContain('chooseOption');
  });

  test.each(agents)('and the game goes on after the answer: the %s agent', async (_n, make) => {
    const g = atOrderQuestion();
    const a = await answer(g, make());
    g.choose(0, a);
    g.passAll();
    expect(g.state.pending?.kind).not.toBe('chooseOption');
    g.expect.invariants();
  });
});

describe('a replaced draw with a commander on top: the question of old', () => {
  test.each(agents)('the %s agent answers with an action the engine lists', async (_n, make) => {
    const g = atCommanderQuestion();
    const a = await answer(g, make());
    expectLegal(g, a);
  });

  test('the heuristic agent answers with an action the engine lists', async () => {
    const g = atCommanderQuestion();
    const a = await askHeuristic(g, new HeuristicAgent({ seed: 1 }));
    expectLegal(g, a);
  });

  test.each(agents)('both draws are made after the answer: the %s agent', async (_n, make) => {
    const g = atCommanderQuestion();
    const a = await answer(g, make());
    g.choose(0, a);
    // Either way the commander question comes once and the draws that replace the draw are completed.
    expect(g.state.pending?.kind).not.toBe('commanderZone');
    g.expect.invariants();
  });
});

describe('the other cards of the group ask nothing', () => {
  test.each(agents)(
    'a turn with the reign, the wards and the spells: the %s agent',
    async (_n, make) => {
      const g = scenario()
        .seat(0)
        .hand('SYNTHETIC Muster Call', 'SYNTHETIC Quick Study', 'SYNTHETIC Rot Boon')
        .battlefield(
          'SYNTHETIC Twin Reign',
          'SYNTHETIC Counter Ward',
          'Plains',
          'Plains',
          'Island',
          'Swamp',
        )
        .battlefield('Grizzly Bears', { label: 'mine' })
        .library(...LIBRARY)
        .seat(1)
        .library(...LIBRARY)
        .at('precombatMain')
        .build();
      g.act(0).cast('SYNTHETIC Muster Call', { pay: true });
      g.passAll();
      g.act(0).cast('SYNTHETIC Quick Study', { pay: true });
      g.passAll();
      g.act(0).cast('SYNTHETIC Rot Boon', { targets: ['mine'], pay: true });
      g.passAll();
      expect(g.object('mine').counters['-1/-1']).toBeUndefined();
      const a = await answer(g, make());
      expectLegal(g, a);
    },
  );
});
