/**
 * Seeded PRNG state (SPEC 4.2 "Determinism"). xoshiro128** over four 32-bit words, stored as
 * plain numbers so GameState stays JSON. All game randomness (shuffles, starting player, coin
 * flips, die rolls) is drawn from the state's rng and nowhere else.
 */
export interface RngState {
  readonly s: readonly [number, number, number, number];
}
