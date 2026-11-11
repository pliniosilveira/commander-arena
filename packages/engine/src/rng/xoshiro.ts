/**
 * Seeded PRNG (SPEC 4.2 "Determinism"): xoshiro128** by Blackman and Vigna over the four 32-bit
 * words of RngState. Every function is pure: it returns the new state and never mutates its
 * input, so GameState stays plain JSON and can be shared structurally (SPEC 17.1 A6).
 */
import type { RngState } from './types';

const TWO_POW_32 = 4294967296;

function rotl(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0;
}

/** One splitmix32 step: returns the output and the advanced counter. */
function splitmix32(counter: number): [number, number] {
  const next = (counter + 0x9e3779b9) | 0;
  let t = next ^ (next >>> 16);
  t = Math.imul(t, 0x21f0aaad);
  t ^= t >>> 15;
  t = Math.imul(t, 0x735a2d97);
  t ^= t >>> 15;
  return [t >>> 0, next];
}

/**
 * Create a state from an integer seed. The seed is expanded with splitmix32 so that small or
 * similar seeds (0, 1, 2, ...) still give well-mixed, non-zero states. Seeds beyond 32 bits keep
 * their high part by folding it into the first word.
 */
export function createRng(seed: number): RngState {
  if (!Number.isFinite(seed)) throw new RangeError(`Seed must be a finite number, got ${seed}`);
  const whole = Math.trunc(seed);
  const high = Math.floor(whole / TWO_POW_32) | 0;
  let counter = whole | 0;
  const words: number[] = [];
  for (let i = 0; i < 4; i++) {
    const [out, next] = splitmix32(counter);
    counter = next;
    words.push(out);
  }
  const w0 = ((words[0] ?? 0) ^ high) >>> 0;
  const w1 = words[1] ?? 0;
  const w2 = words[2] ?? 0;
  const w3 = words[3] ?? 0;
  // xoshiro must never start from the all-zero state (it would stay there forever).
  if ((w0 | w1 | w2 | w3) === 0) return { s: [1, 0, 0, 0] };
  return { s: [w0, w1, w2, w3] };
}

/** Next unsigned 32-bit output (the xoshiro128** scrambler and state transition). */
export function nextUint32(rng: RngState): [number, RngState] {
  const [s0, s1, s2, s3] = rng.s;
  const result = Math.imul(rotl(Math.imul(s1, 5) >>> 0, 7), 9) >>> 0;
  const t = (s1 << 9) >>> 0;
  const n2 = (s2 ^ s0) >>> 0;
  const n3 = (s3 ^ s1) >>> 0;
  const n1 = (s1 ^ n2) >>> 0;
  const n0 = (s0 ^ n3) >>> 0;
  return [result, { s: [n0, n1, (n2 ^ t) >>> 0, rotl(n3, 11)] }];
}

/**
 * Uniform integer in [0, maxExclusive). Uses rejection sampling so there is no modulo bias.
 * maxExclusive must be an integer in [1, 2^32]. A bound of 1 returns 0 without drawing.
 */
export function nextInt(rng: RngState, maxExclusive: number): [number, RngState] {
  if (!Number.isInteger(maxExclusive) || maxExclusive < 1 || maxExclusive > TWO_POW_32) {
    throw new RangeError(`maxExclusive must be an integer in [1, 2^32], got ${maxExclusive}`);
  }
  if (maxExclusive === 1) return [0, rng];
  // Accept only values below the largest multiple of maxExclusive that fits in 2^32.
  const limit = TWO_POW_32 - (TWO_POW_32 % maxExclusive);
  let state = rng;
  for (;;) {
    const [value, next] = nextUint32(state);
    state = next;
    if (value < limit) return [value % maxExclusive, state];
  }
}

/** Fisher-Yates shuffle. Returns a new array; the input is not mutated. */
export function shuffle<T>(items: readonly T[], rng: RngState): [T[], RngState] {
  const out = items.slice();
  let state = rng;
  for (let i = out.length - 1; i >= 1; i--) {
    const [j, next] = nextInt(state, i + 1);
    state = next;
    const a = out[i] as T;
    out[i] = out[j] as T;
    out[j] = a;
  }
  return [out, state];
}
