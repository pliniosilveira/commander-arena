// "At the beginning of each opponent's upkeep, ~ deals 2 damage to that player unless they sacrifice a creature of their choice" (Mogis, God of Slaughter; CR 118.12a, 701.21a,
// 118.3): `unlessPays` by the player of the event with a `sacrifice` cost. The card is SYNTHETIC (src/cards/fixtures/synthetic-life-lost-group.ts). Pins: the player is asked,
// accepting sacrifices a creature they choose and takes no damage, declining takes the damage, a player with no creature is not asked, and with 3 seats each opponent is asked on
// their own upkeep.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const OVERSEER = 'SYNTHETIC Grim Overseer';
const BEARS = 'Grizzly Bears';
const LIBRARY = Array.from({ length: 10 }, () => 'Plains');

test('the card is valid', () => {
  expect(validateCard(syntheticCard(OVERSEER))).toEqual([]);
});

describe('"unless they sacrifice a creature of their choice"', () => {
  const build = (creatures: readonly string[], seats: 2 | 3 = 2) => {
    let b = scenario({ seats })
      .seat(0)
      .library(...LIBRARY)
      .battlefield(OVERSEER);
    b = b
      .seat(1)
      .library(...LIBRARY)
      .battlefield(...creatures);
    if (seats === 3)
      b = b
        .seat(2)
        .library(...LIBRARY)
        .battlefield(BEARS);
    const g = b.at('end', { active: 0, turn: 3 }).build();
    g.advanceTo('upkeep', { turn: 'next' });
    return g;
  };

  test('declining takes 2 damage and keeps the creature', () => {
    const g = build([BEARS]);
    g.passAll();
    g.expect.pending('confirmOptional', 1);
    g.act(1).decline();
    g.expect.life(1, 38);
    g.expect.zone(BEARS, 'battlefield', { seat: 1 });
  });

  test('accepting sacrifices the creature and takes no damage', () => {
    const g = build([BEARS]);
    g.passAll();
    g.act(1).accept();
    g.expect.life(1, 40);
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
  });

  test('a player with no creature is not asked and takes the damage', () => {
    const g = build([]);
    g.passAll();
    g.expect.life(1, 38);
  });

  test('with 3 seats the trigger of each opponent is about that player', () => {
    const g = build([BEARS], 3);
    g.passAll();
    g.act(1).decline();
    g.expect.life(1, 38);
    g.expect.life(2, 40);
  });
});
