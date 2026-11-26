// "As an additional cost to cast this spell, discard a card. Draw two cards. If the discarded card wasn't a land card, ~ deals 2 damage to each opponent" (Grab the Prize; CR 601.2b,
// 701.9a, 608.2h): the spell remembers the card its additional cost discarded and `discardedAsCostMatches` reads it, here under `not`. The card is SYNTHETIC
// (src/cards/fixtures/synthetic-life-lost-group.ts). Pins: a land discarded deals no damage, a nonland card deals 2 to each opponent, and with 3 seats both opponents take it.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const SPELL = 'SYNTHETIC Grasping Prize';
const LIBRARY = Array.from({ length: 12 }, () => 'Plains');

test('the card is valid', () => {
  expect(validateCard(syntheticCard(SPELL))).toEqual([]);
});

describe('"if the discarded card wasn\'t a land card"', () => {
  const build = (seats: 2 | 3 = 2) => {
    let b = scenario({ seats })
      .seat(0)
      .library(...LIBRARY)
      .hand(SPELL, 'Forest', 'Grizzly Bears')
      .battlefield('Mountain', 'Mountain');
    for (let s = 1; s < seats; s++) b = b.seat(s).library(...LIBRARY);
    return b.at('precombatMain', { active: 0 }).build();
  };

  test('discarding a land: no damage', () => {
    const g = build();
    g.act(0).cast(SPELL, { pay: true });
    g.act(0).chooseCards({ name: 'Forest', zone: 'hand', seat: 0 });
    g.passAll();
    g.expect.life(1, 40);
    g.expect.handSize(0, 3);
  });

  test('discarding a nonland card: 2 damage to each opponent', () => {
    const g = build();
    g.act(0).cast(SPELL, { pay: true });
    g.act(0).chooseCards({ name: 'Grizzly Bears', zone: 'hand', seat: 0 });
    g.passAll();
    g.expect.life(1, 38);
  });

  test('with 3 seats both opponents take the damage', () => {
    const g = build(3);
    g.act(0).cast(SPELL, { pay: true });
    g.act(0).chooseCards({ name: 'Grizzly Bears', zone: 'hand', seat: 0 });
    g.passAll();
    g.expect.life(1, 38);
    g.expect.life(2, 38);
  });
});
