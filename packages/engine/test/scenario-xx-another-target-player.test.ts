// "Whenever a player casts their first spell each turn, choose another target player. ~ deals damage equal to that spell's mana value to the chosen player" (The Lord of Pain; CR 115.1,
// 603.2, 202.3): a player target that is any player but the one the trigger is about (`otherThanTriggerPlayer`). The card is SYNTHETIC (src/cards/fixtures/synthetic-life-lost-group.ts).
// Pins: the player who cast the spell can't be the target, the controller of the ability can, the damage is the spell's mana value, only the first spell each turn triggers, and with 3
// seats the controller chooses between the other two players.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const JUDGE = 'SYNTHETIC Spiteful Judge';
const BOLT = 'Lightning Bolt'; // mana value 1
const LIBRARY = Array.from({ length: 12 }, () => 'Mountain');

test('the card is valid', () => {
  expect(validateCard(syntheticCard(JUDGE))).toEqual([]);
});

describe('"choose another target player"', () => {
  const build = (seats: 2 | 3 = 2) => {
    let b = scenario({ seats })
      .seat(0)
      .library(...LIBRARY)
      .battlefield(JUDGE);
    b = b
      .seat(1)
      .library(...LIBRARY)
      .hand(BOLT, BOLT)
      .battlefield('Mountain', 'Mountain');
    if (seats === 3) b = b.seat(2).library(...LIBRARY);
    return b.at('precombatMain', { active: 1 }).build();
  };

  test('the caster cannot be the target: the controller of the Judge takes damage equal to the mana value', () => {
    const g = build();
    g.act(1).cast(`${BOLT}[0]`, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.life(0, 39);
  });

  test('only the first spell each turn triggers it', () => {
    const g = build();
    g.act(1).cast(`${BOLT}[0]`, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.act(1).cast(`${BOLT}[0]`, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.life(0, 39);
  });

  test('with 3 seats the damage goes to the player chosen among the two other than the caster', () => {
    const g = build(3);
    g.act(1).cast(`${BOLT}[0]`, { targets: [{ player: 1 }], pay: true });
    g.act(0).chooseTargets({ player: 2 });
    g.passAll();
    g.expect.life(2, 39);
    g.expect.life(1, 37);
    g.expect.life(0, 40);
  });
});
