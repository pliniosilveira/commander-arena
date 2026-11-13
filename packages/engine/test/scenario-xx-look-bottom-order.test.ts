// "Look at the top five cards of your library. Put two of them into your hand and the rest on the bottom of your library in any order." (D-324)
// Pins: CR 401.4 (the owner of cards put into a library at the same time chooses their order, and does not reveal it), CR 401.2 and 701.22a (the cards looked at stay the
// objects they are: nothing changes zone on the bottom), CR 701.20a (no "reveal" is said, so the cards put into the hand are not shown), CR 401.2 (nobody may know
// the order of a library: the other players know only counts). The `lookAtTop` effect with `take.hidden` and `rest: 'bottomChosen'`, answered with an `arrangeCards` decision of purpose `bottom`.
// All cards are SYNTHETIC (src/cards/fixtures/synthetic-library.ts) or basic lands.
import { describe, expect, test } from 'vitest';
import { type Action, applyAction, type GameEvent, getView, type ObjectId } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';
import { chooseCardsDecision } from './pending-helpers';
import {
  arrangeDecision,
  graveyardNames,
  handNames,
  kinds,
  LIBRARY,
  libraryNames,
} from './scry-helpers';

const STOCK = 'SYNTHETIC Stock Up Like';
const THREE = 'SYNTHETIC Stock Up Three';

/** Seat 0 holds `spell` and {2}{U}; its library is `names` (labelled a, b, c, ...), then seat 1's library. */
function game(spell = STOCK, names: readonly string[] = LIBRARY.slice(0, 5).map(([n]) => n)) {
  let b = scenario().seat(0).hand(spell).pool('UCC');
  names.forEach((name, i) => {
    b = b.library(name, { label: String.fromCharCode(97 + i) });
  });
  return b.seat(1).library('Llanowar Elves').build();
}

/** Cast the spell and let it resolve (both players pass once, CR 117.4): the first question is pending. */
function cast(g: ScenarioGame, spell = STOCK): ScenarioGame {
  g.act(0).cast(spell, { pay: true });
  g.pass();
  return g.pass();
}

describe('the take: two of the five go to the hand, unrevealed', () => {
  test('asks for exactly two of the five cards, and shows nobody the choice', () => {
    const g = cast(game());
    const d = chooseCardsDecision(g);
    expect(d.purpose).toBe('lookTake');
    expect(d.min).toBe(2);
    expect(d.max).toBe(2);
    expect(d.reveal).toBe(false);
    expect(d.legal).toEqual(['a', 'b', 'c', 'd', 'e'].map((l) => g.id(l)));
    expect(d.prompt).toContain('Put 2 of them into your hand');
    expect(d.prompt).toContain('in an order you choose');
  });

  test('the two cards chosen are in the hand and no card was revealed', () => {
    const g = cast(game());
    const mark = g.mark();
    g.act(0).chooseCards('b', 'd');
    expect(handNames(g)).toEqual(['Forest', 'Swamp']);
    const events = g.eventsSince(mark);
    expect(kinds(events)).not.toContain('cardsRevealed');
    expect(events).toContainEqual({ kind: 'topCardsLooked', seat: 0, count: 5 });
    g.expect.invariants();
  });

  test('the answer must be exactly two cards of those looked at', () => {
    const g = cast(game());
    const before = g.hash();
    for (const objects of [
      [g.id('a')],
      [],
      [g.id('a'), g.id('b'), g.id('c')],
      [g.id('a'), g.id('a')],
    ]) {
      const r = applyAction(g.state, 0, { kind: 'chooseCards', objects });
      expect(r.ok, JSON.stringify(objects)).toBe(false);
    }
    expect(g.hash()).toBe(before);
  });
});

describe('the rest: the owner chooses the order on the bottom (CR 401.4)', () => {
  const afterTake = () => {
    const g = cast(game());
    g.act(0).chooseCards('a', 'e');
    return g;
  };

  test('asks to arrange the three cards left, with only the bottom pile', () => {
    const g = afterTake();
    g.expect.pending('arrangeCards', 0);
    const d = arrangeDecision(g);
    expect(d.purpose).toBe('bottom');
    expect(d.piles).toEqual(['bottom']);
    expect(d.cards).toEqual(['b', 'c', 'd'].map((l) => g.id(l)));
  });

  test('the cards go to the bottom in the order given: the last is the bottom card; no zone change', () => {
    const g = afterTake();
    const library = g.state.seats[0]?.library.length;
    expect(library).toBe(3);
    const mark = g.mark();
    g.act(0).arrange({ top: [], other: ['d', 'b', 'c'] });
    expect(g.state.seats[0]?.library).toEqual(['d', 'b', 'c'].map((l) => g.id(l)));
    const events = g.eventsSince(mark);
    expect(events).toContainEqual({ kind: 'cardsBottomed', seat: 0, count: 3, ordered: true });
    // The cards stay what they were: nothing left the library, so there is no zone change and no new object (CR 400.7 does not apply).
    expect(events.filter((e) => e.kind === 'zoneChanged' && e.fromZone === 'library')).toEqual([]);
    expect(graveyardNames(g)).toEqual(['SYNTHETIC Stock Up Like']);
    g.expect.pending('priority', 0);
    g.expect.invariants();
  });

  test('with more cards in the library the cards go below all of them', () => {
    const g = cast(
      game(STOCK, ['Island', 'Forest', 'Plains', 'Swamp', 'Mountain', 'Grizzly Bears', 'Forest']),
    );
    g.act(0).chooseCards('a', 'b');
    g.act(0).arrange({ top: [], other: ['e', 'c', 'd'] });
    expect(libraryNames(g)).toEqual(['Grizzly Bears', 'Forest', 'Mountain', 'Plains', 'Swamp']);
    g.expect.invariants();
  });

  test('lists every order and accepts each', () => {
    const g = afterTake();
    const listed = g.legalActions(0).filter((a) => a.kind === 'arrangeCards');
    const [b, c, d] = ['b', 'c', 'd'].map((l) => g.id(l)) as [ObjectId, ObjectId, ObjectId];
    expect(listed).toHaveLength(6);
    expect(listed[0]).toEqual({ kind: 'arrangeCards', top: [], other: [b, c, d] });
    for (const action of listed) {
      expect(applyAction(g.state, 0, action).ok, JSON.stringify(action)).toBe(true);
    }
  });

  test('a card in the top pile, a missing card or a card that was taken is refused', () => {
    const g = afterTake();
    const [a, b, c, d] = ['a', 'b', 'c', 'd'].map((l) => g.id(l)) as [
      ObjectId,
      ObjectId,
      ObjectId,
      ObjectId,
    ];
    const refused = (action: Action) => {
      const before = g.hash();
      expect(applyAction(g.state, 0, action).ok, JSON.stringify(action)).toBe(false);
      expect(g.hash()).toBe(before);
      g.expect.pending('arrangeCards', 0);
    };
    refused({ kind: 'arrangeCards', top: [b, c, d], other: [] });
    refused({ kind: 'arrangeCards', top: [b], other: [c, d] });
    refused({ kind: 'arrangeCards', top: [], other: [b, c] });
    refused({ kind: 'arrangeCards', top: [], other: [b, c, c] });
    refused({ kind: 'arrangeCards', top: [], other: [a, b, c, d] });
    refused({ kind: 'chooseCards', objects: [b, c, d] });
    expect(applyAction(g.state, 1, { kind: 'arrangeCards', top: [], other: [b, c, d] }).ok).toBe(
      false,
    );
    g.act(0).arrange({ top: [], other: [c, d, b] });
    g.expect.pending('priority', 0);
  });
});

describe('fewer cards to arrange', () => {
  test('one card left goes to the bottom without a question', () => {
    const g = cast(game(THREE, ['Island', 'Forest', 'Plains', 'Swamp']), THREE);
    g.act(0).chooseCards('a', 'c');
    g.expect.pending('priority', 0);
    expect(libraryNames(g)).toEqual(['Swamp', 'Forest']);
    // The one card looked at and not taken is below the card that was never looked at.
    expect(g.state.seats[0]?.library).toEqual([g.id('d'), g.id('b')]);
  });

  test('a library of two: both are taken without a question, and nothing is left to arrange', () => {
    const g = cast(game(STOCK, ['Island', 'Forest']));
    g.expect.pending('priority', 0);
    expect(handNames(g)).toEqual(['Island', 'Forest']);
    expect(libraryNames(g)).toEqual([]);
  });

  test('a library of one: that card is taken', () => {
    const g = cast(game(STOCK, ['Island']));
    g.expect.pending('priority', 0);
    expect(handNames(g)).toEqual(['Island']);
  });

  test('an empty library: nothing happens', () => {
    const g = cast(game(STOCK, []));
    g.expect.pending('priority', 0);
    expect(handNames(g)).toEqual([]);
    g.expect.zone(STOCK, 'graveyard', { seat: 0 });
  });
});

describe('hidden information (CR 401.2, 401.4, 701.20a)', () => {
  const NAMES = ['Island', 'Forest', 'Plains', 'Swamp', 'Mountain'];

  test('the other seat sees only that a look at the top cards is going on, then only a count', () => {
    const g = cast(game());
    expect(g.view(1).waitingOn).toEqual({ seat: 0, purpose: 'lookTake', sourceName: STOCK });
    expect(g.view(1).pendingCards).toBeUndefined();
    g.act(0).chooseCards('a', 'e');
    expect(g.view(1).waitingOn).toEqual({ seat: 0, purpose: 'bottom', sourceName: STOCK });
    expect(g.view(1).pendingCards).toBeUndefined();
    expect(g.view(1).pending).toBeNull();
    // The player who arranges sees the three cards, top first, and only that player.
    expect(g.view(0).pendingCards?.map((c) => c.name)).toEqual(['Forest', 'Plains', 'Swamp']);
    expect(g.view(0).waitingOn).toBeUndefined();
    expect(g.legalActions(1)).toEqual([]);
    g.act(0).arrange({ top: [], other: ['c', 'b', 'd'] });
    const text = JSON.stringify(getView(g.state, 1));
    for (const name of NAMES) expect(text, name).not.toContain(name);
    expect(g.view(1).seats[0]?.handCount).toBe(2);
    expect(g.view(1).seats[0]?.libraryCount).toBe(3);
  });

  /** What seat 1 is shown, and every event, at each step, with `names` for the five cards of seat 0's library. */
  function flow(names: readonly string[]) {
    const g = game(STOCK, names);
    const out: { step: string; view: string; events: string }[] = [];
    let mark = g.mark();
    const see = (step: string) => {
      out.push({
        step,
        view: JSON.stringify(g.view(1)),
        events: JSON.stringify(g.eventsSince(mark)),
      });
      mark = g.mark();
    };
    see('start');
    g.act(0).cast(STOCK, { pay: true });
    see('cast');
    g.pass();
    g.pass();
    see('resolving: the two cards are chosen next');
    g.act(0).chooseCards('b', 'd');
    see('two cards taken');
    g.act(0).arrange({ top: [], other: ['e', 'a', 'c'] });
    see('the rest put on the bottom');
    return { g, out };
  }

  test('two worlds, only the five cards differ: the other seat sees the same view and the same events at every step', () => {
    const a = flow(NAMES);
    const b = flow(['Mountain', 'Swamp', 'Plains', 'Forest', 'Island']);
    expect(a.out).toHaveLength(5);
    for (const [i, step] of a.out.entries()) {
      expect(JSON.parse(b.out[i]?.view ?? 'null'), step.step).toEqual(JSON.parse(step.view));
    }
    // The events carry card ids and counts, never a name (the ids are positions in the game, the same in both worlds).
    const allA = a.out.map((s) => s.events).join('\n');
    for (const name of NAMES) expect(allA, name).not.toContain(name);
    expect(allA).not.toContain('cardsRevealed');
    const events: GameEvent[] = a.out.flatMap((s) => JSON.parse(s.events) as GameEvent[]);
    expect(events.filter((e) => e.kind === 'cardsBottomed')).toEqual([
      { kind: 'cardsBottomed', seat: 0, count: 3, ordered: true },
    ]);
  });
});
