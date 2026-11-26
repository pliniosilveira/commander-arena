// "You can't cast ~ unless an opponent lost life this turn" (Rakdos, Lord of Riots; CR 101.2, 601.2, 119.3, 102.2): `cantCastThis` with the condition "not an opponent lost life this
// turn". The card is SYNTHETIC (src/cards/fixtures/synthetic-life-lost-group.ts). Pins: it can't be cast before an opponent lost life, it can after, the controller's own loss does not
// count, and with 3 seats the loss of either opponent is enough.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const RIOTER = 'SYNTHETIC Grudging Rioter';
const DRAIN = 'SYNTHETIC Drain One';
const LIBRARY = Array.from({ length: 20 }, () => 'Island');

test('the card is valid', () => {
  expect(validateCard(syntheticCard(RIOTER))).toEqual([]);
});

describe('"unless an opponent lost life this turn"', () => {
  const build = (seats: 2 | 3) => {
    let b = scenario({ seats })
      .seat(0)
      .library(...LIBRARY)
      .hand(RIOTER, DRAIN)
      .battlefield('Swamp', 'Swamp');
    for (let s = 1; s < seats; s++) b = b.seat(s).library(...LIBRARY);
    return b.at('precombatMain', { active: 0 }).build();
  };

  test('it can’t be cast while no opponent lost life', () => {
    const g = build(2);
    g.expect.illegal(0, { cast: RIOTER });
  });

  test('it can be cast once an opponent lost life', () => {
    const g = build(2);
    g.act(0).cast(DRAIN, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.legal(0, { cast: RIOTER });
    g.act(0).cast(RIOTER, { pay: true });
    g.passAll();
    g.expect.zone(RIOTER, 'battlefield', { seat: 0 });
  });

  test('the controller losing life does not count', () => {
    const g = build(2);
    g.act(0).cast(DRAIN, { targets: [{ player: 0 }], pay: true });
    g.passAll();
    g.expect.illegal(0, { cast: RIOTER });
  });

  test('with 3 seats the loss of the third player is enough', () => {
    const g = build(3);
    g.act(0).cast(DRAIN, { targets: [{ player: 2 }], pay: true });
    g.passAll();
    g.expect.legal(0, { cast: RIOTER });
  });
});
