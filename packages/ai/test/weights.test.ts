// The tunable weights of the HeuristicAgent (issue 624, phase 2): `withWeights` merges deeply without
// touching the defaults, a weight moves the evaluator the way its name says, and an agent built with
// `DEFAULT_WEIGHTS` decides exactly as one built without weights.
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { DEFAULT_WEIGHTS, evaluate, HeuristicAgent, withWeights } from '../src/index';
import { askHeuristic } from './heuristic-helpers';

const BEARS = 'Grizzly Bears'; // 2/2
const SPIDER = 'Giant Spider'; // 2/4 reach

/** Seat 1 attacks seat 0 with Grizzly Bears; seat 0 can block with Giant Spider. */
function blockSetup() {
  const g = scenario()
    .seat(0)
    .battlefield(SPIDER, 'Forest', 'Forest')
    .library('Island', { count: 4 })
    .seat(1)
    .battlefield(BEARS)
    .library('Island', { count: 4 })
    .at('precombatMain', { active: 1 })
    .build();
  g.advanceTo('declareAttackers');
  g.act(1).attack([BEARS]);
  g.advanceTo('declareBlockers', { block: false });
  return g;
}

describe('withWeights', () => {
  test('merges a partial override at every depth and leaves the defaults as they were', () => {
    const before = JSON.stringify(DEFAULT_WEIGHTS);
    const w = withWeights({
      evaluator: { land: 3, keywords: { flying: { power: 1 } } },
      attacks: { margin: 0.2 },
    });
    expect(w.evaluator.land).toBe(3);
    expect(w.evaluator.keywords.flying).toEqual({ base: 0.5, power: 1, toughness: 0 });
    expect(w.evaluator.keywords.menace).toEqual(DEFAULT_WEIGHTS.evaluator.keywords.menace);
    expect(w.evaluator.lifeCap).toBe(DEFAULT_WEIGHTS.evaluator.lifeCap);
    expect(w.attacks.margin).toBe(0.2);
    expect(w.blocks).toEqual(DEFAULT_WEIGHTS.blocks);
    expect(JSON.stringify(DEFAULT_WEIGHTS)).toBe(before);
    expect(withWeights({})).toEqual(DEFAULT_WEIGHTS);
  });

  test('an unknown field or a value that is not a number is refused', () => {
    expect(() => withWeights(JSON.parse('{"evaluator":{"lnad":3}}'))).toThrow(/unknown field/);
    expect(() => withWeights(JSON.parse('{"attacks":{"margin":"big"}}'))).toThrow(/number/);
    expect(() => withWeights(JSON.parse('{"main":5}'))).toThrow(/object/);
  });
});

describe('the evaluator reads its weights', () => {
  test('a higher land weight raises the score of a seat with more lands', () => {
    const g = scenario()
      .seat(0)
      .battlefield('Forest', 'Forest', 'Forest')
      .library('Island', { count: 4 })
      .seat(1)
      .library('Island', { count: 4 })
      .at('precombatMain', { active: 0 })
      .build();
    const view = g.view(0);
    const plain = evaluate(view, 0).score;
    expect(evaluate(view, 0, DEFAULT_WEIGHTS).score).toBe(plain);
    expect(evaluate(view, 0, withWeights({ evaluator: { land: 3 } })).score).toBeGreaterThan(plain);
    expect(evaluate(view, 0, withWeights({ evaluator: { land: 0 } })).score).toBeLessThan(plain);
  });
});

describe('the agent reads its weights', () => {
  test('DEFAULT_WEIGHTS decides exactly as no weights', async () => {
    const plain = new HeuristicAgent({ seed: 7 });
    const weighted = new HeuristicAgent({ seed: 7, weights: DEFAULT_WEIGHTS });
    const a = await askHeuristic(blockSetup(), plain);
    const b = await askHeuristic(blockSetup(), weighted);
    expect(b).toEqual(a);
    expect(weighted.reasons).toEqual(plain.reasons);
    expect(a).toMatchObject({ kind: 'declareBlockers', blocks: [{}] });
  });

  test('a block margin no block can beat keeps the blocker home', async () => {
    const agent = new HeuristicAgent({
      seed: 7,
      weights: withWeights({ blocks: { margin: 1000 } }),
    });
    expect(await askHeuristic(blockSetup(), agent)).toEqual({
      kind: 'declareBlockers',
      blocks: [],
    });
  });
});
