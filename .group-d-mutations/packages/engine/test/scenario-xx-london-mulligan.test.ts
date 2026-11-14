// London mulligan and game start (SPEC 5.1).
// Pins: CR 103.5 (Starting the Game): each player draws seven; a player who mulligans shuffles
// their hand into the library, draws a new hand of seven, then puts one card per mulligan taken on
// the bottom; the starting player declares first; a player can mulligan until the opening hand
// would be zero cards. CR 103.5c: the first mulligan doesn't count toward the cards put on the
// bottom or the number of mulligans (multiplayer and Brawl by the CR; for two players a house rule,
// freeFirstMulligan, off by default, SPEC 5.1).
import { describe, expect, test } from 'vitest';
import { createGame, type DeckConfig, deckOf } from '../src/index';
import { type ScenarioGame, startGame } from '../src/testing/index';

function deck(commander: string, land: string): DeckConfig {
  return {
    cards: deckOf([
      [commander, 1],
      [land, 99],
    ]),
    commanders: [0],
  };
}

const start = (seed = 1, freeFirstMulligan = false) =>
  startGame({
    seed,
    decks: [deck('Isamaru, Hound of Konda', 'Plains'), deck('Yargle, Glutton of Urborg', 'Swamp')],
    settings: { freeFirstMulligan },
  });

const starter = (g: ScenarioGame) => g.state.turn.activeSeat;
const hand = (g: ScenarioGame, seat: number) => g.state.seats[seat]?.hand ?? [];
const library = (g: ScenarioGame, seat: number) => g.state.seats[seat]?.library ?? [];

describe('CR 103.5 (Starting the Game): the opening hand', () => {
  test('everyone draws seven and the starting player declares first', () => {
    const g = start();
    expect(hand(g, 0)).toHaveLength(7);
    expect(hand(g, 1)).toHaveLength(7);
    g.expect.pending('mulligan', starter(g));
    expect(g.state.pending).toMatchObject({ kind: 'mulligan', bottomCount: 0, canMulligan: true });
    g.act(starter(g)).keep();
    g.expect.pending('mulligan', 1 - starter(g));
  });

  test('the other player is asked after the starting player, and then the game begins', () => {
    const g = start();
    const first = starter(g);
    g.act(first).keep();
    g.act(1 - first).keep();
    g.expect.step('upkeep', { active: first, turn: 1 });
    g.expect.eventLog([
      { kind: 'handKept', seat: first },
      { kind: 'handKept', seat: 1 - first },
      { kind: 'turnBegan', seat: first, turn: 1 },
    ]);
  });

  test('only the deciding seat may answer', () => {
    const g = start();
    g.expect.illegal(1 - starter(g), 'pass');
    expect(g.act(1 - starter(g)).try.action({ kind: 'keepHand' })).toEqual({
      ok: false,
      error: 'It is not your decision',
    });
  });

  test('a priority action is not a legal answer to the mulligan decision', () => {
    const g = start();
    expect(g.act(starter(g)).try.pass()).toMatchObject({ ok: false });
    expect(g.legalActions(starter(g)).map((a) => a.kind)).toEqual([
      'keepHand',
      'takeMulligan',
      'concede',
    ]);
  });
});

describe('CR 103.5 (Starting the Game): taking a mulligan', () => {
  test('a mulligan draws a fresh seven from the reshuffled library', () => {
    const g = start();
    const seat = starter(g);
    const before = [...hand(g, seat)];
    g.act(seat).mulligan();
    expect(hand(g, seat)).toHaveLength(7);
    expect(g.state.seats[seat]?.mulligans).toBe(1);
    expect(hand(g, seat)).not.toEqual(before);
    g.expect.eventLog([{ kind: 'mulliganTaken', seat, count: 1 }]);
    // Same seat decides again, and now keeping would bottom one card.
    g.expect.pending('mulligan', seat);
    expect(g.state.pending).toMatchObject({ kind: 'mulligan', bottomCount: 1 });
  });

  test('after one mulligan and a keep, one card goes to the bottom of the library', () => {
    const g = start();
    const seat = starter(g);
    g.act(seat).mulligan();
    g.act(seat).keep();
    g.expect.pending('mulliganBottom', seat);
    expect(g.state.pending).toMatchObject({ kind: 'mulliganBottom', count: 1 });
    const libraryBefore = library(g, seat).length;
    const chosen = hand(g, seat)[3];
    if (chosen === undefined) throw new Error('no card');
    g.act(seat).chooseCards(chosen);
    expect(hand(g, seat)).toHaveLength(6);
    expect(library(g, seat)).toHaveLength(libraryBefore + 1);
    g.expect.pending('mulligan', 1 - seat);
  });

  test('the bottomed card is the one the player chose, in the last place of the library', () => {
    const g = start(3);
    const seat = starter(g);
    g.act(seat).mulligan();
    g.act(seat).keep();
    const chosen = hand(g, seat)[0];
    if (chosen === undefined) throw new Error('no card');
    const card = g.state.objects[chosen]?.card;
    g.act(seat).chooseCards(chosen);
    const bottom = library(g, seat).at(-1);
    expect(bottom && g.state.objects[bottom]?.card).toBe(card);
    expect(hand(g, seat).some((id) => g.state.objects[id]?.card === card)).toBe(false);
  });

  test('two mulligans put two cards on the bottom: a five-card hand', () => {
    const g = start();
    const seat = starter(g);
    g.act(seat).mulligan();
    g.act(seat).mulligan();
    expect(g.state.pending).toMatchObject({ kind: 'mulligan', bottomCount: 2 });
    g.act(seat).keep();
    expect(g.state.pending).toMatchObject({ kind: 'mulliganBottom', count: 2 });
    const [a, b] = hand(g, seat);
    if (!a || !b) throw new Error('no cards');
    g.act(seat).chooseCards(a, b);
    expect(hand(g, seat)).toHaveLength(5);
  });

  test('bottoming the wrong number of cards is refused', () => {
    const g = start();
    const seat = starter(g);
    g.act(seat).mulligan();
    g.act(seat).keep();
    const [a, b] = hand(g, seat);
    if (!a || !b) throw new Error('no cards');
    expect(g.act(seat).try.action({ kind: 'chooseCards', objects: [a, b] })).toMatchObject({
      ok: false,
    });
    expect(g.act(seat).try.action({ kind: 'chooseCards', objects: [] })).toMatchObject({
      ok: false,
    });
  });

  test('the cards are conserved: hand, library and command zone always hold the 100 of the deck', () => {
    const g = start();
    const seat = starter(g);
    const total = () =>
      hand(g, seat).length + library(g, seat).length + (g.state.seats[seat]?.command.length ?? 0);
    expect(total()).toBe(100);
    g.act(seat).mulligan();
    expect(total()).toBe(100);
    g.act(seat).keep();
    g.act(seat).chooseCards(hand(g, seat)[0] ?? 'o0');
    expect(total()).toBe(100);
  });

  test('a player may take mulligans until the hand would be zero cards: seven, then no more', () => {
    const g = start();
    const seat = starter(g);
    for (let i = 0; i < 7; i += 1) {
      expect(g.state.pending).toMatchObject({ canMulligan: true });
      g.act(seat).mulligan();
    }
    expect(g.state.pending).toMatchObject({ kind: 'mulligan', bottomCount: 7, canMulligan: false });
    expect(g.legalActions(seat).map((a) => a.kind)).toEqual(['keepHand', 'concede']);
    expect(g.act(seat).try.action({ kind: 'takeMulligan' })).toMatchObject({ ok: false });
    g.act(seat).keep();
    g.act(seat).chooseCards(...hand(g, seat));
    expect(hand(g, seat)).toHaveLength(0);
  });

  test("one player's mulligan does not touch the other player's hand", () => {
    const g = start();
    const first = starter(g);
    const other = 1 - first;
    const otherHand = [...hand(g, other)];
    g.act(first).mulligan();
    g.act(first).keep();
    g.act(first).chooseCards(hand(g, first)[0] ?? 'o0');
    expect(hand(g, other)).toEqual(otherHand);
    g.expect.pending('mulligan', other);
  });
});

describe('CR 103.5c (Starting the Game): the free first mulligan house rule', () => {
  test('off by default: the setting is false', () => {
    expect(
      createGame({
        seed: 1,
        decks: [
          deck('Isamaru, Hound of Konda', 'Plains'),
          deck('Yargle, Glutton of Urborg', 'Swamp'),
        ],
      }).state.settings.freeFirstMulligan,
    ).toBe(false);
  });

  test('on: the first mulligan puts nothing on the bottom', () => {
    const g = start(1, true);
    const seat = starter(g);
    g.act(seat).mulligan();
    expect(g.state.pending).toMatchObject({ kind: 'mulligan', bottomCount: 0 });
    g.act(seat).keep();
    // Kept with no bottom decision: seven cards, and the next player is asked.
    expect(hand(g, seat)).toHaveLength(7);
    g.expect.pending('mulligan', 1 - seat);
  });

  test('on: the second mulligan puts one card on the bottom', () => {
    const g = start(1, true);
    const seat = starter(g);
    g.act(seat).mulligan();
    g.act(seat).mulligan();
    expect(g.state.pending).toMatchObject({ bottomCount: 1 });
    g.act(seat).keep();
    expect(g.state.pending).toMatchObject({ kind: 'mulliganBottom', count: 1 });
    g.act(seat).chooseCards(hand(g, seat)[0] ?? 'o0');
    expect(hand(g, seat)).toHaveLength(6);
  });

  test('on: the free mulligan does not count toward the number a player may take (eight in all)', () => {
    const g = start(1, true);
    const seat = starter(g);
    for (let i = 0; i < 7; i += 1) g.act(seat).mulligan();
    // Seven taken, the first of them free: the eighth is still possible, bottoming 7 cards.
    expect(g.state.pending).toMatchObject({ kind: 'mulligan', bottomCount: 6, canMulligan: true });
    g.act(seat).mulligan();
    expect(g.state.pending).toMatchObject({ bottomCount: 7, canMulligan: false });
    g.act(seat).keep();
    g.act(seat).chooseCards(...hand(g, seat));
    expect(hand(g, seat)).toHaveLength(0);
  });

  test('off: the first mulligan does count, so keeping after one bottoms one card', () => {
    const g = start(1, false);
    const seat = starter(g);
    g.act(seat).mulligan();
    expect(g.state.pending).toMatchObject({ bottomCount: 1 });
  });
});
