// "Each opponent returns a nonland permanent they control with the greatest mana value among permanents they control to its owner's hand, then discards a card." (the Dispersal half of
// Discovery // Dispersal): `moveToZone` of a `choose` with `players` and `greatest`, then `discard`.
// Pins: CR 608.2d (the player chooses among the tied permanents), CR 101.4 (each opponent chooses, in APNAP order, and the permanents move together), CR 202.3 (mana value: a land
// has 0, a nonland permanent is the only one that can be returned), CR 400.3 (a card returned goes to its owner's hand), CR 701.9 (discard). The card is SYNTHETIC, defined here.
import { describe, expect, test } from 'vitest';
import { validateCard } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';

const DISPERSE = 'SYNTHETIC Disperse';
const SPIDER = 'Giant Spider'; // {3}{G}: mana value 4
const BEARS = 'Grizzly Bears'; // {1}{G}: mana value 2
const ELVES = 'Llanowar Elves'; // {G}: mana value 1

const disperse = singleFaceCard({
  name: DISPERSE,
  manaCost: ['1'],
  types: ['instant'],
  colors: [],
  colorIdentity: [],
  oracleText:
    "Each opponent returns a nonland permanent they control with the greatest mana value among permanents they control to its owner's hand, then discards a card.",
  spell: {
    effect: {
      kind: 'sequence',
      effects: [
        {
          kind: 'moveToZone',
          objects: {
            kind: 'choose',
            filter: { controller: 'you', notTypes: ['land'] },
            players: { kind: 'eachOpponent' },
            greatest: 'manaValue',
          },
          to: 'hand',
        },
        { kind: 'discard', player: { kind: 'eachOpponent' }, count: 1 },
      ],
    },
  },
});

/** Seat 0 casts the spell with `a` and `b` the two opponents' permanents, and a card in each opponent's hand to discard. */
function game(a: readonly string[], b: readonly string[]): ScenarioGame {
  return scenario({ seats: 3 })
    .define(disperse)
    .seat(0)
    .hand(DISPERSE)
    .battlefield('Mountain')
    .seat(1)
    .battlefield(...a)
    .hand('Plains')
    .seat(2)
    .battlefield(...b)
    .hand('Plains')
    .at('precombatMain', { active: 0 })
    .build();
}

describe('the card is valid', () => {
  test('SYNTHETIC Disperse', () => {
    expect(validateCard(disperse)).toEqual([]);
  });
});

describe('each opponent returns their most expensive nonland permanent, then discards', () => {
  test('a unique greatest permanent is returned without asking, and the opponent then discards a card', () => {
    const g = game([SPIDER, BEARS, 'Forest'], [ELVES, 'Forest']);
    g.act(0).cast(DISPERSE, { pay: true });
    g.passAll();
    g.expect.zone(SPIDER, 'hand', { seat: 1 });
    g.expect.zone(BEARS, 'battlefield', { seat: 1 });
    g.expect.zone(ELVES, 'hand', { seat: 2 });
    // Each opponent discards a card next: they hold the Plains and the returned card.
    g.act(1).chooseCards('Plains');
    g.act(2).chooseCards('Plains');
    g.expect.handSize(1, 1);
    g.expect.handSize(2, 1);
    g.expect.invariants();
  });

  test('a tie is the opponent to choose among; the lower mana value is never offered', () => {
    const g = game([BEARS, BEARS, ELVES], ['Forest']);
    g.act(0).cast(DISPERSE, { pay: true });
    g.passAll();
    g.expect.pending('choosePermanent', 1);
    const pending = g.state.pending;
    if (pending?.kind !== 'choosePermanent') throw new Error('expected choosePermanent');
    expect(pending.legal).toHaveLength(2);
    expect(pending.legal).not.toContain(g.id(ELVES));
    g.act(1).choosePermanents('Grizzly Bears[0]');
    g.expect.zone(BEARS, 'hand', { seat: 1, count: 1 });
    g.expect.zone(BEARS, 'battlefield', { seat: 1, count: 1 });
    g.expect.invariants();
  });

  test('an opponent with only lands returns nothing, and still discards', () => {
    const g = game(['Forest', 'Forest'], [BEARS]);
    g.act(0).cast(DISPERSE, { pay: true });
    g.passAll();
    g.expect.zone('Forest', 'battlefield', { seat: 1, count: 2 });
    g.expect.zone(BEARS, 'hand', { seat: 2 });
    // Seat 1 has only the Plains to discard, so nothing is asked of it; seat 2 chooses between the Plains and the returned Bears.
    g.act(2).chooseCards('Plains');
    g.expect.handSize(1, 0);
    g.expect.handSize(2, 1);
    g.expect.invariants();
  });

  test('the controller of the spell returns nothing', () => {
    const g = game([BEARS], [BEARS]);
    g.act(0).cast(DISPERSE, { pay: true });
    g.passAll();
    g.expect.zone('Mountain', 'battlefield', { seat: 0 });
  });
});
