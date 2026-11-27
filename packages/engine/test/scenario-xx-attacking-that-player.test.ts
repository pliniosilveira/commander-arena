// Family Matters deck, group C (Echoing Assault): the filter `attackingOpponents: 'triggerAttacked'`, "creatures attacking that player" of a trigger with one occurrence for each player attacked.
// Pins: CR 508.1b (a creature attacks a player, a planeswalker or a battle: one at a planeswalker does not attack the player), CR 508.6 (the player a trigger is about), CR 611.2c (the group
// is fixed as the effect resolves), CR 603.2c (one trigger for each player attacked). Built for three and four seats.
// Cards: the SYNTHETIC enchantment of this file and the real Grizzly Bears, Healer's Hawk and Llanowar Elves.
import { describe, expect, test } from 'vitest';
import { validateCard } from '../src/ast/validate';
import { derive } from '../src/rules/derive';
import { scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';

const RALLY = 'SYNTHETIC Rally Banner'; // Whenever you attack a player, creatures attacking that player get +1/+1 until end of turn.
const BEARS = 'Grizzly Bears';
const HAWK = "Healer's Hawk";
const ELVES = 'Llanowar Elves';
const LIBRARY = Array.from({ length: 12 }, () => 'Plains');

const rally = singleFaceCard({
  name: RALLY,
  manaCost: ['2'],
  types: ['enchantment'],
  colors: [],
  colorIdentity: [],
  oracleText:
    'Whenever you attack a player, creatures attacking that player get +1/+1 until end of turn.',
  abilities: [
    {
      kind: 'triggered',
      trigger: { kind: 'attackBatch', who: 'you', atLeast: 1, eachAttackedPlayer: true },
      effect: {
        kind: 'modifyPt',
        objects: {
          kind: 'each',
          filter: {
            zone: 'battlefield',
            types: ['creature'],
            attackingOpponents: 'triggerAttacked',
          },
        },
        power: 1,
        toughness: 1,
        duration: 'untilEndOfTurn',
      },
    },
  ],
});

const game = (seats: 3 | 4) => {
  const b = scenario({ seats }).define(rally);
  b.seat(0)
    .library(...LIBRARY)
    .battlefield(RALLY, BEARS, HAWK, ELVES);
  for (let seat = 1; seat < seats; seat += 1) b.seat(seat).library(...LIBRARY);
  const g = b.at('precombatMain', { active: 0, turn: 3 }).build();
  g.advanceTo('declareAttackers', { attack: false });
  return g;
};

const pt = (g: ReturnType<typeof game>, name: string) => {
  const object = g.object(name);
  const derived = derive(g.state, object);
  return [derived.power, derived.toughness];
};

describe('creatures attacking that player', () => {
  test('the card is valid', () => {
    expect(validateCard(rally)).toEqual([]);
  });

  test.each([3, 4] as const)(
    '%i seats: each occurrence reaches only the creatures attacking its player',
    (seats) => {
      const g = game(seats);
      g.act(0).declareAttackers([
        { attacker: BEARS, target: { player: 1 } },
        { attacker: HAWK, target: { player: 1 } },
        { attacker: ELVES, target: { player: 2 } },
      ]);
      const order = g.state.pending;
      if (order?.kind === 'orderTriggers') {
        g.act(0).orderTriggers(...order.triggers.map((_, index) => index));
      }
      g.passAll();
      // Two triggers, one for each player attacked: every creature gets +1/+1 once, from the occurrence about its own player (not +2 from both).
      expect(pt(g, BEARS)).toEqual([3, 3]);
      expect(pt(g, HAWK)).toEqual([2, 2]);
      expect(pt(g, ELVES)).toEqual([2, 2]);
      g.expect.invariants();
    },
  );

  test('a creature attacking another player is left out', () => {
    const g = game(3);
    g.act(0).declareAttackers([
      { attacker: BEARS, target: { player: 1 } },
      { attacker: ELVES, target: { player: 2 } },
      // The Hawk does not attack.
    ]);
    const order = g.state.pending;
    if (order?.kind === 'orderTriggers') {
      g.act(0).orderTriggers(...order.triggers.map((_, index) => index));
    }
    g.passAll();
    expect(pt(g, BEARS)).toEqual([3, 3]);
    expect(pt(g, HAWK)).toEqual([1, 1]);
  });

  test('it matches nothing outside a combat', () => {
    const g = game(3);
    // No attack declared: nothing to buff, and no trigger.
    g.act(0).declareAttackers([]);
    g.passAll();
    expect(pt(g, BEARS)).toEqual([2, 2]);
  });
});
