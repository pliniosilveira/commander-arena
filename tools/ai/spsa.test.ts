import { DEFAULT_WEIGHTS, withWeights } from '@commander-arena/ai';
import { describe, expect, test } from 'vitest';
import {
  ALPHA,
  clamp,
  DEFAULT_GAINS,
  flatten,
  GAMMA,
  largestChanges,
  perturb,
  perturbationSize,
  rawValues,
  selectPaths,
  signs,
  stepSize,
  tunedField,
  unflatten,
  update,
} from './spsa.ts';

describe('gains', () => {
  test('follow the standard SPSA schedules', () => {
    const gains = { a: 0.5, c: 0.2, A: 5 };
    expect(stepSize(gains, 0)).toBeCloseTo(0.5 / 6 ** ALPHA, 12);
    expect(stepSize(gains, 9)).toBeCloseTo(0.5 / 15 ** ALPHA, 12);
    expect(perturbationSize(gains, 0)).toBe(0.2);
    expect(perturbationSize(gains, 9)).toBeCloseTo(0.2 / 10 ** GAMMA, 12);
  });

  test('shrink as the iterations go on', () => {
    expect(stepSize(DEFAULT_GAINS, 10)).toBeLessThan(stepSize(DEFAULT_GAINS, 0));
    expect(perturbationSize(DEFAULT_GAINS, 10)).toBeLessThan(perturbationSize(DEFAULT_GAINS, 0));
  });
});

describe('flatten and unflatten', () => {
  test('round-trip the default weights', () => {
    const flat = flatten(DEFAULT_WEIGHTS);
    expect(flat.get('evaluator.land')).toBe(1.5);
    expect(flat.get('evaluator.keywords.flying.base')).toBe(0.5);
    expect(flat.get('mulligan.maxLands')).toBe(5);
    expect(unflatten(flat)).toEqual(DEFAULT_WEIGHTS);
  });

  test('a subset unflattens to a partial weights object withWeights accepts', () => {
    const partial = unflatten(
      new Map([
        ['evaluator.land', 2],
        ['attacks.margin', 0.1],
        ['evaluator.keywords.reach.base', 0.4],
      ]),
    );
    expect(partial).toEqual({
      evaluator: { land: 2, keywords: { reach: { base: 0.4 } } },
      attacks: { margin: 0.1 },
    });
    const merged = withWeights(partial);
    expect(merged.evaluator.land).toBe(2);
    expect(merged.evaluator.keywords.reach).toEqual({ base: 0.4, power: 0, toughness: 0 });
    expect(merged.evaluator.lifeCap).toBe(DEFAULT_WEIGHTS.evaluator.lifeCap);
  });

  test('a path through a number throws', () => {
    expect(() =>
      unflatten(
        new Map([
          ['a', 1],
          ['a.b', 2],
        ]),
      ),
    ).toThrow(/runs through/);
  });

  test('a value that is neither a number nor an object throws', () => {
    expect(() => flatten({ a: 'x' })).toThrow(/a is neither/);
  });
});

describe('selectPaths', () => {
  const all = [...flatten(DEFAULT_WEIGHTS).keys()];

  test('takes exact paths and prefixes, in the order of the weights, without repeats', () => {
    expect(selectPaths(all, ['blocks', 'evaluator.land', 'blocks.margin'])).toEqual([
      'evaluator.land',
      'blocks.margin',
      'blocks.lookMargin',
    ]);
    expect(selectPaths(all, ['danger'])).toEqual([
      'danger.life',
      'danger.poison',
      'danger.commander',
    ]);
  });

  test('a prefix matches whole keys only', () => {
    expect(selectPaths(all, ['evaluator.land'])).toEqual(['evaluator.land']);
  });

  test('an entry that matches nothing throws', () => {
    expect(() => selectPaths(all, ['evaluator.nothing'])).toThrow(/no field matches/);
  });
});

describe('fields and clamping', () => {
  test('scale is the magnitude of the default, or 1 for a default of 0', () => {
    expect(tunedField('evaluator.land', 1.5).scale).toBe(1.5);
    expect(tunedField('main.losing', -8).scale).toBe(8);
    expect(tunedField('x', 0).scale).toBe(1);
  });

  test('bounds: shares in [0, 1], positive defaults at least 0, others free', () => {
    const share = tunedField('attacks.crackWeight', 0.5);
    expect([share.min, share.max]).toEqual([0, 1]);
    expect(clamp(share, 5)).toBe(2);
    expect(clamp(share, -1)).toBe(0);
    const blend = tunedField('plan.deepBlend', 0.5);
    expect([blend.min, blend.max]).toEqual([0, 1]);
    const land = tunedField('evaluator.land', 1.5);
    expect(clamp(land, -0.5)).toBe(0);
    expect(clamp(land, 40)).toBe(40);
    const losing = tunedField('main.losing', -8);
    expect(clamp(losing, -50)).toBe(-50);
  });
});

describe('signs', () => {
  test('are +1 or -1, the same for the same seed and iteration', () => {
    const s = signs(7, 3, 50);
    expect(s.every((x) => x === 1 || x === -1)).toBe(true);
    expect(signs(7, 3, 50)).toEqual(s);
    expect(signs(7, 4, 50)).not.toEqual(s);
    expect(signs(8, 3, 50)).not.toEqual(s);
  });

  test('are roughly balanced', () => {
    const s = signs(1, 0, 2000);
    const plus = s.filter((x) => x === 1).length;
    expect(plus).toBeGreaterThan(900);
    expect(plus).toBeLessThan(1100);
  });
});

describe('perturb and update', () => {
  const fields = [tunedField('evaluator.land', 1.5), tunedField('attacks.crackWeight', 0.5)];
  const theta = [1, 1];

  test('perturb moves every field by c_k in normalised units, clamped', () => {
    const { plus, minus } = perturb(fields, theta, [1, -1], 0.2);
    expect(plus).toEqual([1.2, 0.8]);
    expect(minus).toEqual([0.8, 1.2]);
    // crackWeight is at most 1 raw, so 2 normalised.
    expect(perturb(fields, [1, 1.9], [1, 1], 0.2).plus[1]).toBe(2);
  });

  test('update climbs: a winning theta+ moves theta toward the + side', () => {
    const gains = { a: 0.5, c: 0.2, A: 5 };
    const next = update(fields, theta, [1, -1], 0.5, gains, 0);
    const step = stepSize(gains, 0) * (0.5 / (2 * 0.2));
    expect(next[0]).toBeCloseTo(1 + step, 12);
    expect(next[1]).toBeCloseTo(1 - step, 12);
  });

  test('an even match leaves theta where it is', () => {
    expect(update(fields, theta, [1, -1], 0, DEFAULT_GAINS, 3)).toEqual(theta);
  });

  test('update clamps to the bounds', () => {
    const next = update(fields, theta, [-1, 1], 1, { a: 100, c: 0.2, A: 0 }, 0);
    expect(next).toEqual([0, 2]);
  });

  test('rawValues and largestChanges speak raw units', () => {
    expect(rawValues(fields, [2, 0.5])).toEqual(
      new Map([
        ['evaluator.land', 3],
        ['attacks.crackWeight', 0.25],
      ]),
    );
    expect(largestChanges(fields, [1, 1], [1.1, 0.5], 1)).toEqual([
      { path: 'attacks.crackWeight', from: 0.5, to: 0.25 },
    ]);
  });
});
