// "As long as your devotion to black and red is less than seven, ~ isn't a creature" (Mogis, God of Slaughter; CR 700.5, 613.1d, 611.3a, 604.1): `loseTypes` with the condition `amountIs`
// of a `devotion`. The card is SYNTHETIC (src/cards/fixtures/synthetic-life-lost-group.ts). Pins: devotion counts the mana symbols of the colors among the costs of the permanents the
// controller controls (the god itself too), it is not a creature below seven and is one at seven or more, and the permanents of an opponent do not count.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const GOD = 'SYNTHETIC Dim God'; // {2}{B}{R}: devotion 2 by itself
const SOVEREIGN = 'SYNTHETIC Red Sovereign'; // {1}{R}{R}{R}: 3
const RAIDER = 'SYNTHETIC Red Raider'; // {1}{R}: 1
const BANNER = 'SYNTHETIC Forge Banner'; // {1}{R}{R}: 2

test('the card is valid', () => {
  expect(validateCard(syntheticCard(GOD))).toEqual([]);
});

describe('"as long as your devotion to black and red is less than seven, ~ isn\'t a creature"', () => {
  const build = (mine: readonly string[], theirs: readonly string[] = [], seats: 2 | 3 = 2) => {
    let b = scenario({ seats })
      .seat(0)
      .battlefield(GOD, ...mine);
    b = b.seat(1).battlefield(...theirs);
    if (seats === 3) b = b.seat(2).battlefield(SOVEREIGN, BANNER, RAIDER);
    const g = b.at('precombatMain', { active: 0 }).build();
    g.advanceTo('declareAttackers');
    return g;
  };

  test('alone (devotion 2) it is not a creature, so it can’t attack', () => {
    const g = build([]);
    g.expect.canAttack(GOD, false);
  });

  test('with devotion 6 it is still not a creature', () => {
    const g = build([SOVEREIGN, RAIDER]);
    g.expect.canAttack(GOD, false);
  });

  test('with devotion 7 it is a creature', () => {
    const g = build([SOVEREIGN, RAIDER, RAIDER]);
    g.expect.canAttack(GOD, true);
  });

  test('with devotion 8 it is a creature', () => {
    const g = build([SOVEREIGN, BANNER]);
    g.expect.canAttack(GOD, true);
  });

  test('an opponent’s permanents do not count, with 2 or 3 seats', () => {
    const two = build([], [SOVEREIGN, BANNER, RAIDER]);
    two.expect.canAttack(GOD, false);
    const three = build([], [SOVEREIGN, BANNER, RAIDER], 3);
    three.expect.canAttack(GOD, false);
  });
});
