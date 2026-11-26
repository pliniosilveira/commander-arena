// "At the beginning of your end step, target enchantment deals damage equal to its mana value to its controller unless that player sacrifices it" (Enchanter's Bane; CR 118.12a, 701.21a,
// 118.3, 120.3): `unlessPays` by the controller of a target with a sacrifice of that target (`{ kind: 'target' }`). The card is SYNTHETIC (src/cards/fixtures/synthetic-life-lost-group.ts).
// Pins: the controller of the enchantment is asked, accepting sacrifices it and takes no damage, declining takes damage equal to its mana value, and with 3 seats only the controller of
// the target is asked.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const IDOL = 'SYNTHETIC Tithing Idol';
const ENCHANTMENT = 'SYNTHETIC Night Warden'; // {2}{U} enchantment, mana value 3
const LIBRARY = Array.from({ length: 10 }, () => 'Plains');

test('the card is valid', () => {
  expect(validateCard(syntheticCard(IDOL))).toEqual([]);
});

describe('"unless that player sacrifices it"', () => {
  const build = (seats: 2 | 3 = 2) => {
    let b = scenario({ seats })
      .seat(0)
      .library(...LIBRARY)
      .battlefield(IDOL);
    b = b
      .seat(1)
      .library(...LIBRARY)
      .battlefield(ENCHANTMENT);
    if (seats === 3) b = b.seat(2).library(...LIBRARY);
    const g = b.at('precombatMain', { active: 0 }).build();
    g.advanceTo('end');
    g.passAll();
    return g;
  };

  test('declining: the enchantment deals 3 damage to its controller and stays', () => {
    const g = build();
    g.expect.pending('confirmOptional', 1);
    g.act(1).decline();
    g.expect.life(1, 37);
    g.expect.zone(ENCHANTMENT, 'battlefield', { seat: 1 });
  });

  test('accepting: it is sacrificed and no damage is dealt', () => {
    const g = build();
    g.act(1).accept();
    g.expect.life(1, 40);
    g.expect.zone(ENCHANTMENT, 'graveyard', { seat: 1 });
  });

  test('with 3 seats only the controller of the target is asked', () => {
    const g = build(3);
    g.expect.pending('confirmOptional', 1);
    g.act(1).decline();
    g.expect.life(1, 37);
    g.expect.life(2, 40);
  });
});
