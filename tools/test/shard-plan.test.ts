// The shard plan (shard-plan.ts): a partition of the files into shards of about equal time, the same from every shard job.
import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import {
  planShards,
  type ShardFile,
  type ShardWeights,
  shardSeconds,
  weightOf,
} from './shard-plan.ts';

const files = (seconds: Record<string, number>): ShardFile[] =>
  Object.entries(seconds).map(([id, s]) => ({ id, seconds: s }));

describe('planShards', () => {
  const sample = files({
    'a.test.ts': 200,
    'b.test.ts': 120,
    'c.test.ts': 90,
    'd.test.ts': 60,
    'e.test.ts': 40,
    'f.test.ts': 30,
    'g.test.ts': 5,
    'h.test.ts': 1,
    'i.test.ts': 1,
  });

  test.each([1, 2, 3, 4, 7, 12])('every file is in exactly one of %i shards', (count) => {
    const plan = planShards(sample, count);
    expect(plan).toHaveLength(count);
    expect(plan.flat().sort()).toEqual(sample.map((f) => f.id).sort());
  });

  test('the plan does not depend on the order the files come in', () => {
    const shuffled = [...sample].reverse();
    expect(planShards(shuffled, 4)).toEqual(planShards(sample, 4));
  });

  test('files of equal weight are split by path, not by the order they came in', () => {
    const same = files({ 'z.test.ts': 1, 'a.test.ts': 1, 'm.test.ts': 1, 'b.test.ts': 1 });
    expect(planShards(same, 2)).toEqual([
      ['a.test.ts', 'm.test.ts'],
      ['b.test.ts', 'z.test.ts'],
    ]);
  });

  test('the heavy files are spread, one to a shard, and the rest fill the lightest', () => {
    const heavy = files({
      'h1.test.ts': 100,
      'h2.test.ts': 100,
      'h3.test.ts': 100,
      'h4.test.ts': 100,
      ...Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`l${i}.test.ts`, 1])),
    });
    const plan = planShards(heavy, 4);
    for (const shard of plan) expect(shard.filter((id) => id.startsWith('h'))).toHaveLength(1);
    const seconds = shardSeconds(plan, {
      defaultSeconds: 0,
      weights: Object.fromEntries(heavy.map((f) => [f.id, f.seconds])),
    });
    expect(seconds).toEqual([110, 110, 110, 110]);
  });

  test('the slowest shard is within the greedy bound of the best split', () => {
    const plan = planShards(sample, 3);
    const weights: ShardWeights = {
      defaultSeconds: 0,
      weights: Object.fromEntries(sample.map((f) => [f.id, f.seconds])),
    };
    const total = sample.reduce((s, f) => s + f.seconds, 0);
    const longest = Math.max(...shardSeconds(plan, weights));
    // The best possible split is at least the mean and at least the heaviest file; LPT is within 4/3 of it.
    const lowerBound = Math.max(total / 3, 200);
    expect(longest).toBeLessThanOrEqual((4 / 3) * lowerBound);
  });

  test('a count that is not a positive integer is refused', () => {
    expect(() => planShards(sample, 0)).toThrow('positive integer');
    expect(() => planShards(sample, 2.5)).toThrow('positive integer');
  });
});

describe('weightOf', () => {
  const weights: ShardWeights = { defaultSeconds: 0.3, weights: { 'a.test.ts': 12 } };

  test('a listed file has its weight, an unlisted one the default', () => {
    expect(weightOf(weights, 'a.test.ts')).toBe(12);
    expect(weightOf(weights, 'new.test.ts')).toBe(0.3);
  });

  test('a file named like an object property is not mistaken for a weight', () => {
    expect(weightOf(weights, 'constructor')).toBe(0.3);
    expect(weightOf(weights, '__proto__')).toBe(0.3);
  });
});

describe('the recorded weights (shard-weights.json)', () => {
  const recorded = JSON.parse(
    readFileSync(new URL('./shard-weights.json', import.meta.url), 'utf8'),
  ) as ShardWeights & { readonly source: string };

  test('are seconds by repository path, with a default', () => {
    expect(recorded.defaultSeconds).toBeGreaterThan(0);
    for (const [id, seconds] of Object.entries(recorded.weights)) {
      expect(id, id).toMatch(/^(packages|apps|tools)\/.+\.test\.tsx?$/);
      expect(seconds, id).toBeGreaterThan(0);
    }
  });

  test('split four ways, the slowest shard stays near the mean', () => {
    // The files that are not listed take the default each; stand in for them with the count the PR tier has, so the mean is the one of a real run.
    const listed = Object.keys(recorded.weights).map((id) => ({
      id,
      seconds: recorded.weights[id] ?? 0,
    }));
    const plan = planShards(listed, 4);
    const seconds = shardSeconds(plan, recorded);
    const mean = seconds.reduce((a, b) => a + b, 0) / 4;
    expect(Math.max(...seconds)).toBeLessThanOrEqual(mean * 1.05);
  });
});
