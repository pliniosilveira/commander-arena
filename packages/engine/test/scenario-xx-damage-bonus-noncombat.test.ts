// "If a source you control would deal noncombat damage to an opponent, it deals that much damage plus 2 instead." (Spiked Corridor; CR 614.1a, 120.2b, 120.3, 102.2): the replacement
// `damageBonus` with `noncombatOnly` and `opponentPlayersOnly`. The card is SYNTHETIC (src/cards/fixtures/synthetic-damage-bonus.ts). Pins: noncombat damage to an opponent is
// increased, damage to the controller is not, damage to an opponent's creature is not, combat damage is not, and with 3 seats each opponent is covered.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const HALL = 'SYNTHETIC Barbed Hall';
const BOLT = 'Lightning Bolt';
const BEARS = 'Grizzly Bears';

test('the card is valid', () => {
  expect(validateCard(syntheticCard(HALL))).toEqual([]);
});

describe('"noncombat damage to an opponent ... plus 2"', () => {
  const build = (seats: 2 | 3 = 2) => {
    let b = scenario({ seats })
      .seat(0)
      .battlefield(HALL, 'Mountain', 'Mountain', BEARS)
      .hand(BOLT, BOLT);
    for (let s = 1; s < seats; s++) b = b.seat(s).battlefield(BEARS);
    return b.at('precombatMain', { active: 0 }).build();
  };

  test('a Bolt to an opponent deals 3 plus 2', () => {
    const g = build();
    g.act(0).cast(`${BOLT}[0]`, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.life(1, 35);
  });

  test('with 3 seats the damage to the third player is increased too', () => {
    const g = build(3);
    g.act(0).cast(`${BOLT}[0]`, { targets: [{ player: 2 }], pay: true });
    g.passAll();
    g.expect.life(2, 35);
    g.expect.life(1, 40);
  });

  test('damage to the controller is not increased', () => {
    const g = build();
    g.act(0).cast(`${BOLT}[0]`, { targets: [{ player: 0 }], pay: true });
    g.passAll();
    g.expect.life(0, 37);
  });

  test('damage to a creature of an opponent is not increased (it takes 3, not 5)', () => {
    const g = build();
    g.act(0).cast(`${BOLT}[0]`, { targets: [{ name: BEARS, seat: 1 }], pay: true });
    g.passAll();
    g.expect.life(1, 40);
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
  });

  test('combat damage is not increased', () => {
    const g = build();
    g.advanceTo('declareAttackers');
    g.act(0).attack([`${BEARS}[0]`]);
    g.advanceTo('endOfCombat');
    g.expect.life(1, 38);
  });
});
