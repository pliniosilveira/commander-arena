// "At the beginning of each opponent's upkeep, they lose 1 life and you put a -1/-1 counter on up to one target creature they control" (Persistent Constrictor; CR 603.2, 122.1, 115.1,
// 109.4): a `step` trigger about an opponent with a target of that player's creatures (`controller: 'triggerPlayer'`, up to one). The card is SYNTHETIC
// (src/cards/fixtures/synthetic-life-lost-group.ts). Pins: the player of the upkeep loses the life and their creature gets the counter, a player with no creature still loses the life,
// and with 3 seats only the creatures of the player whose upkeep it is can be the target.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const CONSTRICTOR = 'SYNTHETIC Creeping Constrictor';
const BEARS = 'Grizzly Bears';
const VANILLA = 'SYNTHETIC Vanilla 2/2';
const LIBRARY = Array.from({ length: 10 }, () => 'Plains');

test('the card is valid', () => {
  expect(validateCard(syntheticCard(CONSTRICTOR))).toEqual([]);
});

describe('"they lose 1 life and you put a -1/-1 counter on up to one target creature they control"', () => {
  const build = (theirs: readonly string[], seats: 2 | 3 = 2) => {
    let b = scenario({ seats })
      .seat(0)
      .library(...LIBRARY)
      .battlefield(CONSTRICTOR);
    b = b
      .seat(1)
      .library(...LIBRARY)
      .battlefield(...theirs);
    if (seats === 3)
      b = b
        .seat(2)
        .library(...LIBRARY)
        .battlefield(VANILLA);
    const g = b.at('end', { active: 0, turn: 3 }).build();
    g.advanceTo('upkeep', { turn: 'next' });
    return g;
  };

  test('the opponent loses 1 life and their creature gets a -1/-1 counter', () => {
    const g = build([BEARS]);
    g.act(0).chooseTargets(BEARS);
    g.passAll();
    g.expect.life(1, 39);
    g.expect.counters(BEARS, { '-1/-1': 1 });
  });

  test('a player with no creature still loses 1 life', () => {
    const g = build([]);
    g.passAll();
    g.expect.life(1, 39);
  });

  test('with 3 seats the counter goes on a creature of the player whose upkeep it is', () => {
    const g = build([BEARS], 3);
    g.act(0).chooseTargets(BEARS);
    g.passAll();
    g.expect.life(1, 39);
    g.expect.counters(BEARS, { '-1/-1': 1 });
    g.expect.counters(VANILLA, {});
  });
});
