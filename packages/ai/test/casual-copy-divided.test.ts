// A copy of a spell that divides damage keeps the division (D-149, CR 707.10, 115.7f): the question of new targets for the copy has no
// division to announce, so every agent answers with exactly as many targets as the original had and no share, and the engine accepts it.
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { CasualAgent, RandomLegalAgent } from '../src/index';
import { CTX } from './helpers';

const VOLLEY = 'SYNTHETIC Arc Volley';
const TWIN = 'SYNTHETIC Twin Spell';
const FILLER = Array.from({ length: 8 }, () => 'Plains');

const copyQuestion = (): ScenarioGame => {
  const g = scenario()
    .seat(0)
    .library(...FILLER)
    .hand(VOLLEY, TWIN)
    .battlefield('Mountain', 'Island', 'Island', 'Island', 'Island')
    .seat(1)
    .library(...FILLER)
    .battlefield('SYNTHETIC Vanilla 5/5', { label: 'a' })
    .battlefield('SYNTHETIC Vanilla 5/5', { label: 'b' })
    .battlefield('SYNTHETIC Vanilla 2/2', { label: 'c' })
    .build();
  g.act(0).cast(VOLLEY, { targets: ['a', 'b'], divide: [2, 1], pay: true });
  g.act(0).cast(TWIN, { targets: [{ name: VOLLEY, zone: 'stack' }], pay: true });
  g.pass();
  g.pass();
  return g;
};

describe('new targets for a copy of a divided spell', () => {
  test('the casual agent answers with two targets and no share', async () => {
    const g = copyQuestion();
    const view = g.view(0);
    if (view.pending === null) throw new Error('no decision');
    const action = await new CasualAgent({ seed: 1 }).decide(view, view.pending, CTX);
    expect(action.kind).toBe('chooseTargets');
    if (action.kind !== 'chooseTargets') return;
    expect(action.targets).toHaveLength(2);
    expect(action.targets.every((t) => t.share === undefined)).toBe(true);
    g.choose(action);
    g.expect.invariants();
  });

  test('the random agent answers with one of the listed answers, for any seed', async () => {
    for (let seed = 1; seed <= 10; seed += 1) {
      const g = copyQuestion();
      const view = g.view(0);
      if (view.pending === null) throw new Error('no decision');
      const action = await new RandomLegalAgent({ seed }).decide(view, view.pending, CTX);
      expect(JSON.stringify(g.legalActions(0))).toContain(JSON.stringify(action));
      g.choose(action);
    }
  });
});
