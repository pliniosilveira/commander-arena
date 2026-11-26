// "Whenever ~ attacks, choose up to one target nonland permanent. Its controller may sacrifice it. If they don't, ~ deals 5 damage to that player" (Star Athlete; CR 608.2d, 701.21a,
// 101.4, 120.3): `playersMay` of the controller of a target, sacrificing the target, with `otherwise` damage to the player who declined (`declinedPlayer`). The card is SYNTHETIC
// (src/cards/fixtures/synthetic-life-lost-group.ts). Pins: accepting sacrifices the permanent and takes no damage, declining takes 5 damage and keeps it, a trigger with no target asks
// nobody, and with 3 seats the controller of the target is the player asked.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const ATHLETE = 'SYNTHETIC Reckless Athlete';
const BEARS = 'Grizzly Bears';
const LIBRARY = Array.from({ length: 10 }, () => 'Plains');

test('the card is valid', () => {
  expect(validateCard(syntheticCard(ATHLETE))).toEqual([]);
});

describe('"its controller may sacrifice it. If they don\'t, ~ deals 5 damage to that player"', () => {
  const build = (theirs: readonly string[], seats: 2 | 3 = 2) => {
    let b = scenario({ seats })
      .seat(0)
      .library(...LIBRARY)
      .battlefield(ATHLETE);
    b = b
      .seat(1)
      .library(...LIBRARY)
      .battlefield(...theirs);
    if (seats === 3) b = b.seat(2).library(...LIBRARY);
    const g = b.at('precombatMain', { active: 0 }).build();
    g.advanceTo('declareAttackers');
    g.act(0).attack([ATHLETE], seats === 3 ? { player: 1 } : undefined);
    return g;
  };

  test('declining: the player takes 5 damage and keeps the permanent', () => {
    const g = build([BEARS]);
    g.act(0).chooseTargets(BEARS);
    g.passAll();
    g.expect.pending('confirmOptional', 1);
    g.act(1).decline();
    g.expect.life(1, 35);
    g.expect.zone(BEARS, 'battlefield', { seat: 1 });
  });

  test('accepting: the permanent is sacrificed and no damage is dealt', () => {
    const g = build([BEARS]);
    g.act(0).chooseTargets(BEARS);
    g.passAll();
    g.act(1).accept();
    g.expect.life(1, 40);
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
  });

  test('with 3 seats the controller of the target is the one asked', () => {
    const g = build([BEARS], 3);
    g.act(0).chooseTargets(BEARS);
    g.passAll();
    g.expect.pending('confirmOptional', 1);
    g.act(1).decline();
    g.expect.life(1, 35);
    g.expect.life(2, 40);
  });
});
