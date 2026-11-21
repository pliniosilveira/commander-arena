// Federation Fleet deck, group F (Command Beacon): "{T}, Sacrifice this land: Put your commander into your hand from the command zone." The controller's commander, chosen among the commanders they
// own in their command zone, goes to their hand.
// Pins (rule numbers the repository's own comments already cite; the rules text is not in this worktree, so none is quoted): CR 903.3 (a commander is a card its owner started the game with
// as their commander), CR 608.2d (the controller chooses as the effect resolves; with only one candidate nothing is asked), CR 118.3 and 602.2 (the cost is paid first, so the land is gone
// when the effect resolves), CR 903.8 (the commander tax counts casts from the command zone: moving it to the hand does not count as a cast).
// The card is the SYNTHETIC "Beacon Land" of this file; the commanders are real cards.
import { describe, expect, test } from 'vitest';
import { validateCard } from '../src/index';
import { scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';

const BEACON = 'SYNTHETIC Beacon Land';
const ISAMARU = 'Isamaru, Hound of Konda';
const YARGLE = 'Yargle, Glutton of Urborg';

const beacon = singleFaceCard({
  name: BEACON,
  manaCost: null,
  types: ['land'],
  colors: [],
  colorIdentity: [],
  oracleText: '{T}, Sacrifice this land: Put your commander into your hand from the command zone.',
  abilities: [
    {
      kind: 'activated',
      cost: [{ kind: 'tap' }, { kind: 'sacrifice', what: { kind: 'this' } }],
      effect: {
        kind: 'moveToZone',
        objects: {
          kind: 'choose',
          filter: { zone: 'command', controller: 'you', commander: 'yours' },
        },
        to: 'hand',
      },
    },
  ],
});

describe('the card is valid', () => {
  test('validateCard finds nothing wrong', () => {
    expect(validateCard(beacon)).toEqual([]);
  });
});

describe('"Put your commander into your hand from the command zone."', () => {
  test('the commander goes from the command zone to the hand, and the land is sacrificed as the cost', () => {
    const g = scenario().define(beacon).seat(0).battlefield(BEACON).commander(ISAMARU).build();
    g.act(0).activate(BEACON);
    g.passAll();
    g.expect.zone(ISAMARU, 'hand', { seat: 0 });
    g.expect.noObject(ISAMARU, { zone: 'command' });
    g.expect.zone(BEACON, 'graveyard', { seat: 0 });
    g.expect.invariants();
  });

  test('it is not a cast: the commander tax is unchanged (CR 903.8)', () => {
    const g = scenario()
      .define(beacon)
      .seat(0)
      .battlefield(BEACON)
      .commander(ISAMARU, { casts: 2 })
      .build();
    g.act(0).activate(BEACON);
    g.passAll();
    g.expect.zone(ISAMARU, 'hand', { seat: 0 });
    g.expect.invariants();
  });

  test('with no commander in the command zone the ability does nothing', () => {
    const g = scenario()
      .define(beacon)
      .seat(0)
      .battlefield(BEACON)
      .battlefield(ISAMARU, { commander: true })
      .build();
    g.act(0).activate(BEACON);
    g.passAll();
    g.expect.zone(ISAMARU, 'battlefield', { seat: 0 });
    g.expect.zone(BEACON, 'graveyard', { seat: 0 });
  });

  test('with two commanders the controller chooses which one goes to the hand (CR 608.2d)', () => {
    const g = scenario()
      .define(beacon)
      .seat(0)
      .battlefield(BEACON)
      .commander(ISAMARU)
      .commander(YARGLE)
      .build();
    g.act(0).activate(BEACON);
    g.passAll();
    g.expect.pending('chooseCards', 0);
    g.act(0).chooseCards(YARGLE);
    g.expect.zone(YARGLE, 'hand', { seat: 0 });
    g.expect.zone(ISAMARU, 'command', { seat: 0 });
    g.expect.invariants();
  });
});
