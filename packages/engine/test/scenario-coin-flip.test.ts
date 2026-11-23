// "Flip a coin" and "whenever you win a coin flip" (CR 705): the controller calls heads or tails, the coin is flipped with the seeded generator of the game, and
// the player wins the flip when the call matches the result. Cards are SYNTHETIC (src/cards/fixtures/synthetic-coin.ts).
// Pins: CR 705.2 (for an effect that does not only care about heads or tails the player calls, wins when the call matches, loses otherwise; only the player who flips
// wins or loses), CR 603.2 (a trigger for a win by the event of the flip), SPEC 4.2 (all randomness comes from the seeded generator of the state).
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const GAMBLER = 'SYNTHETIC Coin Gambler'; // when it enters flip a coin; you win: gain 3; an opponent wins: you lose 1
const TOSSER = 'SYNTHETIC Coin Tosser'; // when it enters flip a coin
const PLAINS = Array.from({ length: 8 }, () => 'Plains');

describe('the cards are valid', () => {
  test.each([GAMBLER, TOSSER])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });
});

/** Seat 0 casts the Gambler and calls `call`; returns seat 0's life afterwards. */
function flip(seed: number, call: 'Heads' | 'Tails'): number {
  const g = scenario()
    .seed(seed)
    .seat(0)
    .life(20)
    .library(...PLAINS)
    .hand(GAMBLER)
    .battlefield('Mountain', 'Mountain')
    .seat(1)
    .life(20)
    .library(...PLAINS)
    .at('precombatMain', { active: 0 })
    .build();
  g.act(0).cast(GAMBLER, { pay: true });
  g.passAll();
  // The enters trigger resolves: the controller is asked for the call (CR 705.2), nothing is flipped before.
  const d = g.state.pending;
  if (d?.kind !== 'chooseOption') throw new Error('expected the call');
  expect(d.options).toEqual(['Heads', 'Tails']);
  expect(d.seat).toBe(0);
  g.act(0).chooseOption(call);
  g.passAll();
  g.expect.invariants();
  return g.state.seats[0]?.life ?? Number.NaN;
}

describe('the call and the result (CR 705.2)', () => {
  test('the coin is the seeded generator: the same seed and call give the same result', () => {
    for (const seed of [1, 2, 3, 4]) expect(flip(seed, 'Heads')).toBe(flip(seed, 'Heads'));
  });

  test('a call that matches wins (the trigger gains 3 life), another loses and nobody else triggers', () => {
    for (let seed = 1; seed <= 12; seed += 1) {
      const heads = flip(seed, 'Heads');
      const tails = flip(seed, 'Tails');
      // The same coin: exactly one of the two calls matches it.
      expect([heads, tails].sort()).toEqual([20, 23]);
    }
  });

  test('both results occur across seeds', () => {
    const results = new Set<number>();
    for (let seed = 1; seed <= 30; seed += 1) results.add(flip(seed, 'Heads'));
    expect([...results].sort()).toEqual([20, 23]);
  });
});

describe('the flip of an opponent (CR 705.2: only the player who flips wins or loses)', () => {
  test('"whenever an opponent wins a coin flip" triggers for the opponent that wins, and "you win" does not', () => {
    const outcomes = new Set<number>();
    for (let seed = 1; seed <= 30; seed += 1) {
      const g = scenario()
        .seed(seed)
        .seat(0)
        .life(20)
        .library(...PLAINS)
        .battlefield(GAMBLER)
        .seat(1)
        .life(20)
        .library(...PLAINS)
        .hand(TOSSER)
        .battlefield('Mountain')
        .at('precombatMain', { active: 1 })
        .build();
      g.act(1).cast(TOSSER, { pay: true });
      g.passAll();
      g.act(1).chooseOption('Heads');
      g.passAll();
      outcomes.add(g.state.seats[0]?.life ?? Number.NaN);
      g.expect.invariants();
    }
    // Seat 0 never gains life (they did not flip); they lose 1 when seat 1 wins.
    expect([...outcomes].sort()).toEqual([19, 20]);
  });
});
