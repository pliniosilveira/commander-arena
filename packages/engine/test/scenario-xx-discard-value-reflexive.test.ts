// Summon: Kujata, chapter III ("Discard a card, then draw two cards. When you discard a card this way, ~ deals damage equal to that card's mana value to each opponent."), run by the engine.
// Pins: CR 603.12 (the reflexive ability is created when the discard happened, not when it was merely asked), CR 202.3 (the mana value of the card discarded, a land is 0), CR 608.2c (the
// amount is read as the ability resolves, from what the discard did), CR 120.2 (the damage is dealt to every opponent: three seats).
// Cards: the SYNTHETIC "Discard Pinger" of this file and the real Giant Spider (mana value 4), Mountain and Lightning Bolt.
import { describe, expect, test } from 'vitest';
import { validateCard } from '../src/index';
import { scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';

const PINGER = 'SYNTHETIC Discard Pinger';
const LIBRARY = Array.from({ length: 12 }, () => 'Plains');

const pinger = singleFaceCard({
  name: PINGER,
  manaCost: ['1', 'R'],
  types: ['creature'],
  subtypes: ['Wizard'],
  colors: ['R'],
  colorIdentity: ['R'],
  power: 1,
  toughness: 1,
  oracleText:
    "At the beginning of combat on your turn, discard a card, then draw a card. When you discard a card this way, ~ deals damage equal to that card's mana value to each opponent.",
  abilities: [
    {
      kind: 'triggered',
      trigger: { kind: 'step', step: 'beginCombat', whose: 'you' },
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'discard', player: { kind: 'you' }, count: 1 },
          { kind: 'draw', player: { kind: 'you' }, count: 1 },
          {
            kind: 'reflexive',
            ifThisWay: 'discarded',
            effect: {
              kind: 'dealDamage',
              amount: { kind: 'thisWay', what: 'discardedValue' },
              to: { kind: 'eachOpponent' },
            },
          },
        ],
      },
    },
  ],
});

const game = (hand: readonly string[]) => {
  const b = scenario({ seats: 3 })
    .define(pinger)
    .seat(0)
    .library(...LIBRARY)
    .battlefield(PINGER);
  if (hand.length > 0) b.hand(...hand);
  return b
    .seat(1)
    .library(...LIBRARY)
    .seat(2)
    .library(...LIBRARY)
    .at('precombatMain', { active: 0 })
    .build();
};

describe('"When you discard a card this way, ~ deals damage equal to that card\'s mana value to each opponent"', () => {
  test('is a valid card', () => {
    expect(validateCard(pinger)).toEqual([]);
  });

  test('every opponent takes the mana value of the card discarded (CR 202.3, 120.2)', () => {
    const g = game(['Giant Spider']);
    g.advanceTo('beginningOfCombat');
    g.passAll();
    g.expect.zone('Giant Spider', 'graveyard', { seat: 0 });
    g.expect.life(0, 40);
    g.expect.life(1, 36);
    g.expect.life(2, 36);
    g.expect.invariants();
  });

  test('a land has mana value 0: no damage', () => {
    const g = game(['Mountain']);
    g.advanceTo('beginningOfCombat');
    g.passAll();
    g.expect.zone('Mountain', 'graveyard', { seat: 0 });
    g.expect.life(1, 40);
    g.expect.life(2, 40);
  });

  test('the card is the one discarded: with two to choose from, the chosen one counts', () => {
    const g = game(['Giant Spider', 'Lightning Bolt']);
    g.advanceTo('beginningOfCombat');
    g.passAll();
    g.expect.pending('chooseCards', 0);
    g.act(0).chooseCards('Lightning Bolt');
    g.passAll();
    g.expect.life(1, 39);
    g.expect.life(2, 39);
  });

  test('nothing is discarded from an empty hand: the reflexive ability is not created (CR 603.12)', () => {
    const g = game([]);
    g.advanceTo('beginningOfCombat');
    g.passAll();
    g.expect.life(1, 40);
    g.expect.life(2, 40);
    g.expect.stack([]);
  });
});
