// "At the beginning of your end step, you may pay {2} and sacrifice a token. If you do, create a Treasure token." (issue 128, Killer Service's payment; the card here is SYNTHETIC,
// the real one is read by packages/cards/test/parser-pay-sacrifice.test.ts).
// Pins: CR 118.3 (a cost that can't be paid is not paid: with no token to sacrifice nobody is asked), CR 701.21a (the player sacrifices a permanent they control that matches),
// CR 111.1 (a token is the only thing the cost may sacrifice), CR 608.2c ("If you do": the effect follows the payment only), CR 101.4 (three seats: only my own tokens count).
import { describe, expect, test } from 'vitest';
import { validateCard } from '../src/index';
import { scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';

const KEEPER = 'SYNTHETIC Token Toll Keeper';
const BEARS = 'Grizzly Bears';
const LIBRARY = Array.from({ length: 8 }, () => 'Plains');

const keeperFields = {
  name: KEEPER,
  manaCost: ['1'],
  types: ['enchantment'],
  colors: [],
  colorIdentity: [],
  oracleText:
    'When ~ enters, create a Food token.\nAt the beginning of your end step, you may pay {2} and sacrifice a token. If you do, create a Treasure token.',
  abilities: [
    {
      kind: 'triggered',
      trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
      effect: { kind: 'createToken', token: { kind: 'preset', preset: 'Food' }, count: 1 },
    },
    {
      kind: 'triggered',
      trigger: { kind: 'endStep', whose: 'you' },
      effect: {
        kind: 'mayPay',
        cost: [
          { kind: 'mana', symbols: ['2'] },
          { kind: 'sacrifice', what: { token: true } },
        ],
        effect: { kind: 'createToken', token: { kind: 'preset', preset: 'Treasure' }, count: 1 },
      },
    },
  ],
} as const;
const keeper = singleFaceCard(keeperFields as never);

describe('"you may pay {2} and sacrifice a token. If you do, ..." (CR 118.3, 701.21a, 608.2c)', () => {
  const start = (hand: readonly string[]) =>
    scenario({ seats: 3 })
      .define(keeper)
      .seat(0)
      .hand(...hand)
      .library(...LIBRARY)
      .battlefield('Plains', 'Plains', 'Plains')
      .battlefield(BEARS)
      .seat(1)
      .library(...LIBRARY)
      .seat(2)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('the card is valid', () => {
    expect(validateCard(keeper)).toEqual([]);
  });

  test('paying sacrifices the token (the only one) and creates the Treasure', () => {
    const g = start([KEEPER]);
    g.act(0).cast(KEEPER, { pay: true });
    g.passAll();
    g.expect.zone('Food', 'battlefield', { seat: 0 });
    g.advanceTo('end');
    g.passAll();
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    g.expect.pending('payMana', 0);
    g.act(0).payAuto();
    // CR 111.7: the sacrificed token ceases to exist.
    g.expect.noObject('Food');
    g.passAll();
    g.expect.zone('Treasure', 'battlefield', { seat: 0 });
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('declining keeps the token and creates nothing', () => {
    const g = start([KEEPER]);
    g.act(0).cast(KEEPER, { pay: true });
    g.passAll();
    g.advanceTo('end');
    g.passAll();
    g.act(0).decline();
    g.passAll();
    g.expect.zone('Food', 'battlefield', { seat: 0 });
    g.expect.noObject('Treasure');
  });

  test('with no token to sacrifice nobody is asked and nothing is created (CR 118.3)', () => {
    const bare = singleFaceCard({
      ...keeperFields,
      name: 'SYNTHETIC Token Toll Bare',
      abilities: [keeperFields.abilities[1] as never],
    });
    const g = scenario({ seats: 3 })
      .define(bare)
      .seat(0)
      .library(...LIBRARY)
      .battlefield('Plains', 'Plains', 'Plains', 'SYNTHETIC Token Toll Bare', BEARS)
      .seat(1)
      .library(...LIBRARY)
      .seat(2)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.advanceTo('end');
    g.passAll();
    g.expect.noObject('Treasure');
    g.expect.invariants();
  });
});
