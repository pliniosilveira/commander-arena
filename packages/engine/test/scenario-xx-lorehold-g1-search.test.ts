// Group 1 of the Lorehold Spirit deck (issue 86): "When this creature enters, if an opponent controls more lands than you, you may search your library for a Plains card and put it
// onto the battlefield tapped. Then if an opponent controls more lands than you, repeat this process once. If you search your library this way, shuffle." (an intervening "if" about the
// lands of the players, a `search` that does not shuffle, a `conditional` that does it again, and a `shuffle` after `thisWayAtLeast` `searched`).
// Pins: CR 603.4 (an intervening "if" is true as the ability triggers and as it resolves), CR 608.2c (the instruction after "then" is read as it comes up: the lands are counted again),
// CR 608.2d and 701.23b-d (the "may" search is the player's choice and may find fewer cards), CR 701.23a (declining to search is not searching), CR 701.24a (shuffle), CR 110.2a (the Plains
// enter under the controller of the ability, tapped, CR 614.1c).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-lorehold-g1.ts); the real card is played in packages/cards/test/convert-grammar-engine-lorehold-g1.test.ts.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const CLAIMER = 'SYNTHETIC Land Claimer'; // {2}{W} 3/3 vigilance
const LIBRARY = ['Plains', 'Plains', 'Plains', 'Island', 'Forest'];

describe('the card is valid', () => {
  test(CLAIMER, () => {
    expect(validateCard(syntheticCard(CLAIMER))).toEqual([]);
  });
});

/** Seat 0 has `mine` Plains on the battlefield (three of them pay for the Claimer), the opponent `theirs` Swamps. */
const board = (mine: number, theirs: number, library: readonly string[] = LIBRARY) =>
  scenario()
    .define(syntheticCard(CLAIMER))
    .seat(0)
    .hand(CLAIMER)
    .library(...library)
    .battlefield(...Array.from({ length: mine }, () => 'Plains'))
    .seat(1)
    .library(...LIBRARY)
    .battlefield(...Array.from({ length: theirs }, () => 'Swamp'))
    .at('precombatMain', { active: 0 })
    .build();

type Game = ReturnType<typeof board>;

const plainsOf = (g: Game, seat: 0 | 1) => g.find({ name: 'Plains', zone: 'battlefield', seat });

/** Casts the Claimer; the ability goes on the stack (when it triggers) and resolves to its first question. */
function resolveClaimer(g: Game) {
  g.act(0).cast(CLAIMER, { pay: true });
  g.passAll();
}

describe('the intervening "if": an opponent controls more lands than you (CR 603.4)', () => {
  test('as many lands: the ability does not trigger', () => {
    const g = board(3, 3);
    resolveClaimer(g);
    g.expect.pending('priority', 0);
    g.expect.noEvent({ kind: 'librarySearched' }, { since: 0 });
  });

  test('fewer lands than you: the ability does not trigger', () => {
    const g = board(3, 1);
    resolveClaimer(g);
    g.expect.pending('priority', 0);
  });

  test('one land more: the ability triggers', () => {
    const g = board(3, 4);
    resolveClaimer(g);
    g.expect.pending('confirmOptional', 0);
  });
});

describe('you may search for a Plains card and put it onto the battlefield tapped (CR 701.23, 614.1c)', () => {
  test('accepting finds a Plains, which enters tapped; the library is shuffled once', () => {
    const g = board(3, 4);
    resolveClaimer(g);
    g.act(0).accept();
    g.expect.pending('chooseCards', 0);
    g.act(0).chooseCards('Plains[0]');
    expect(plainsOf(g, 0)).toHaveLength(4);
    const fresh = plainsOf(g, 0).filter((p) => p.tapped && p.id !== undefined);
    // Three Plains were tapped for the Claimer; the fourth came in tapped as well.
    expect(fresh).toHaveLength(4);
    g.expect.eventLog(
      [
        { kind: 'librarySearched', seat: 0, found: 1 },
        { kind: 'libraryShuffled', seat: 0 },
      ],
      {
        since: 0,
      },
    );
    g.expect.librarySize(0, LIBRARY.length - 1);
    g.expect.invariants();
  });

  test('declining is not searching: nothing is found and nothing is shuffled', () => {
    const g = board(3, 4);
    resolveClaimer(g);
    g.act(0).decline();
    // Still more lands: the process is repeated, and the player is asked again.
    g.expect.pending('confirmOptional', 0);
    g.act(0).decline();
    g.expect.noEvent({ kind: 'librarySearched' }, { since: 0 });
    g.expect.noEvent({ kind: 'libraryShuffled' }, { since: 0 });
    expect(plainsOf(g, 0)).toHaveLength(3);
    g.expect.pending('priority', 0);
  });

  test('the Plains found are the only choices: a card that is not a Plains cannot be taken', () => {
    const g = board(3, 4);
    resolveClaimer(g);
    g.act(0).accept();
    g.expect.pending('chooseCards', 0);
    const choices = (g.view(0).pending as { legal?: readonly string[] } | null)?.legal ?? [];
    expect(choices).toHaveLength(3);
    const island = g.id({ name: 'Island', seat: 0, zone: 'library' });
    expect(g.act(0).try.action({ kind: 'chooseCards', objects: [island] }).ok).toBe(false);
  });
});

describe('"Then if an opponent controls more lands than you, repeat this process once."', () => {
  test('still more lands after the first Plains: it is repeated, once, and the library is shuffled once', () => {
    const g = board(3, 6);
    resolveClaimer(g);
    g.act(0).accept();
    g.act(0).chooseCards('Plains[0]');
    // 4 lands against 6: the process is repeated.
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    g.act(0).chooseCards('Plains[0]');
    // 5 lands against 6: still more, but the process is repeated only once.
    expect(plainsOf(g, 0)).toHaveLength(5);
    g.expect.pending('priority', 0);
    const events = g.eventsSince(0);
    expect(events.filter((e) => e.kind === 'librarySearched')).toHaveLength(2);
    expect(events.filter((e) => e.kind === 'libraryShuffled' && e.seat === 0)).toHaveLength(1);
    g.expect.invariants();
  });

  test('the lands are counted again: when the first Plains makes the numbers equal there is no repeat', () => {
    const g = board(3, 4);
    resolveClaimer(g);
    g.act(0).accept();
    g.act(0).chooseCards('Plains[0]');
    g.expect.pending('priority', 0);
    expect(plainsOf(g, 0)).toHaveLength(4);
    expect(g.eventsSince(0).filter((e) => e.kind === 'librarySearched')).toHaveLength(1);
  });

  test('declining the first search and accepting the repeat: the shuffle is for the one search', () => {
    const g = board(3, 5);
    resolveClaimer(g);
    g.act(0).decline();
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    g.act(0).chooseCards('Plains[0]');
    expect(plainsOf(g, 0)).toHaveLength(4);
    const events = g.eventsSince(0);
    expect(events.filter((e) => e.kind === 'librarySearched')).toHaveLength(1);
    expect(events.filter((e) => e.kind === 'libraryShuffled' && e.seat === 0)).toHaveLength(1);
  });

  test('accepting the first search and declining the repeat: shuffled once, after the first', () => {
    const g = board(3, 6);
    resolveClaimer(g);
    g.act(0).accept();
    g.act(0).chooseCards('Plains[0]');
    g.act(0).decline();
    expect(plainsOf(g, 0)).toHaveLength(4);
    expect(
      g.eventsSince(0).filter((e) => e.kind === 'libraryShuffled' && e.seat === 0),
    ).toHaveLength(1);
  });
});

describe('"If you search your library this way, shuffle." (CR 701.23a, 701.24a)', () => {
  test('a library with no Plains: the player still searched, so the library is shuffled', () => {
    const g = board(3, 4, ['Island', 'Forest', 'Swamp']);
    resolveClaimer(g);
    g.act(0).accept();
    // Nothing found, nothing put onto the battlefield: the opponent still has more lands, so the process is repeated.
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    g.expect.pending('priority', 0);
    const events = g.eventsSince(0);
    expect(events.filter((e) => e.kind === 'librarySearched' && e.found === 0)).toHaveLength(2);
    expect(events.filter((e) => e.kind === 'libraryShuffled' && e.seat === 0)).toHaveLength(1);
    expect(plainsOf(g, 0)).toHaveLength(3);
  });

  test("the other player's library is not shuffled", () => {
    const g = board(3, 4);
    resolveClaimer(g);
    g.act(0).accept();
    g.act(0).chooseCards('Plains[0]');
    g.expect.noEvent({ kind: 'libraryShuffled', seat: 1 }, { since: 0 });
  });
});
