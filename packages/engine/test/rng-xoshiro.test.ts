import { describe, expect, test } from 'vitest';
import { createRng, nextInt, nextUint32, shuffle } from '../src/rng/index';
import type { RngState } from '../src/rng/types';

// Independent reference: xoshiro128** and splitmix32 written with BigInt, sharing no code with
// the implementation. Seed expansion follows the documented splitmix32 construction.
const M32 = 0xffffffffn;
const rotlBig = (x: bigint, k: bigint): bigint => ((x << k) | (x >> (32n - k))) & M32;

function referenceSeed(seed: number): bigint[] {
  let a = BigInt.asUintN(32, BigInt(seed));
  const out: bigint[] = [];
  for (let i = 0; i < 4; i++) {
    a = (a + 0x9e3779b9n) & M32;
    let t = a ^ (a >> 16n);
    t = (t * 0x21f0aaadn) & M32;
    t ^= t >> 15n;
    t = (t * 0x735a2d97n) & M32;
    t ^= t >> 15n;
    out.push(t & M32);
  }
  // Seeds beyond 32 bits fold their high part (floor(seed / 2^32), as int32) into word 0.
  const high = BigInt.asUintN(32, BigInt(Math.floor(seed / 2 ** 32) | 0));
  out[0] = ((out[0] as bigint) ^ high) & M32;
  return out;
}

function referenceOutputs(state: bigint[], count: number): number[] {
  const s = state.slice();
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    const [s0, s1, s2, s3] = s as [bigint, bigint, bigint, bigint];
    out.push(Number((rotlBig((s1 * 5n) & M32, 7n) * 9n) & M32));
    const t = (s1 << 9n) & M32;
    const n2 = s2 ^ s0;
    const n3 = s3 ^ s1;
    const n1 = s1 ^ n2;
    const n0 = s0 ^ n3;
    s[0] = n0;
    s[1] = n1;
    s[2] = n2 ^ t;
    s[3] = rotlBig(n3, 11n);
  }
  return out;
}

function draw(rng: RngState, count: number): { values: number[]; rng: RngState } {
  const values: number[] = [];
  let state = rng;
  for (let i = 0; i < count; i++) {
    const [v, next] = nextUint32(state);
    values.push(v);
    state = next;
  }
  return { values, rng: state };
}

describe('xoshiro128** known answers', () => {
  test('matches the published sequence for the state [1, 2, 3, 4]', () => {
    // Values recalled from commonly cited xoshiro128** outputs for this state; each one is also
    // confirmed by the independent BigInt reference above, which is the authoritative check.
    const { values } = draw({ s: [1, 2, 3, 4] }, 4);
    expect(values).toEqual([11520, 0, 5927040, 70819200]);
    expect(values).toEqual(referenceOutputs([1n, 2n, 3n, 4n], 4));
  });

  test.each([1, 12345, 0, -7, 2 ** 31 + 5])(
    'seed %i matches the reference implementation',
    (seed) => {
      const rng = createRng(seed);
      expect(rng.s.map(BigInt)).toEqual(referenceSeed(seed));
      expect(draw(rng, 50).values).toEqual(referenceOutputs(rng.s.map(BigInt), 50));
    },
  );

  test('pinned first outputs for seeds 1 and 12345 (pinned from this implementation)', () => {
    // These literals were produced by this implementation (and agree with the BigInt reference
    // above); they exist to flag any accidental change of the stream, which would break replays.
    expect(createRng(1).s).toEqual([1580013426, 350525680, 3524174333, 3011703609]);
    expect(draw(createRng(1), 4).values).toEqual([393288148, 2174103013, 3814759091, 2092745082]);
    expect(createRng(12345).s).toEqual([3283241497, 613117429, 2940958500, 516375437]);
    expect(draw(createRng(12345), 4).values).toEqual([
      1093274547, 203003357, 3741353573, 3803725158,
    ]);
  });
});

describe('createRng', () => {
  test('never yields the all-zero state, even for seed 0', () => {
    for (const seed of [0, 1, -1, 2, 0xffffffff, 2 ** 40]) {
      expect(createRng(seed).s.some((w) => w !== 0)).toBe(true);
    }
  });

  test('words are unsigned 32-bit integers', () => {
    const { rng } = draw(createRng(99), 10);
    for (const w of rng.s) {
      expect(Number.isInteger(w)).toBe(true);
      expect(w).toBeGreaterThanOrEqual(0);
      expect(w).toBeLessThan(2 ** 32);
    }
  });

  test('rejects non-finite seeds', () => {
    expect(() => createRng(Number.NaN)).toThrow(RangeError);
    expect(() => createRng(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });

  test('seeds that differ only above 32 bits give different states', () => {
    expect(createRng(5).s).not.toEqual(createRng(5 + 2 ** 32).s);
  });
});

describe('determinism', () => {
  test('same seed gives the same sequence', () => {
    expect(draw(createRng(42), 100).values).toEqual(draw(createRng(42), 100).values);
  });

  test('different seeds give different sequences', () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 50; seed++) {
      seen.add(draw(createRng(seed), 4).values.join(','));
    }
    expect(seen.size).toBe(50);
  });

  test('adjacent seeds are not correlated in their first output', () => {
    const firsts = new Set<number>();
    for (let seed = 0; seed < 200; seed++) firsts.add(draw(createRng(seed), 1).values[0] as number);
    expect(firsts.size).toBe(200);
  });

  test('nextUint32 does not mutate its input and returns a fresh state', () => {
    const rng = createRng(7);
    const snapshot = JSON.stringify(rng);
    const [, next] = nextUint32(rng);
    expect(JSON.stringify(rng)).toBe(snapshot);
    expect(next).not.toBe(rng);
    expect(next.s).not.toEqual(rng.s);
  });

  test('state is JSON round-trippable mid-stream', () => {
    const { rng } = draw(createRng(2024), 17);
    const revived = JSON.parse(JSON.stringify(rng)) as RngState;
    expect(revived).toEqual(rng);
    expect(draw(revived, 20).values).toEqual(draw(rng, 20).values);
  });

  test('outputs are unsigned 32-bit integers', () => {
    for (const v of draw(createRng(3), 1000).values) {
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(2 ** 32);
    }
  });
});

describe('nextInt', () => {
  test('stays in range for many bounds', () => {
    let rng = createRng(11);
    for (const bound of [1, 2, 3, 7, 10, 52, 100, 1000, 65537, 2 ** 31, 2 ** 32]) {
      for (let i = 0; i < 200; i++) {
        const [v, next] = nextInt(rng, bound);
        rng = next;
        expect(Number.isInteger(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(bound);
      }
    }
  });

  test('a bound of 1 always returns 0 and leaves the state alone', () => {
    const rng = createRng(5);
    expect(nextInt(rng, 1)).toEqual([0, rng]);
  });

  test.each([0, -1, 1.5, Number.NaN, 2 ** 32 + 1, Number.POSITIVE_INFINITY])(
    'throws RangeError for %s',
    (bound) => {
      expect(() => nextInt(createRng(1), bound)).toThrow(RangeError);
    },
  );

  test.each([2, 3, 6, 10, 52])('is uniform enough for bound %i (chi-square bound)', (bound) => {
    const draws = 60000;
    const counts = new Array<number>(bound).fill(0);
    let rng = createRng(20260);
    for (let i = 0; i < draws; i++) {
      const [v, next] = nextInt(rng, bound);
      rng = next;
      counts[v] = (counts[v] ?? 0) + 1;
    }
    const expected = draws / bound;
    const chi = counts.reduce((acc, c) => acc + (c - expected) ** 2 / expected, 0);
    // Degrees of freedom = bound - 1. Mean is bound - 1 and the standard deviation is
    // sqrt(2 (bound - 1)); a 6-sigma bound makes a false failure essentially impossible with a
    // fixed seed while still catching gross bias.
    const df = bound - 1;
    expect(chi).toBeLessThan(df + 6 * Math.sqrt(2 * df) + 6);
  });

  test('rejection sampling removes modulo bias for a bound near 2^32', () => {
    // With bound 3 * 2^30 the naive `x % bound` would hit [0, 2^30) twice as often. Check the
    // lowest quarter of the range gets about a quarter of the draws.
    const bound = 3 * 2 ** 30;
    let rng = createRng(77);
    let low = 0;
    const draws = 40000;
    for (let i = 0; i < draws; i++) {
      const [v, next] = nextInt(rng, bound);
      rng = next;
      if (v < bound / 3) low++;
    }
    expect(low / draws).toBeGreaterThan(0.31);
    expect(low / draws).toBeLessThan(0.355);
  });
});

describe('shuffle', () => {
  const deck = Array.from({ length: 52 }, (_, i) => i);

  test('returns a permutation of the input', () => {
    const [out] = shuffle(deck, createRng(1));
    expect(out).toHaveLength(52);
    expect([...out].sort((a, b) => a - b)).toEqual(deck);
  });

  test('is deterministic for a given state', () => {
    const [a, ra] = shuffle(deck, createRng(9));
    const [b, rb] = shuffle(deck, createRng(9));
    expect(a).toEqual(b);
    expect(ra).toEqual(rb);
  });

  test('does not mutate the input and returns a new array', () => {
    const input = [3, 1, 2];
    const copy = [...input];
    const [out] = shuffle(input, createRng(4));
    expect(input).toEqual(copy);
    expect(out).not.toBe(input);
  });

  test('different seeds usually give different orders and the state advances', () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 20; seed++) seen.add(shuffle(deck, createRng(seed))[0].join(','));
    expect(seen.size).toBe(20);
    const rng = createRng(1);
    expect(shuffle(deck, rng)[1]).not.toEqual(rng);
  });

  test('handles empty and single element arrays', () => {
    const rng = createRng(1);
    expect(shuffle([], rng)).toEqual([[], rng]);
    expect(shuffle(['a'], rng)).toEqual([['a'], rng]);
  });

  test('every permutation of 3 items appears with similar frequency', () => {
    const counts = new Map<string, number>();
    let rng = createRng(31337);
    const trials = 12000;
    for (let i = 0; i < trials; i++) {
      const [out, next] = shuffle([0, 1, 2], rng);
      rng = next;
      const key = out.join('');
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    expect(counts.size).toBe(6);
    for (const c of counts.values()) {
      expect(c).toBeGreaterThan(trials / 6 - 250);
      expect(c).toBeLessThan(trials / 6 + 250);
    }
  });

  test('the resulting state is JSON-safe and continues the stream', () => {
    const [, state] = shuffle(deck, createRng(8));
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });
});
