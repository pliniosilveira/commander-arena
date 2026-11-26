// Threat scenarios of the turn planner (issue 624, phase 3): the chance that the opponent holds a card
// of a category is hypergeometric over its pool, a category the opponent cannot cast gets no scenario,
// and each scenario deals the opponent a hand that holds the threat or holds nothing relevant.
import { createRng, determinize } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { atLeastOne, opponentsOf, poolOf, scenariosOf, threatsOf } from '../src/heuristic-threats';
import { DEFAULT_WEIGHTS } from '../src/index';

/** C(n, k) as a float, for the expected values. */
function choose(n: number, k: number): number {
  let r = 1;
  for (let i = 0; i < k; i += 1) r = (r * (n - i)) / (i + 1);
  return r;
}

/** Seat 0 in its own main phase; seat 1 holds 5 cards from a pool of Counterspells and Islands. */
function blue(opts: { tapped: boolean; counters: number }) {
  const g = scenario()
    .seat(0)
    .battlefield('Island', 'Island')
    .library('Island', { count: 10 })
    .seat(1)
    .battlefield('Island', { tapped: opts.tapped })
    .battlefield('Island', { tapped: opts.tapped })
    .hand('Island', { count: 5 })
    .library('Counterspell', { count: opts.counters })
    .library('Island', { count: 30 })
    .at('precombatMain', { active: 0 })
    .build();
  const sample = determinize(g.state, 0, createRng(7));
  return { g, sample, view: g.view(0) };
}

describe('the chance of holding a category', () => {
  test('a hand of 5 from a pool of 60 with 8 removal spells', () => {
    const expected = 1 - choose(52, 5) / choose(60, 5);
    expect(atLeastOne(60, 8, 5)).toBeCloseTo(expected, 12);
    expect(atLeastOne(60, 0, 5)).toBe(0);
    expect(atLeastOne(60, 8, 0)).toBe(0);
    expect(atLeastOne(10, 8, 5)).toBe(1);
  });
});

describe('threats by category', () => {
  test('a blue opponent with two untapped Islands and Counterspells in the pool: a counter scenario', () => {
    const { view, sample } = blue({ tapped: false, counters: 8 });
    expect(poolOf(sample, 1)).toHaveLength(43);
    const threats = threatsOf(view, sample, DEFAULT_WEIGHTS);
    // The pools a caller read already (`scenariosOf`) give the same threats as reading them again.
    expect(threatsOf(view, sample, DEFAULT_WEIGHTS, opponentsOf(view, sample))).toEqual(threats);
    const counter = threats.find((t) => t.kind === 'counter');
    expect(counter?.chance).toBeCloseTo(atLeastOne(43, 8, 5), 12);
    const scenarios = scenariosOf(view, sample, DEFAULT_WEIGHTS);
    expect(scenarios.map((s) => s.label)).toEqual(['base', 'counter@1']);
    expect(scenarios.reduce((sum, s) => sum + s.weight, 0)).toBeCloseTo(1, 12);
    // The counter scenario's hand holds a Counterspell; the base scenario's holds none.
    const handNames = (i: number) =>
      poolOf(scenarios[i]?.state ?? sample, 1)
        .slice(0, 5)
        .map((c) => c.view.name);
    expect(handNames(1)).toContain('Counterspell');
    expect(handNames(0)).not.toContain('Counterspell');
  });

  test('an opponent with no untapped mana: no counter scenario during the agent turn', () => {
    const { view, sample } = blue({ tapped: true, counters: 8 });
    expect(threatsOf(view, sample, DEFAULT_WEIGHTS)).toEqual([]);
    expect(scenariosOf(view, sample, DEFAULT_WEIGHTS).map((s) => s.label)).toEqual(['base']);
  });

  test('a category below the minimum chance gets no scenario', () => {
    // One Counterspell in 41 cards and a hand of 5: about 12%; the minimum raised to 20% drops it.
    const { view, sample } = blue({ tapped: false, counters: 1 });
    const strict = { ...DEFAULT_WEIGHTS, plan: { ...DEFAULT_WEIGHTS.plan, minThreatChance: 0.2 } };
    expect(threatsOf(view, sample, DEFAULT_WEIGHTS).map((t) => t.kind)).toEqual(['counter']);
    expect(threatsOf(view, sample, strict)).toEqual([]);
  });

  test('the scenarios are the same for every sample of the same position', () => {
    const { g, view } = blue({ tapped: false, counters: 8 });
    const a = determinize(g.state, 0, createRng(1));
    const b = determinize(g.state, 0, createRng(2));
    const strip = (s: ReturnType<typeof threatsOf>) => s.map((t) => [t.kind, t.chance, t.count]);
    expect(strip(threatsOf(view, a, DEFAULT_WEIGHTS))).toEqual(
      strip(threatsOf(view, b, DEFAULT_WEIGHTS)),
    );
  });
});
