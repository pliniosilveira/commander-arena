// Starting the game (SPEC 5.1).
// Pins: CR 103.1 (Starting the Game): the starting player is chosen at random, here from the seeded
// PRNG; CR 103.3: each player shuffles their deck; CR 103.4c and CR 903.7 (Commander): each
// player's starting life total is 40; CR 903.6: each player puts their commander face up into the
// command zone and the rest of the deck becomes the library; CR 103.8a: in a two-player game the
// player who plays first skips the draw step of their first turn; CR 504.1 (Draw Step): every
// later draw step draws a card.
import { describe, expect, test } from 'vitest';
import { createGame, type DeckConfig, deckOf } from '../src/index';
import { type ScenarioGame, startGame } from '../src/testing/index';

function decks(): DeckConfig[] {
  return [
    {
      cards: deckOf([
        ['Isamaru, Hound of Konda', 1],
        ['Plains', 99],
      ]),
      commanders: [0],
    },
    {
      cards: deckOf([
        ['Yargle, Glutton of Urborg', 1],
        ['Swamp', 99],
      ]),
      commanders: [0],
    },
  ];
}

const game = (seed = 1) => startGame({ seed, decks: decks() });
const keepBoth = (g: ScenarioGame) => {
  const first = g.state.turn.activeSeat;
  g.act(first).keep();
  g.act(1 - first).keep();
};

describe('CR 103.4c and CR 903.7 (Commander): 40 starting life', () => {
  test('both players start at 40 life', () => {
    const g = game();
    g.expect.life(0, 40);
    g.expect.life(1, 40);
  });

  test('the starting life is a setting; the Commander value is the default', () => {
    const g = startGame({ seed: 1, decks: decks(), settings: { startingLife: 30 } });
    g.expect.life(0, 30);
    g.expect.life(1, 30);
  });
});

describe('CR 903.6 (Commander): commanders start in the command zone', () => {
  test('each commander is in its owner command zone, face up, and flagged as a commander', () => {
    const g = game();
    for (const [seat, name] of [
      [0, 'Isamaru, Hound of Konda'],
      [1, 'Yargle, Glutton of Urborg'],
    ] as const) {
      g.expect.zone(name, 'command', { seat, count: 1 });
      const obj = g.object({ name, seat });
      expect(obj.face).toBe(0);
      const card = obj.card;
      expect(card && g.state.cards[card]?.isCommander).toBe(true);
      expect(g.state.seats[seat]?.commanders).toEqual([card]);
    }
  });

  test('the rest of the deck is the library: 99 cards, seven of them drawn', () => {
    const g = game();
    for (const seat of [0, 1]) {
      expect(g.state.seats[seat]?.hand).toHaveLength(7);
      expect(g.state.seats[seat]?.library).toHaveLength(92);
      expect(g.state.seats[seat]?.command).toHaveLength(1);
    }
  });

  test('the commander is never in the opening hand or the library', () => {
    for (let seed = 1; seed <= 15; seed += 1) {
      const g = game(seed);
      g.expect.noObject('Isamaru, Hound of Konda', { zone: 'hand' });
      g.expect.noObject('Isamaru, Hound of Konda', { zone: 'library' });
      g.expect.noObject('Yargle, Glutton of Urborg', { zone: 'hand' });
    }
  });

  test('only the commander card is flagged', () => {
    const g = game();
    const flagged = Object.values(g.state.cards).filter((c) => c.isCommander);
    expect(flagged).toHaveLength(2);
  });

  test('two commanders are supported in the deck configuration (partners, CR 903.3)', () => {
    const two: DeckConfig = {
      cards: deckOf([
        ['Isamaru, Hound of Konda', 1],
        ['Yargle, Glutton of Urborg', 1],
        ['Plains', 98],
      ]),
      commanders: [0, 1],
    };
    const g = startGame({ seed: 1, decks: [two, decks()[1] as DeckConfig] });
    expect(g.state.seats[0]?.commanders).toHaveLength(2);
    expect(g.state.seats[0]?.command).toHaveLength(2);
  });
});

describe('CR 103.1 (Starting the Game): the starting player comes from the seed', () => {
  test('the same seed always starts the same player', () => {
    expect(game(4).state.turn.activeSeat).toBe(game(4).state.turn.activeSeat);
  });

  test('over many seeds both players get to start', () => {
    const starters = new Set<number>();
    for (let seed = 1; seed <= 30; seed += 1) starters.add(game(seed).state.turn.activeSeat);
    expect([...starters].sort()).toEqual([0, 1]);
  });

  test('the starting player is named in the first event', () => {
    const created = createGame({ seed: 9, decks: decks() });
    expect(created.events[0]).toEqual({
      kind: 'gameStarted',
      startingSeat: created.state.turn.activeSeat,
      seed: 9,
    });
  });
});

describe('CR 103.8a (Starting the Game): the starting player skips the first draw', () => {
  test('the starting player does not draw in the draw step of turn 1', () => {
    const g = game();
    const first = g.state.turn.activeSeat;
    keepBoth(g);
    g.advanceTo('precombatMain');
    g.expect.step('precombatMain', { active: first, turn: 1 });
    g.expect.handSize(first, 7);
    g.expect.librarySize(first, 92);
    g.expect.noEvent({ kind: 'cardDrawn' });
  });

  test('the other player draws in their first draw step', () => {
    const g = game();
    const first = g.state.turn.activeSeat;
    keepBoth(g);
    g.advanceTo('precombatMain', { turn: 2 });
    g.expect.step('precombatMain', { active: 1 - first, turn: 2 });
    g.expect.handSize(1 - first, 8);
    g.expect.librarySize(1 - first, 91);
    g.expect.eventLog([{ kind: 'cardDrawn', seat: 1 - first }]);
  });

  test("the starting player's second turn draws as usual (CR 504.1)", () => {
    const g = game();
    const first = g.state.turn.activeSeat;
    keepBoth(g);
    g.advanceTo('end', { turn: 2 });
    g.passAll();
    // Turn 2's cleanup: the second player has 8 cards and discards one.
    g.act(1 - first).chooseCards(g.state.seats[1 - first]?.hand[0] ?? 'o0');
    g.advanceTo('precombatMain', { turn: 3 });
    g.expect.step('precombatMain', { active: first, turn: 3 });
    g.expect.handSize(first, 8);
    g.expect.librarySize(first, 91);
  });
});
