// The agents and group 1 of the Prismari deck (issue 87, D-625, SYNTHETIC cards of the engine fixtures `synthetic-prismari-g1.ts`): populate asks one new question, which creature
// token it copies (a `choosePermanent`, purpose `populate`, CR 701.36a). Each agent is checked on a real engine state: the answer is one the engine lists and accepts, and the
// casual agent (and the heuristic agent, which delegates) copies the creature token that makes the best copy, whichever is listed first.
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { CasualAgent, HeuristicAgent, RandomLegalAgent } from '../src/index';
import { answer, expectLegal } from './casual-helpers';
import { askHeuristic } from './heuristic-helpers';

const ENGINE = 'SYNTHETIC Iteration Engine';
const SOLDIER_CALL = 'SYNTHETIC Soldier Call'; // a 1/1 Soldier token
const BEAST_CALL = 'SYNTHETIC Beast Call'; // a 3/3 Beast token
const LIBRARY = Array.from({ length: 8 }, () => 'Plains');

/** Seat 0 has the engine, a Soldier and a Beast token (made in this order, or the other), and the populate trigger is resolving: its question is pending. */
function atPopulateQuestion(order: readonly string[] = [SOLDIER_CALL, BEAST_CALL]): ScenarioGame {
  const g = scenario()
    .seat(0)
    .library(...LIBRARY)
    .battlefield(ENGINE)
    .battlefield('Plains', 'Plains', 'Plains', 'Forest', 'Forest', 'Forest')
    .hand(...order)
    .seat(1)
    .library(...LIBRARY)
    .at('precombatMain', { active: 0 })
    .build();
  for (const name of order) {
    g.act(0).cast({ name, zone: 'hand', seat: 0, nth: 0 }, { pay: true });
    g.passAll();
  }
  g.advanceTo('beginningOfCombat');
  g.passAll();
  g.expect.pending('choosePermanent', 0);
  return g;
}

const beast = (g: ScenarioGame) =>
  g.find({ name: 'Beast', zone: 'battlefield', seat: 0 }).map((o) => o.id);

describe('the question: which creature token does populate copy?', () => {
  test.each([
    ['random', () => new RandomLegalAgent({ seed: 3 })],
    ['casual', () => new CasualAgent({ seed: 3 })],
  ] as const)('the %s agent answers with an action the engine lists', async (_n, make) => {
    const g = atPopulateQuestion();
    const d = g.state.pending;
    if (d?.kind !== 'choosePermanent') throw new Error('expected the question of the token');
    expect(d.purpose).toBe('populate');
    expect(d.legal).toHaveLength(2);
    expectLegal(g, await answer(g, make()));
  });

  test('the heuristic agent answers with an action the engine lists', async () => {
    const g = atPopulateQuestion();
    expectLegal(g, await askHeuristic(g, new HeuristicAgent({ seed: 1 })));
  });

  test('the casual agent copies the token with the most power and toughness, whichever was made first', async () => {
    for (const order of [
      [SOLDIER_CALL, BEAST_CALL],
      [BEAST_CALL, SOLDIER_CALL],
    ]) {
      const g = atPopulateQuestion(order);
      expect(await answer(g, new CasualAgent({ seed: 3 }))).toEqual({
        kind: 'choosePermanents',
        objects: beast(g),
      });
    }
  });

  test('the heuristic agent, which delegates, makes the same choice', async () => {
    const g = atPopulateQuestion();
    expect(await askHeuristic(g, new HeuristicAgent({ seed: 1 }))).toEqual({
      kind: 'choosePermanents',
      objects: beast(g),
    });
  });

  test('the answer is played: a second Beast token is made, with haste', async () => {
    const g = atPopulateQuestion();
    g.choose(0, await answer(g, new CasualAgent({ seed: 3 })));
    g.passAll();
    expect(beast(g)).toHaveLength(2);
    g.expect.invariants();
  });
});
