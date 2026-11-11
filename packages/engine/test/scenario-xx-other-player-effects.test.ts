// Effects that another player performs (D-092 primitive 2): "Its controller may search their
// library for a basic land card, put that card onto the battlefield tapped, then shuffle", "Its
// controller creates a 3/3 green Beast creature token", "Its owner shuffles".
// Pins: CR 701.23a (Search): the searching player looks at their own library and finds the card,
// so every question (whether to search, which card) goes to that player and the hidden cards are
// shown to them alone (CR 401.2); CR 608.2d: a player offered an option as the effect resolves
// chooses whether to do it, and declining a "may search ... then shuffle" does none of it, not even
// the shuffle; CR 701.23b: with a stated quality the player may find fewer, or none; CR 701.24
// (Shuffle): the library of the player who searched is shuffled, with the seeded generator of the
// game; CR 110.2a: a card the searching player puts onto the battlefield enters under their
// control; CR 111.2: the player who creates a token owns it and it enters under their control;
// CR 608.2h and 113.7a: the controller of a target that already left is read from last-known
// information; CR 608.2b: a spell whose only target is illegal does nothing.
// Cards: SYNTHETIC Banish Seek Land, Wild Transform, Optional Land Fetch, Seek And Shuffle
// (src/cards/fixtures/synthetic-references.ts), the real Grizzly Bears, Forest, Island, Plains,
// Mountain and Lightning Bolt, and SYNTHETIC Tapped Land (a nonbasic land).
import { describe, expect, test } from 'vitest';
import { getView } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';

const BANISH = 'SYNTHETIC Banish Seek Land';
const TRANSFORM = 'SYNTHETIC Wild Transform';
const OPTIONAL = 'SYNTHETIC Optional Land Fetch';
const SEEK_SHUFFLE = 'SYNTHETIC Seek And Shuffle';
const BEARS = 'Grizzly Bears';
const NONBASIC = 'SYNTHETIC Tapped Land';

/** Seat 0 holds the Banish spell; seat 1 has the bear and a library with lands in it. */
function build(options: { opponentLibrary?: readonly string[] } = {}) {
  const b = scenario()
    .seed(3)
    .seat(0)
    .hand(BANISH)
    .battlefield('Plains')
    .library('Forest', { label: 'myForest' })
    .library('Mountain', { label: 'myMountain' })
    .seat(1)
    .battlefield(BEARS, { label: 'bear' });
  const cards = options.opponentLibrary ?? ['Swamp', 'Forest', BEARS, NONBASIC, 'Island'];
  for (const [i, name] of cards.entries()) b.library(name, { label: `lib${i}` });
  return b.build();
}

function castBanish(g: ScenarioGame) {
  g.act(0).cast(BANISH, { targets: ['bear'], pay: true });
  g.passAll();
  return g;
}

describe('"Its controller may search": the question and the choice go to that player', () => {
  test('the opponent is asked, not the caster, once the creature is exiled', () => {
    const g = castBanish(build());
    expect(g.object('bear').zone).toBe('exile');
    g.expect.pending('confirmOptional', 1);
    const d = g.state.pending;
    if (d?.kind !== 'confirmOptional') throw new Error('expected confirmOptional');
    expect(d.purpose).toBe('search');
    expect(d.seat).toBe(1);
    expect(d.sourceName).toBe(BANISH);
    // The caster cannot answer for them.
    expect(g.act(0).try.action({ kind: 'acceptOptional' }).ok).toBe(false);
  });

  test('accepting: the opponent chooses from their own library, the basic lands only', () => {
    const g = castBanish(build());
    g.act(1).accept();
    g.expect.pending('chooseCards', 1);
    const d = g.state.pending;
    if (d?.kind !== 'chooseCards') throw new Error('expected chooseCards');
    expect(d.purpose).toBe('search');
    expect(d.seat).toBe(1);
    // Sorted by name (Forest, Island, Swamp), then id: it does not give away the order of the
    // library (CR 401.2). The nonbasic land and the creature do not match; neither does anything in
    // seat 0's library.
    expect(d.legal).toEqual([g.id('lib1'), g.id('lib4'), g.id('lib0')]);
    expect(d.legal).not.toContain(g.id('myForest'));
    expect(d.min).toBe(0);
    expect(d.max).toBe(1);
  });

  test('the land goes onto the battlefield tapped under the opponent’s control, then they shuffle', () => {
    const g = castBanish(build());
    const mark = g.mark();
    g.act(1).accept();
    g.act(1).chooseCards('lib1');
    const land = g.object('lib1');
    expect(land.zone).toBe('battlefield');
    expect(land.controller).toBe(1);
    expect(land.owner).toBe(1);
    expect(land.tapped).toBe(true);
    g.expect.librarySize(1, 4);
    g.expect.librarySize(0, 2);
    g.expect.eventLog(
      [
        { kind: 'optionalAnswered', seat: 1, accepted: true },
        { kind: 'librarySearched', seat: 1, found: 1 },
        { kind: 'zoneChanged' },
        { kind: 'libraryShuffled', seat: 1 },
      ],
      { since: mark },
    );
    g.expect.noEvent({ kind: 'libraryShuffled', seat: 0 }, { since: mark });
    g.expect.pending('priority', 0);
    g.expect.stack([]);
    g.expect.zone(BANISH, 'graveyard', { seat: 0 });
    g.expect.invariants();
  });

  test('the opponent may find nothing, and still shuffles (CR 701.23b)', () => {
    const g = castBanish(build());
    const mark = g.mark();
    g.act(1).accept();
    g.act(1).chooseCards();
    g.expect.librarySize(1, 5);
    g.expect.eventLog(
      [
        { kind: 'librarySearched', seat: 1, found: 0 },
        { kind: 'libraryShuffled', seat: 1 },
      ],
      { since: mark },
    );
  });

  test('declining does nothing at all: no search, no shuffle, the library keeps its order', () => {
    const g = castBanish(build());
    const before = g.state.seats[1]?.library;
    const mark = g.mark();
    g.act(1).decline();
    g.expect.eventLog([{ kind: 'optionalAnswered', seat: 1, accepted: false }], { since: mark });
    g.expect.noEvent({ kind: 'librarySearched' }, { since: mark });
    g.expect.noEvent({ kind: 'libraryShuffled' }, { since: mark });
    expect(g.state.seats[1]?.library).toEqual(before);
    g.expect.pending('priority', 0);
    g.expect.stack([]);
    expect(g.object('bear').zone).toBe('exile');
    g.expect.zone(BANISH, 'graveyard', { seat: 0 });
  });

  test('with no basic land in the library there is nothing to find, but the search still happens', () => {
    const g = castBanish(build({ opponentLibrary: [BEARS, NONBASIC] }));
    const mark = g.mark();
    g.act(1).accept();
    // CR 701.23b: no decision is asked when nothing can be found; the library is shuffled.
    g.expect.pending('priority', 0);
    g.expect.eventLog(
      [
        { kind: 'librarySearched', seat: 1, found: 0 },
        { kind: 'libraryShuffled', seat: 1 },
      ],
      { since: mark },
    );
    g.expect.librarySize(1, 2);
  });

  test('an empty library: the question is asked, the search finds nothing', () => {
    const g = castBanish(build({ opponentLibrary: [] }));
    g.expect.pending('confirmOptional', 1);
    g.act(1).accept();
    g.expect.pending('priority', 0);
    g.expect.librarySize(1, 0);
  });

  test('the same seed gives the same shuffle (the state’s generator is used)', () => {
    const run = () => {
      const g = castBanish(build());
      g.act(1).accept();
      g.act(1).chooseCards('lib1');
      return g.hash();
    };
    expect(run()).toBe(run());
  });
});

describe('hidden information while another player searches (CR 401.2, 701.23a)', () => {
  test('the caster sees that the opponent is searching, never the cards they look at', () => {
    const g = castBanish(build());
    g.act(1).accept();
    const asked = getView(g.state, 1);
    expect(asked.pending?.kind).toBe('chooseCards');
    expect(asked.pendingCards?.map((c) => c.name).sort()).toEqual(['Forest', 'Island', 'Swamp']);
    const watching = getView(g.state, 0);
    expect(watching.pending).toBeNull();
    expect(watching.pendingCards).toBeUndefined();
    expect(watching.decidingSeat).toBe(1);
    expect(watching.waitingOn).toEqual({ seat: 1, purpose: 'search', sourceName: BANISH });
    // Neither view names a library card anywhere.
    expect(JSON.stringify(watching)).not.toContain('Swamp');
    expect(watching.seats[1]?.libraryCount).toBe(5);
  });

  test('the opponent’s own question about searching shows them nothing of the caster’s library', () => {
    const g = castBanish(build());
    const asked = getView(g.state, 1);
    expect(asked.pending?.kind).toBe('confirmOptional');
    expect(JSON.stringify(asked)).not.toContain('Mountain');
    expect(asked.seats[0]?.libraryCount).toBe(2);
  });
});

describe('"You may search": the controller answers their own question', () => {
  test('accepting finds a land; declining does nothing', () => {
    const make = () =>
      scenario()
        .seat(0)
        .hand(OPTIONAL)
        .battlefield('Forest', 'Forest')
        .library('Plains', { label: 'p' })
        .library(BEARS)
        .seat(1)
        .build();
    const yes = make();
    yes.act(0).cast(OPTIONAL, { pay: true });
    yes.passAll();
    yes.expect.pending('confirmOptional', 0);
    yes.act(0).accept();
    yes.act(0).chooseCards('p');
    yes.expect.tapped('p', true);
    expect(yes.object('p').controller).toBe(0);
    const no = make();
    no.act(0).cast(OPTIONAL, { pay: true });
    no.passAll();
    const mark = no.mark();
    no.act(0).decline();
    no.expect.noEvent({ kind: 'libraryShuffled' }, { since: mark });
    expect(no.object('p').zone).toBe('library');
    no.expect.pending('priority', 0);
  });
});

describe('"Its controller creates a 3/3 Beast": the token goes to the target’s controller', () => {
  const build2 = (options: { stolen?: boolean } = {}) =>
    scenario()
      .seat(0)
      .hand(TRANSFORM)
      .battlefield('Forest', 'Forest', 'Forest')
      .seat(1)
      .battlefield(BEARS, options.stolen ? { controller: 0 } : {})
      .build();
  const beasts = (g: ScenarioGame) => g.find({ name: 'Beast', zone: 'battlefield' });

  test('the target was destroyed first: last-known information gives its controller (CR 608.2h)', () => {
    const g = build2();
    g.act(0).cast(TRANSFORM, { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    const found = beasts(g);
    expect(found).toHaveLength(1);
    const beast = found[0];
    expect(beast?.controller).toBe(1);
    expect(beast?.owner).toBe(1);
    g.expect.pt('Beast', 3, 3);
    g.expect.invariants();
  });

  test('the controller is who controlled the target, not its owner', () => {
    const g = build2({ stolen: true });
    g.act(0).cast(TRANSFORM, { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    const beast = beasts(g)[0];
    expect(beast?.controller).toBe(0);
    expect(beast?.owner).toBe(0);
  });

  test('a target that is gone when the spell resolves: no token (CR 608.2b)', () => {
    const g = scenario()
      .seat(0)
      .hand(TRANSFORM)
      .battlefield('Forest', 'Forest', 'Forest')
      .seat(1)
      .hand('Lightning Bolt')
      .battlefield(BEARS, 'Mountain')
      .build();
    g.act(0).cast(TRANSFORM, { targets: [BEARS], pay: true });
    g.act(0).pass();
    g.act(1).cast('Lightning Bolt', { targets: [BEARS], pay: true });
    g.passAll();
    expect(beasts(g)).toHaveLength(0);
    g.expect.zone(TRANSFORM, 'graveyard', { seat: 0 });
  });
});

describe('"Its owner shuffles": the shuffle names a player', () => {
  test('only that player’s library is shuffled; the creature is in its owner’s hand', () => {
    const g = scenario()
      .seed(9)
      .seat(0)
      .hand(SEEK_SHUFFLE)
      .battlefield('Island', 'Island')
      .library('Forest', 'Mountain', 'Plains')
      .seat(1)
      .battlefield(BEARS)
      .library('Swamp', 'Island', 'Forest', 'Plains')
      .build();
    const mark = g.mark();
    g.act(0).cast(SEEK_SHUFFLE, { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'hand', { seat: 1 });
    g.expect.librarySize(1, 4);
    g.expect.librarySize(0, 3);
    g.expect.eventLog([{ kind: 'libraryShuffled', seat: 1 }], { since: mark });
    g.expect.noEvent({ kind: 'libraryShuffled', seat: 0 }, { since: mark });
  });
});
