// "Look at the top N cards of your library, then put them back in any order" and "put N cards from
// your hand on top of your library in any order" (D-091).
// Pins: the reordering is not the keyword action scry (no scried event, CR 701.22), the cards looked
// at keep their objects; CR 400.7 (a card moved from the hand to the library is a new object),
// CR 903.9b (a commander put into the library may go to the command zone instead), CR 401.2.
// All cards are SYNTHETIC (src/cards/fixtures/synthetic-library.ts), Isamaru or basic lands.
import { describe, expect, test } from 'vitest';
import { type Action, applyAction } from '../src/index';
import { scenario } from '../src/testing/index';
import { chooseCardsDecision } from './pending-helpers';
import {
  arrangeDecision,
  castAndResolve,
  handNames,
  kinds,
  libraryGame,
  libraryNames,
} from './scry-helpers';

describe('look at the top three cards and put them back in any order', () => {
  test('asks for the order, with only the top pile', () => {
    const g = libraryGame('SYNTHETIC Reorder Three');
    castAndResolve(g, 'SYNTHETIC Reorder Three');
    g.expect.pending('arrangeCards', 0);
    const d = arrangeDecision(g);
    expect(d.purpose).toBe('reorder');
    expect(d.piles).toEqual(['top']);
    expect(d.cards).toEqual([g.id('a'), g.id('b'), g.id('c')]);
  });

  test('the order chosen is the order from the top; the rest of the library is untouched', () => {
    const g = libraryGame('SYNTHETIC Reorder Three');
    castAndResolve(g, 'SYNTHETIC Reorder Three');
    const mark = g.mark();
    g.act(0).arrange({ top: ['c', 'a', 'b'] });
    expect(libraryNames(g)).toEqual(['Plains', 'Island', 'Forest', 'Swamp', 'Mountain']);
    expect(g.state.seats[0]?.library.slice(0, 3)).toEqual([g.id('c'), g.id('a'), g.id('b')]);
    // Not a scry (no scried event, nothing for "whenever you scry" to see) and no zone change.
    const events = g.eventsSince(mark);
    expect(kinds(events)).not.toContain('scried');
    expect(events.filter((e) => e.kind === 'zoneChanged' && e.fromZone === 'library')).toEqual([]);
    g.expect.pending('priority', 0);
    g.expect.invariants();
  });

  test('with fewer cards than asked the cards there are put back (two cards, three asked)', () => {
    const g = libraryGame('SYNTHETIC Reorder Three', 2);
    castAndResolve(g, 'SYNTHETIC Reorder Three');
    expect(arrangeDecision(g).cards).toEqual([g.id('a'), g.id('b')]);
    g.act(0).arrange({ top: ['b', 'a'] });
    expect(libraryNames(g)).toEqual(['Forest', 'Island']);
  });

  test('one card can only go back where it is: no question', () => {
    const g = libraryGame('SYNTHETIC Reorder One');
    castAndResolve(g, 'SYNTHETIC Reorder One');
    g.expect.pending('priority', 0);
    expect(libraryNames(g)).toEqual(['Island', 'Forest', 'Plains', 'Swamp', 'Mountain']);
  });

  test('an empty library: nothing happens and nothing is asked', () => {
    const g = libraryGame('SYNTHETIC Reorder Three', 0);
    castAndResolve(g, 'SYNTHETIC Reorder Three');
    g.expect.pending('priority', 0);
    g.expect.zone('SYNTHETIC Reorder Three', 'graveyard', { seat: 0 });
  });

  test('lists every order and accepts each; none has a second pile', () => {
    const g = libraryGame('SYNTHETIC Reorder Three');
    castAndResolve(g, 'SYNTHETIC Reorder Three');
    const listed = g.legalActions(0).filter((a) => a.kind === 'arrangeCards');
    const [a, b, c] = [g.id('a'), g.id('b'), g.id('c')];
    expect(listed).toHaveLength(6);
    expect(listed[0]).toEqual({ kind: 'arrangeCards', top: [a, b, c], other: [] });
    for (const action of listed) {
      expect(applyAction(g.state, 0, action).ok, JSON.stringify(action)).toBe(true);
    }
    // Every card must go back on top: a card in a second pile is refused.
    const r = g.act(0).try.action({ kind: 'arrangeCards', top: [a, b], other: [c] });
    expect(r.ok).toBe(false);
  });
});

/** A Brainstorm-like game: hand Plains and Island besides the spell, three cards to draw. */
function brainstormGame() {
  return scenario()
    .seat(0)
    .hand('SYNTHETIC Brainstorm Like')
    .hand('Plains', { label: 'h1' })
    .hand('Island', { label: 'h2' })
    .pool('U')
    .library('Forest', { label: 'a' })
    .library('Swamp', { label: 'b' })
    .library('Mountain', { label: 'c' })
    .library('Grizzly Bears', { label: 'd' })
    .library('Llanowar Elves', { label: 'e' })
    .seat(1)
    .library('Serra Angel')
    .build();
}

describe('draw three, then put two cards from your hand on top in any order', () => {
  test('asks for exactly two cards of the hand, which stay hidden', () => {
    const g = brainstormGame();
    castAndResolve(g, 'SYNTHETIC Brainstorm Like');
    g.expect.pending('chooseCards', 0);
    const d = chooseCardsDecision(g);
    expect(d.purpose).toBe('putOnTop');
    expect(d.zone).toBe('hand');
    expect(d.min).toBe(2);
    expect(d.max).toBe(2);
    expect(d.reveal).toBe(false);
    expect(d.legal).toHaveLength(5);
    expect(d.legal).toEqual(g.state.seats[0]?.hand);
    expect(d.prompt).toContain('two cards');
    expect(handNames(g)).toHaveLength(5);
  });

  test('the first card chosen ends up on top, the second under it', () => {
    const g = brainstormGame();
    castAndResolve(g, 'SYNTHETIC Brainstorm Like');
    const mark = g.mark();
    // Hand: Plains, Island and the three drawn (Forest, Swamp, Mountain). Put Swamp, then Plains.
    g.act(0).chooseCards('b', 'h1');
    expect(libraryNames(g)).toEqual(['Swamp', 'Plains', 'Grizzly Bears', 'Llanowar Elves']);
    expect(handNames(g).sort()).toEqual(['Forest', 'Island', 'Mountain']);
    // They are new objects (CR 400.7), moved from the hand to the library, last chosen first.
    const moved = g
      .eventsSince(mark)
      .filter((e) => e.kind === 'zoneChanged' && e.toZone === 'library');
    expect(moved).toHaveLength(2);
    expect(moved.map((e) => (e.kind === 'zoneChanged' ? e.fromZone : ''))).toEqual([
      'hand',
      'hand',
    ]);
    g.expect.pending('priority', 0);
    g.expect.invariants();
  });

  test('the same two cards in the other order give the other library order', () => {
    const g = brainstormGame();
    castAndResolve(g, 'SYNTHETIC Brainstorm Like');
    g.act(0).chooseCards('h1', 'b');
    expect(libraryNames(g)).toEqual(['Plains', 'Swamp', 'Grizzly Bears', 'Llanowar Elves']);
  });

  test('an answer with one card, or three, or a card twice, is refused', () => {
    const g = brainstormGame();
    castAndResolve(g, 'SYNTHETIC Brainstorm Like');
    const answer = (...labels: string[]): Action => ({
      kind: 'chooseCards',
      objects: labels.map((l) => g.id(l)),
    });
    expect(g.act(0).try.action(answer('h1')).ok).toBe(false);
    expect(g.act(0).try.action(answer('h1', 'h2', 'b')).ok).toBe(false);
    expect(g.act(0).try.action(answer('h1', 'h1')).ok).toBe(false);
    // A card that is not in the hand (the library's Grizzly Bears) is refused too.
    expect(g.act(0).try.action(answer('h1', 'd')).ok).toBe(false);
    g.expect.pending('chooseCards', 0);
  });

  test('lists every ordered pair and accepts each', () => {
    const g = brainstormGame();
    castAndResolve(g, 'SYNTHETIC Brainstorm Like');
    const listed = g.legalActions(0).filter((a: Action) => a.kind === 'chooseCards');
    // Five cards, two chosen, in order: 5 * 4.
    expect(listed).toHaveLength(20);
    expect(new Set(listed.map((a) => JSON.stringify(a))).size).toBe(20);
    for (const action of listed) {
      expect(applyAction(g.state, 0, action).ok, JSON.stringify(action)).toBe(true);
    }
  });
});

describe('put cards from the hand on top with a small hand', () => {
  const game = (hand: string[]) => {
    let b = scenario().seat(0).hand('SYNTHETIC Put Back Two').pool('U');
    for (const name of hand) b = b.hand(name);
    return b.library('Forest').library('Swamp').seat(1).library('Serra Angel').build();
  };

  test('with one card in hand there is nothing to choose: it goes on top', () => {
    const g = game(['Plains']);
    castAndResolve(g, 'SYNTHETIC Put Back Two');
    g.expect.pending('priority', 0);
    expect(libraryNames(g)).toEqual(['Plains', 'Forest', 'Swamp']);
    expect(handNames(g)).toEqual([]);
  });

  test('with an empty hand nothing happens', () => {
    const g = game([]);
    castAndResolve(g, 'SYNTHETIC Put Back Two');
    g.expect.pending('priority', 0);
    expect(libraryNames(g)).toEqual(['Forest', 'Swamp']);
  });

  test("with exactly two cards both go back, and the order is still the player's to choose", () => {
    const g = game(['Plains', 'Island']);
    castAndResolve(g, 'SYNTHETIC Put Back Two');
    g.expect.pending('chooseCards', 0);
    const d = chooseCardsDecision(g);
    expect(d.min).toBe(2);
    expect(d.max).toBe(2);
    g.act(0).chooseCards('Island', 'Plains');
    expect(libraryNames(g)).toEqual(['Island', 'Plains', 'Forest', 'Swamp']);
  });

  test('"put a card from your hand on top": one of several cards of the hand', () => {
    let b = scenario().seat(0).hand('SYNTHETIC Put Back One').pool('U');
    b = b.hand('Plains').hand('Island');
    const g = b.library('Forest').seat(1).library('Serra Angel').build();
    castAndResolve(g, 'SYNTHETIC Put Back One');
    g.expect.pending('chooseCards', 0);
    const d = chooseCardsDecision(g);
    expect([d.min, d.max]).toEqual([1, 1]);
    expect(d.prompt).toBe('Put a card from your hand on top of your library.');
    g.act(0).chooseCards('Island');
    expect(libraryNames(g)).toEqual(['Island', 'Forest']);
    expect(handNames(g)).toEqual(['Plains']);
  });
});

describe('a commander put on top of the library (CR 903.9b)', () => {
  const game = () =>
    scenario()
      .seat(0)
      .hand('SYNTHETIC Put Back Two')
      .hand('Isamaru, Hound of Konda', { label: 'cmdr', commander: true })
      .hand('Plains', { label: 'plains' })
      .pool('U')
      .library('Forest')
      .library('Swamp')
      .seat(1)
      .library('Serra Angel')
      .build();

  test('its owner may put it into the command zone instead, and the other card still goes on top', () => {
    const g = game();
    castAndResolve(g, 'SYNTHETIC Put Back Two');
    // The commander is moved first (the last chosen goes first), so it asks first.
    g.act(0).chooseCards('plains', 'cmdr');
    g.expect.pending('commanderZone', 0);
    g.act(0).sendToCommandZone();
    g.expect.zone('Isamaru, Hound of Konda', 'command', { seat: 0 });
    expect(libraryNames(g)).toEqual(['Plains', 'Forest', 'Swamp']);
    g.expect.pending('priority', 0);
  });

  test('or decline: it goes on top as chosen', () => {
    const g = game();
    castAndResolve(g, 'SYNTHETIC Put Back Two');
    g.act(0).chooseCards('cmdr', 'plains');
    g.expect.pending('commanderZone', 0);
    g.act(0).declineCommandZone();
    expect(libraryNames(g)).toEqual(['Isamaru, Hound of Konda', 'Plains', 'Forest', 'Swamp']);
    g.expect.pending('priority', 0);
  });
});
