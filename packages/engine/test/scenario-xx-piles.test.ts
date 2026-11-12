// "Reveal the top five cards of your library. An opponent separates those cards into two piles. Put one pile into your hand and the other into your graveyard." (D-971, the
// effect `revealAndSeparate`; Fact or Fiction of the Niv-Mizzet deck, issue 25).
// Pins: CR 700.3 (piles: each card in exactly one pile, a pile may hold zero cards, the cards stay in the library while they are sorted, 700.3a, 700.3c, 700.3d), CR 701.20
// (the cards are revealed: public, and they do not move), CR 903.9b (a commander going to a hand asks its owner), CR 404.3 (graveyard order, library order here).
// The cards are SYNTHETIC (src/cards/fixtures/synthetic-piles.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { getLegalActions, stateHash, syntheticCard, validateCard } from '../src/index';
import { createDriver, type ScenarioGame, scenario } from '../src/testing/index';
import { chooseCardsDecision, chooseOptionDecision } from './pending-helpers';

const READING = 'SYNTHETIC Pile Reading'; // the controller reveals five, an opponent separates, the controller chooses (an instant)
const OFFERING = 'SYNTHETIC Pile Offering'; // the controller separates four, an opponent chooses (a sorcery)
const TITHE = 'SYNTHETIC Pile Tithe'; // three cards, the chosen pile goes to the graveyard and the other to the hand
const TOP = ['Grizzly Bears', 'Giant Spider', 'Serra Angel', 'Lightning Bolt', 'Sol Ring'] as const;
const LABELS = ['a', 'b', 'c', 'd', 'e'] as const;

/** Seat 0 has `hand` and four Islands; its library is the five labelled cards a to e (top first) and `rest`; seat 1 has a small library. */
function game(
  hand: string,
  options: { rest?: readonly string[]; top?: readonly string[]; commander?: number } = {},
) {
  const top = options.top ?? TOP;
  const b = scenario().seat(0).hand(hand).battlefield('Island', 'Island', 'Island', 'Island');
  top.forEach((name, i) => {
    b.library(name, {
      label: LABELS[i] ?? `x${i}`,
      ...(options.commander === i ? { commander: true } : {}),
    });
  });
  for (const name of options.rest ?? ['Plains', 'Plains', 'Plains']) b.library(name);
  return b.seat(1).library('Island', 'Island').at('precombatMain', { active: 0, turn: 1 }).build();
}

/** Casts the card and resolves it as far as its first question. */
function cast(g: ScenarioGame, name: string): ScenarioGame {
  g.act(0).cast(name, { pay: true });
  g.passAll();
  return g;
}

const zoneOf = (g: ScenarioGame, label: string) => g.state.objects[g.id(label)]?.zone;

describe('the cards are valid', () => {
  test.each([READING, OFFERING, TITHE])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });

  test('the two destinations must differ and be a hand or a graveyard', () => {
    const card = syntheticCard(READING);
    const face = card.faces[0];
    if (face === undefined) throw new Error('no face');
    const withEffect = (effect: object) =>
      ({ ...card, faces: [{ ...face, spell: { effect } }] }) as never;
    const base = { kind: 'revealAndSeparate', count: 5, separator: 'opponent' };
    expect(
      validateCard(withEffect({ ...base, chosenTo: 'hand', otherTo: 'hand' })).length,
    ).toBeGreaterThan(0);
    expect(
      validateCard(withEffect({ ...base, chosenTo: 'hand', otherTo: 'battlefield' })).length,
    ).toBeGreaterThan(0);
    expect(validateCard(withEffect({ ...base, chosenTo: 'hand', otherTo: 'graveyard' }))).toEqual(
      [],
    );
    expect(
      validateCard(
        withEffect({ ...base, separator: 'target', chosenTo: 'hand', otherTo: 'graveyard' }),
      ).length,
    ).toBeGreaterThan(0);
  });
});

describe('the opponent separates the revealed cards (CR 700.3)', () => {
  test('the opponent is asked which cards form pile 1, among the five cards, which are still in the library (CR 700.3c)', () => {
    const g = cast(game(READING), READING);
    const d = chooseCardsDecision(g);
    expect(d.seat).toBe(1);
    expect(d.purpose).toBe('separate');
    expect(d.zone).toBe('library');
    expect(d.min).toBe(0);
    expect(d.max).toBe(5);
    expect(d.reveal).toBe(true);
    expect(d.legal).toEqual(LABELS.map((l) => g.id(l)));
    // Revealing and sorting do not move anything (CR 701.20b, 700.3c).
    for (const l of LABELS) expect(zoneOf(g, l)).toBe('library');
    g.expect.librarySize(0, 8);
    g.expect.handSize(0, 0);
    g.expect.invariants();
  });

  test('the cards are public: the event names all five, the opponent sees them in the view, the controller is only told who is choosing', () => {
    const g = cast(game(READING), READING);
    const revealed = g.eventsSince(0).find((e) => e.kind === 'cardsRevealed');
    expect(revealed?.kind === 'cardsRevealed' ? revealed.names : []).toEqual([...TOP]);
    expect(revealed?.kind === 'cardsRevealed' ? revealed.seat : -1).toBe(0);
    const opponent = g.view(1);
    expect(opponent.pendingCards?.map((o) => o.name)).toEqual([...TOP]);
    const controller = g.view(0);
    expect(controller.pendingCards).toBeUndefined();
    expect(controller.waitingOn).toEqual({ seat: 1, purpose: 'separate', sourceName: READING });
  });

  test('the controller cannot separate, and the answer must be distinct cards of the five', () => {
    const g = cast(game(READING), READING);
    expect(() => g.act(0).chooseCards('a')).toThrow();
    expect(() => g.act(1).chooseCards('a', 'a')).toThrow();
    expect(() => g.act(1).chooseCards({ name: 'Island', seat: 1 })).toThrow();
    g.expect.pending('chooseCards', 1);
  });

  test("the opponent's split is respected: pile 1 is exactly the cards chosen, pile 2 the others", () => {
    const g = cast(game(READING), READING);
    g.act(1).chooseCards('b', 'e');
    const d = chooseOptionDecision(g);
    expect(d.seat).toBe(0);
    expect(d.purpose).toBe('pile');
    expect(d.options).toEqual(['pile1', 'pile2']);
    expect(d.piles?.first).toEqual([g.id('b'), g.id('e')]);
    expect(d.piles?.second).toEqual([g.id('a'), g.id('c'), g.id('d')]);
    expect(d.piles?.chosenTo).toBe('hand');
    expect(d.piles?.otherTo).toBe('graveyard');
    expect(d.piles?.separator).toBe(1);
    // Still nothing moved while the piles wait for the choice (CR 700.3c).
    for (const l of LABELS) expect(zoneOf(g, l)).toBe('library');
    // The controller sees every card of both piles.
    expect(
      g
        .view(0)
        .pendingCards?.map((o) => o.name)
        .sort(),
    ).toEqual([...TOP].sort());
    expect(g.view(1).waitingOn).toEqual({ seat: 0, purpose: 'pile', sourceName: READING });
  });
});

describe('the controller picks a pile: it goes to the hand and the other to the graveyard', () => {
  test('pile 1 into the hand', () => {
    const g = cast(game(READING), READING);
    g.act(1).chooseCards('b', 'e');
    g.act(0).chooseOption('pile1');
    g.expect.zone('Giant Spider', 'hand', { seat: 0 });
    g.expect.zone('Sol Ring', 'hand', { seat: 0 });
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 0 });
    g.expect.zone('Serra Angel', 'graveyard', { seat: 0 });
    g.expect.zone('Lightning Bolt', 'graveyard', { seat: 0 });
    g.expect.handSize(0, 2);
    g.expect.librarySize(0, 3);
    g.expect.pending('priority' as never);
    g.expect.invariants();
  });

  test('pile 2 into the hand', () => {
    const g = cast(game(READING), READING);
    g.act(1).chooseCards('b', 'e');
    g.act(0).chooseOption('pile2');
    for (const name of ['Grizzly Bears', 'Serra Angel', 'Lightning Bolt']) {
      g.expect.zone(name, 'hand', { seat: 0 });
    }
    g.expect.zone('Giant Spider', 'graveyard', { seat: 0 });
    g.expect.zone('Sol Ring', 'graveyard', { seat: 0 });
    g.expect.handSize(0, 3);
  });

  test('the answer must be one of the two piles, from the right player', () => {
    const g = cast(game(READING), READING);
    g.act(1).chooseCards('b', 'e');
    expect(() => g.act(1).chooseOption('pile1')).toThrow();
    expect(() => g.act(0).chooseOption('pile3')).toThrow();
    g.expect.pending('chooseOption', 0);
  });

  test('the spell is in the graveyard after it resolves, and the log tells the piles and the choice', () => {
    const g = cast(game(READING), READING);
    g.act(1).chooseCards('a');
    g.act(0).chooseOption('pile1');
    g.expect.zone(READING, 'graveyard', { seat: 0 });
    const made = g.eventsSince(0).find((e) => e.kind === 'pilesSeparated');
    expect(made).toMatchObject({
      kind: 'pilesSeparated',
      seat: 1,
      first: ['Grizzly Bears'],
      second: ['Giant Spider', 'Serra Angel', 'Lightning Bolt', 'Sol Ring'],
    });
    const chosen = g.eventsSince(0).find((e) => e.kind === 'pileChosen');
    expect(chosen).toMatchObject({
      kind: 'pileChosen',
      seat: 0,
      pile: 1,
      names: ['Grizzly Bears'],
    });
  });
});

describe('either pile may be empty (CR 700.3d)', () => {
  test('all five cards in pile 1: the controller takes them all, or sends them all to the graveyard', () => {
    const take = cast(game(READING), READING);
    take.act(1).chooseCards('a', 'b', 'c', 'd', 'e');
    expect(chooseOptionDecision(take).piles?.second).toEqual([]);
    take.act(0).chooseOption('pile1');
    take.expect.handSize(0, 5);

    const bin = cast(game(READING), READING);
    bin.act(1).chooseCards('a', 'b', 'c', 'd', 'e');
    bin.act(0).chooseOption('pile2');
    bin.expect.handSize(0, 0);
    for (const l of LABELS) expect(zoneOf(bin, l)).toBe('graveyard');
    bin.expect.librarySize(0, 3);
  });

  test('no card in pile 1: the same with the piles the other way round', () => {
    const g = cast(game(READING), READING);
    g.act(1).chooseCards();
    const d = chooseOptionDecision(g);
    expect(d.piles?.first).toEqual([]);
    expect(d.piles?.second).toHaveLength(5);
    g.act(0).chooseOption('pile2');
    g.expect.handSize(0, 5);
  });
});

describe('a library with fewer cards than the number asked', () => {
  test('three cards: all three are revealed and sorted, the others are not there', () => {
    const g = cast(game(READING, { top: TOP.slice(0, 3), rest: [] }), READING);
    const d = chooseCardsDecision(g);
    expect(d.legal).toHaveLength(3);
    expect(d.max).toBe(3);
    g.act(1).chooseCards('a');
    g.act(0).chooseOption('pile2');
    g.expect.zone('Giant Spider', 'hand', { seat: 0 });
    g.expect.zone('Serra Angel', 'hand', { seat: 0 });
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 0 });
    g.expect.librarySize(0, 0);
    g.expect.hasLost(0, false);
  });

  test('one card: nothing to separate (every split of one card is the same choice), the controller still picks hand or graveyard', () => {
    const g = cast(game(READING, { top: TOP.slice(0, 1), rest: [] }), READING);
    const d = chooseOptionDecision(g);
    expect(d.seat).toBe(0);
    expect(d.piles?.first).toEqual([g.id('a')]);
    expect(d.piles?.second).toEqual([]);
    g.act(0).chooseOption('pile2');
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 0 });
  });

  test('an empty library: nothing is revealed, nobody is asked, and the controller does not lose for it', () => {
    const g = cast(game(READING, { top: [], rest: [] }), READING);
    g.expect.pending('priority' as never);
    g.expect.noEvent({ kind: 'cardsRevealed' });
    g.expect.zone(READING, 'graveyard', { seat: 0 });
    g.expect.hasLost(0, false);
  });
});

describe('who separates and who chooses', () => {
  test('the controller separates and an opponent chooses; the chosen pile still goes to the controller', () => {
    const g = game(OFFERING, { top: TOP.slice(0, 4) });
    g.act(0).cast(OFFERING, { pay: true });
    g.passAll();
    const first = chooseCardsDecision(g);
    expect(first.seat).toBe(0);
    expect(first.purpose).toBe('separate');
    expect(first.max).toBe(4);
    g.act(0).chooseCards('a', 'b');
    const pick = chooseOptionDecision(g);
    expect(pick.seat).toBe(1);
    expect(pick.piles?.separator).toBe(0);
    expect(pick.piles?.receiver).toBe(0);
    g.act(1).chooseOption('pile2');
    g.expect.zone('Serra Angel', 'hand', { seat: 0 });
    g.expect.zone('Lightning Bolt', 'hand', { seat: 0 });
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 0 });
    g.expect.zone('Giant Spider', 'graveyard', { seat: 0 });
    g.expect.handSize(1, 0);
    g.expect.invariants();
  });

  test('the destinations are data: the pile chosen can go to the graveyard and the other to the hand', () => {
    const g = game(TITHE, { top: TOP.slice(0, 3) });
    g.act(0).cast(TITHE, { pay: true });
    g.passAll();
    g.act(1).chooseCards('a');
    const d = chooseOptionDecision(g);
    expect(d.piles?.chosenTo).toBe('graveyard');
    expect(d.piles?.otherTo).toBe('hand');
    g.act(0).chooseOption('pile1');
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 0 });
    g.expect.zone('Giant Spider', 'hand', { seat: 0 });
    g.expect.zone('Serra Angel', 'hand', { seat: 0 });
  });
});

describe('a commander in a pile goes through the existing move path (CR 903.9)', () => {
  test('in the pile that goes to the hand its owner may put it into the command zone instead (CR 903.9b)', () => {
    const g = cast(game(READING, { commander: 2 }), READING);
    g.act(1).chooseCards('c');
    g.act(0).chooseOption('pile1');
    g.expect.pending('commanderZone', 0);
    g.act(0).sendToCommandZone();
    g.expect.zone('Serra Angel', 'command', { seat: 0 });
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 0 });
    g.expect.invariants();
  });

  test('declining leaves it in the hand', () => {
    const g = cast(game(READING, { commander: 2 }), READING);
    g.act(1).chooseCards('c');
    g.act(0).chooseOption('pile1');
    g.act(0).declineCommandZone();
    g.expect.zone('Serra Angel', 'hand', { seat: 0 });
  });

  test('in the graveyard pile it goes there, and its owner may then return it to the command zone (CR 903.9a)', () => {
    const g = cast(game(READING, { commander: 2 }), READING);
    g.act(1).chooseCards('c');
    g.act(0).chooseOption('pile2');
    g.expect.pending('commanderZone', 0);
    expect(g.state.pending).toMatchObject({ kind: 'commanderZone', from: 'graveyard' });
    g.act(0).sendToCommandZone();
    g.expect.zone('Serra Angel', 'command', { seat: 0 });
    g.expect.zone('Grizzly Bears', 'hand', { seat: 0 });
  });
});

describe('with more than two players the first opponent in turn order still in the game separates', () => {
  /** The spell is cast in the two-seat scenario; a third seat is added to the state before it resolves (the scenario builder has exactly two). */
  function threeSeats(seat1Lost: boolean): ScenarioGame {
    const two = game(READING);
    two.act(0).cast(READING, { pay: true });
    const seat0 = two.state.seats[0];
    const seat1 = two.state.seats[1];
    if (seat0 === undefined || seat1 === undefined) throw new Error('no seats');
    const state = {
      ...two.state,
      seats: [
        seat0,
        { ...seat1, hasLost: seat1Lost },
        { ...seat1, id: 2, library: [], hand: [], graveyard: [], command: [], commanders: [] },
      ],
    };
    return createDriver(state, { checkInvariants: false, labels: new Map() });
  }

  test.each([
    [false, 1],
    [true, 2],
  ])('seat 1 has lost: %s, so seat %i separates', (seat1Lost, separator) => {
    const g = threeSeats(seat1Lost);
    // Everybody passes priority and the spell resolves.
    for (let i = 0; i < 6 && g.state.pending?.kind !== 'chooseCards'; i++) {
      const holder = g.state.turn.prioritySeat;
      if (holder === null) break;
      g.act(holder).pass();
    }
    const d = chooseCardsDecision(g);
    expect(d.purpose).toBe('separate');
    expect(d.seat).toBe(separator);
    expect(d.legal).toHaveLength(5);
  });
});

describe('replay and determinism', () => {
  const play = () => {
    const g = cast(game(READING), READING);
    g.act(1).chooseCards('a', 'd');
    g.act(0).chooseOption('pile2');
    return g;
  };

  test('the same answers give the same state, and the cards move in library order: the chosen pile first, then the other, each from the top down (D-971)', () => {
    const one = play();
    const two = play();
    expect(stateHash(one.state)).toBe(stateHash(two.state));
    const seat = one.view(0).seats[0];
    // The hand is in library order (Giant Spider, Serra Angel, Sol Ring: pile 2); the graveyard lists the bottom first, so the card that was higher in the library is deeper, and the
    // spell, which was put there last, is on top.
    expect(seat?.hand?.map((o) => o.name)).toEqual(['Giant Spider', 'Serra Angel', 'Sol Ring']);
    expect(seat?.graveyard.map((o) => o.name)).toEqual([
      'Grizzly Bears',
      'Lightning Bolt',
      READING,
    ]);
  });

  test('the zone changes happen in that order: the chosen pile first, then the other, each from the top of the library down', () => {
    const g = play();
    const moved = g.eventsSince(0).flatMap((e) =>
      e.kind === 'zoneChanged' && e.fromZone === 'library' ? [e.to] : [],
    );
    // Pile 2 (b, c, e) was chosen; pile 1 (a, d) is the other.
    expect(moved).toEqual(['b', 'c', 'e', 'a', 'd'].map((label) => g.id(label)));
  });

  test('every state of the sequence satisfies the invariants', () => {
    const g = cast(game(READING), READING);
    g.expect.invariants();
    g.act(1).chooseCards('a', 'd');
    g.expect.invariants();
    g.act(0).chooseOption('pile1');
    g.expect.invariants();
  });
});

describe('the legal actions', () => {
  test('the separator may choose any subset of the five cards; the chooser has exactly the two piles', () => {
    const g = cast(game(READING), READING);
    const subsets = getLegalActions(g.state, 1).filter((a) => a.kind === 'chooseCards');
    expect(subsets).toHaveLength(32);
    g.act(1).chooseCards('a');
    const options = getLegalActions(g.state, 0).filter((a) => a.kind === 'chooseOption');
    expect(options.map((a) => (a.kind === 'chooseOption' ? a.option : ''))).toEqual([
      'pile1',
      'pile2',
    ]);
  });
});
