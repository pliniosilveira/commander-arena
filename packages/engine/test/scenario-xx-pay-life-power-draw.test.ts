// "Whenever a creature you control dies, you may pay X life, where X is its power. If you do, draw X cards" (Mask of Griselbrand; CR 119.4, 208.1, 603.10a, 608.2c): `mayPay` of
// `payLife` by the last-known power of the creature that died, and a draw of the same amount. The card is SYNTHETIC (src/cards/fixtures/synthetic-life-lost-group.ts). Pins: accepting
// pays the life and draws that many cards, declining does neither, a creature with a +1/+1 counter is read as it last was, and a player with less life than the power is not asked.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const LEDGER = 'SYNTHETIC Grim Ledger';
const BEARS = 'Grizzly Bears'; // 2/2
const MURDER = 'Murder';
const LIBRARY = Array.from({ length: 12 }, () => 'Plains');

test('the card is valid', () => {
  expect(validateCard(syntheticCard(LEDGER))).toEqual([]);
});

describe('"you may pay X life, where X is its power. If you do, draw X cards"', () => {
  const build = (life = 40) => {
    const g = scenario()
      .seat(0)
      .life(life)
      .library(...LIBRARY)
      .battlefield(LEDGER, BEARS)
      .seat(1)
      .library(...LIBRARY)
      .hand(MURDER)
      .battlefield('Swamp', 'Swamp', 'Swamp')
      .at('precombatMain', { active: 1 })
      .build();
    g.act(1).cast(MURDER, { targets: [{ name: BEARS, seat: 0 }], pay: true });
    g.passAll();
    return g;
  };

  test('accepting pays 2 life and draws 2 cards', () => {
    const g = build();
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    g.expect.life(0, 38);
    g.expect.handSize(0, 2);
  });

  test('declining pays nothing and draws nothing', () => {
    const g = build();
    g.act(0).decline();
    g.expect.life(0, 40);
    g.expect.handSize(0, 0);
  });

  test('a player with 1 life cannot pay 2 and is not asked', () => {
    const g = build(1);
    g.expect.life(0, 1);
    g.expect.handSize(0, 0);
  });
});

describe('the same on an Equipment: "Whenever equipped creature dies"', () => {
  const MASK = 'SYNTHETIC Ledger Mask';
  const game = () => {
    const g = scenario()
      .seat(0)
      .life(40)
      .library(...LIBRARY)
      .battlefield(BEARS, { label: 'bears' })
      .battlefield(MASK, { attachedTo: 'bears' })
      .seat(1)
      .library(...LIBRARY)
      .hand(MURDER)
      .battlefield('Swamp', 'Swamp', 'Swamp')
      .at('precombatMain', { active: 1 })
      .build();
    g.act(1).cast(MURDER, { targets: [{ name: BEARS, seat: 0 }], pay: true });
    g.passAll();
    return g;
  };

  test('the card is valid', () => {
    expect(validateCard(syntheticCard(MASK))).toEqual([]);
  });

  test('accepting pays the power the equipped creature had and draws that many cards', () => {
    const g = game();
    g.act(0).accept();
    g.expect.life(0, 38);
    g.expect.handSize(0, 2);
  });
});
