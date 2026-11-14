// Library search (CR 701.23), shuffle (CR 701.24), reveal (CR 701.20) and the chooseCards decision.
// Pins: CR 701.23a (the searcher sees every matching card), CR 701.23b (a stated quality: finding
// fewer, or none, is allowed), CR 701.23e (found cards are revealed only if the effect says so),
// CR 701.24b (the found cards leave the library before it is shuffled), CR 401.2 (the library's
// order is hidden), CR 614.12 and 603.6a (cards put onto the battlefield enter with their
// replacements and trigger abilities), CR 608.2d (the player chooses while the effect resolves).
// All cards are SYNTHETIC (see src/cards/fixtures/synthetic-search.ts) or basic lands.
import { describe, expect, test } from 'vitest';
import type { GameEvent } from '../src/index';
import { getView } from '../src/index';
import type { ScenarioGame } from '../src/testing/index';
import { scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';
import { chooseCardsDecision } from './pending-helpers';

/** Both players pass once: the top object of the stack resolves (CR 117.4). */
function resolveTop(g: ScenarioGame): ScenarioGame {
  g.pass();
  return g.pass();
}

const FETCH_ANY_LAND = singleFaceCard({
  name: 'SYNTHETIC Test Fetch Any Land',
  manaCost: ['G'],
  types: ['sorcery'],
  colors: ['G'],
  colorIdentity: ['G'],
  oracleText: 'Search your library for a land card, put it onto the battlefield, then shuffle.',
  spell: {
    effect: {
      kind: 'search',
      player: { kind: 'you' },
      filter: { types: ['land'] },
      max: 1,
      destinations: [{ zone: 'battlefield', count: 1 }],
      reveal: false,
      shuffle: true,
    },
  },
});

function kinds(events: readonly GameEvent[]): string[] {
  return events.map((e) => e.kind);
}

function landFetchGame() {
  return scenario()
    .seat(0)
    .hand('SYNTHETIC Land Fetch')
    .pool('GC')
    .library('Island', { label: 'island' })
    .library('Forest', { label: 'forest1' })
    .library('Plains', { label: 'plains' })
    .library('Grizzly Bears', { label: 'bears' })
    .library('Forest', { label: 'forest2' })
    .seat(1)
    .library('Swamp', { label: 'theirs' })
    .build();
}

describe('a search for one basic land onto the battlefield tapped', () => {
  test('asks the searcher, offering every matching card sorted by name (CR 701.23a)', () => {
    const g = landFetchGame();
    g.act(0).cast('SYNTHETIC Land Fetch', { pay: true });
    resolveTop(g);
    g.expect.pending('chooseCards', 0);
    const d = chooseCardsDecision(g);
    expect(d.purpose).toBe('search');
    expect(d.zone).toBe('library');
    expect(d.min).toBe(0);
    expect(d.max).toBe(1);
    expect(d.reveal).toBe(false);
    expect(d.prompt).toBe(
      'Choose up to one basic land card; it goes onto the battlefield tapped. ' +
        'Then your library is shuffled.',
    );
    // The creature does not match, and the other player's Swamp is not in this library.
    expect(d.legal).toEqual([g.id('forest1'), g.id('forest2'), g.id('island'), g.id('plains')]);
    expect(g.state.stack).toHaveLength(1);
  });

  test('puts the chosen land onto the battlefield tapped, then shuffles', () => {
    const g = landFetchGame();
    g.act(0).cast('SYNTHETIC Land Fetch', { pay: true });
    resolveTop(g);
    const mark = g.mark();
    g.act(0).chooseCards('plains');
    g.expect.zone('Plains', 'battlefield', { seat: 0 });
    g.expect.tapped('Plains', true);
    g.expect.librarySize(0, 4);
    g.expect.pending('priority', 0);
    const events = g.eventsSince(mark);
    // Searched, then moved, then shuffled; nothing is revealed (CR 701.23e). The spell itself
    // goes to the graveyard last (CR 608.2m).
    expect(kinds(events).filter((k) => k !== 'priorityPassed')).toEqual([
      'librarySearched',
      'zoneChanged',
      'libraryShuffled',
      'zoneChanged',
      'resolved',
    ]);
    expect(events[0]).toEqual({ kind: 'librarySearched', seat: 0, found: 1 });
    expect(events[1]).toMatchObject({ fromZone: 'library', toZone: 'battlefield' });
    g.expect.noEvent({ kind: 'cardsRevealed' });
    g.expect.invariants();
  });

  test('finding nothing is allowed (CR 701.23b) and the library is still shuffled', () => {
    const g = landFetchGame();
    g.act(0).cast('SYNTHETIC Land Fetch', { pay: true });
    resolveTop(g);
    g.act(0).chooseCards();
    g.expect.librarySize(0, 5);
    g.expect.zone('Plains', 'battlefield', { seat: 0, count: 0 });
    g.expect.eventLog([
      { kind: 'librarySearched', seat: 0, found: 0 },
      { kind: 'libraryShuffled', seat: 0 },
    ]);
    g.expect.pending('priority', 0);
  });

  test('lists "find nothing" and each single card as the legal answers', () => {
    const g = landFetchGame();
    g.act(0).cast('SYNTHETIC Land Fetch', { pay: true });
    resolveTop(g);
    const actions = g.legalActions(0);
    const chooses = actions.filter((a) => a.kind === 'chooseCards');
    expect(chooses).toHaveLength(5);
    expect(chooses[0]).toEqual({ kind: 'chooseCards', objects: [] });
    expect(actions.at(-1)).toEqual({ kind: 'concede' });
    expect(g.legalActions(1)).toEqual([]);
  });

  test('with no matching card there is no question: the player searches and shuffles', () => {
    const g = scenario()
      .seat(0)
      .hand('SYNTHETIC Land Fetch')
      .pool('GC')
      .library('Grizzly Bears', 'Llanowar Elves')
      .seat(1)
      .build();
    g.act(0).cast('SYNTHETIC Land Fetch', { pay: true });
    resolveTop(g);
    g.expect.pending('priority', 0);
    g.expect.eventLog([
      { kind: 'librarySearched', seat: 0, found: 0 },
      { kind: 'libraryShuffled', seat: 0 },
    ]);
    g.expect.librarySize(0, 2);
  });

  test('an empty library is searched without a question', () => {
    const g = scenario().seat(0).hand('SYNTHETIC Land Fetch').pool('GC').seat(1).build();
    g.act(0).cast('SYNTHETIC Land Fetch', { pay: true });
    resolveTop(g);
    g.expect.pending('priority', 0);
    g.expect.eventLog([{ kind: 'librarySearched', seat: 0, found: 0 }]);
  });
});

const TUTOR_ANY_CARD = singleFaceCard({
  name: 'SYNTHETIC Tutor Any Card',
  manaCost: ['B'],
  types: ['sorcery'],
  colors: ['B'],
  colorIdentity: ['B'],
  oracleText: 'Search your library for a card, put that card into your hand, then shuffle.',
  spell: {
    effect: {
      kind: 'search',
      player: { kind: 'you' },
      filter: {},
      max: 1,
      destinations: [{ zone: 'hand', count: 1 }],
      reveal: false,
      shuffle: true,
    },
  },
});

describe('a search with no stated quality must find (CR 701.23d)', () => {
  test('"a card" cannot be answered with nothing while the library has cards', () => {
    const g = scenario()
      .seat(0)
      .hand('SYNTHETIC Tutor Any Card')
      .pool('B')
      .library('Island', { label: 'island' })
      .library('Forest', { label: 'forest' })
      .seat(1)
      .library('Swamp')
      .define(TUTOR_ANY_CARD)
      .build();
    g.act(0).cast('SYNTHETIC Tutor Any Card', { pay: true });
    resolveTop(g);
    const d = chooseCardsDecision(g);
    expect(d.min).toBe(1);
    expect(d.max).toBe(1);
    expect(g.act(0).try.action({ kind: 'chooseCards', objects: [] }).ok).toBe(false);
    g.act(0).chooseCards('forest');
    g.expect.zone('Forest', 'hand', { seat: 0 });
    g.expect.invariants();
  });

  test('a stated quality still allows finding nothing (CR 701.23b)', () => {
    const g = landFetchGame();
    g.act(0).cast('SYNTHETIC Land Fetch', { pay: true });
    resolveTop(g);
    expect(chooseCardsDecision(g).min).toBe(0);
  });
});

describe('answers to a search are checked (CR 608.2d)', () => {
  test('cards outside the legal list, duplicates, too many cards and other seats are refused', () => {
    const g = landFetchGame();
    g.act(0).cast('SYNTHETIC Land Fetch', { pay: true });
    resolveTop(g);
    const before = g.hash();
    const bears = g.id('bears');
    const theirs = g.id('theirs');
    const f1 = g.id('forest1');
    const f2 = g.id('forest2');
    const attempts = [[bears], [theirs], [f1, f1], [f1, f2], ['o999']];
    for (const objects of attempts) {
      expect(g.act(0).try.action({ kind: 'chooseCards', objects: objects as never }).ok).toBe(
        false,
      );
    }
    expect(g.act(1).try.action({ kind: 'chooseCards', objects: [f1] }).ok).toBe(false);
    expect(g.act(0).try.action({ kind: 'choosePermanents', objects: [f1] }).ok).toBe(false);
    expect(g.act(0).try.action({ kind: 'declineOptional' }).ok).toBe(false);
    expect(g.hash()).toBe(before);
    g.expect.pending('chooseCards', 0);
  });
});

describe('Cultivate-style split destinations', () => {
  function twinGame(seed = 1) {
    return scenario()
      .seed(seed)
      .seat(0)
      .hand('SYNTHETIC Twin Land Fetch')
      .pool('GGC')
      .library('Island', { label: 'island' })
      .library('Forest', { label: 'forest' })
      .library('Plains', { label: 'plains' })
      .library('Grizzly Bears')
      .seat(1)
      .build();
  }

  test('the first found card goes onto the battlefield tapped, the second into the hand', () => {
    const g = twinGame();
    g.act(0).cast('SYNTHETIC Twin Land Fetch', { pay: true });
    resolveTop(g);
    const d = chooseCardsDecision(g);
    expect(d.max).toBe(2);
    expect(d.reveal).toBe(true);
    expect(d.prompt).toBe(
      'Choose up to two basic land cards; the first goes onto the battlefield tapped, the second ' +
        'into your hand. The cards you find are revealed. Then your library is shuffled.',
    );
    g.act(0).chooseCards('forest', 'plains');
    g.expect.zone('Forest', 'battlefield', { seat: 0 });
    g.expect.tapped('Forest', true);
    g.expect.zone('Plains', 'hand', { seat: 0 });
    g.expect.librarySize(0, 2);
  });

  test('the order of the answer decides which card goes where', () => {
    const g = twinGame();
    g.act(0).cast('SYNTHETIC Twin Land Fetch', { pay: true });
    resolveTop(g);
    g.act(0).chooseCards('plains', 'forest');
    g.expect.zone('Plains', 'battlefield', { seat: 0 });
    g.expect.tapped('Plains', true);
    g.expect.zone('Forest', 'hand', { seat: 0 });
  });

  test('a single card found goes to the first destination', () => {
    const g = twinGame();
    g.act(0).cast('SYNTHETIC Twin Land Fetch', { pay: true });
    resolveTop(g);
    g.act(0).chooseCards('island');
    g.expect.zone('Island', 'battlefield', { seat: 0 });
    g.expect.tapped('Island', true);
    g.expect.handSize(0, 0);
  });

  test('revealing names the cards in the order chosen, before they move', () => {
    const g = twinGame();
    g.act(0).cast('SYNTHETIC Twin Land Fetch', { pay: true });
    resolveTop(g);
    const mark = g.mark();
    g.act(0).chooseCards('plains', 'island');
    const events = g.eventsSince(mark);
    const revealed = events.findIndex((e) => e.kind === 'cardsRevealed');
    const firstMove = events.findIndex((e) => e.kind === 'zoneChanged');
    expect(revealed).toBeGreaterThanOrEqual(0);
    expect(revealed).toBeLessThan(firstMove);
    const reveal = events[revealed];
    if (reveal?.kind !== 'cardsRevealed') throw new Error('unreachable');
    expect(reveal.seat).toBe(0);
    expect(reveal.names).toEqual(['Plains', 'Island']);
    expect(reveal.cards).toHaveLength(2);
    expect(reveal.from).toBe('library');
    expect(kinds(events)).toContain('libraryShuffled');
  });

  test('finding nothing reveals nothing', () => {
    const g = twinGame();
    g.act(0).cast('SYNTHETIC Twin Land Fetch', { pay: true });
    resolveTop(g);
    g.act(0).chooseCards();
    g.expect.noEvent({ kind: 'cardsRevealed' });
  });

  test('three destinations in order: battlefield tapped, hand, graveyard (not a discard)', () => {
    const g = scenario()
      .seat(0)
      .hand('SYNTHETIC Triple Fetch')
      .pool('GGGC')
      .library('Island', { label: 'island' })
      .library('Forest', { label: 'forest' })
      .library('Plains', { label: 'plains' })
      .library('Swamp', { label: 'swamp' })
      .seat(1)
      .build();
    g.act(0).cast('SYNTHETIC Triple Fetch', { pay: true });
    resolveTop(g);
    expect(chooseCardsDecision(g).prompt).toContain(
      'the first goes onto the battlefield tapped, the second into your hand, the third into your graveyard',
    );
    g.act(0).chooseCards('swamp', 'island', 'plains');
    g.expect.zone('Swamp', 'battlefield', { seat: 0 });
    g.expect.tapped('Swamp', true);
    g.expect.zone('Island', 'hand', { seat: 0 });
    g.expect.zone('Plains', 'graveyard', { seat: 0 });
    g.expect.noEvent({ kind: 'discarded' });
  });

  test('any card can go into the graveyard (an empty filter matches every card)', () => {
    const g = scenario()
      .seat(0)
      .hand('SYNTHETIC Graveyard Search')
      .pool('B')
      .library('Grizzly Bears', { label: 'bears' })
      .library('Forest')
      .seat(1)
      .build();
    g.act(0).cast('SYNTHETIC Graveyard Search', { pay: true });
    resolveTop(g);
    const d = chooseCardsDecision(g);
    expect(d.legal).toHaveLength(2);
    expect(d.prompt).toBe(
      'Choose up to one card; it goes into your graveyard. Then your library is shuffled.',
    );
    g.act(0).chooseCards('bears');
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 0 });
  });
});

describe('what a search may look for', () => {
  test('a subtype filter offers only cards of that subtype, and the land enters untapped', () => {
    const g = scenario()
      .seat(0)
      .hand('SYNTHETIC Forest Fetch')
      .pool('G')
      .library('Plains', 'Forest', 'Island')
      .seat(1)
      .build();
    g.act(0).cast('SYNTHETIC Forest Fetch', { pay: true });
    resolveTop(g);
    const d = chooseCardsDecision(g);
    expect(d.legal).toEqual([g.id('Forest')]);
    expect(d.prompt).toBe(
      'Choose up to one Forest card; it goes onto the battlefield. Then your library is shuffled.',
    );
    g.act(0).chooseCards('Forest');
    g.expect.zone('Forest', 'battlefield', { seat: 0 });
    g.expect.tapped('Forest', false);
  });

  test('a creature search reveals the card into the hand', () => {
    const g = scenario()
      .seat(0)
      .hand('SYNTHETIC Creature Tutor')
      .pool('GC')
      .library('Forest', 'Grizzly Bears', 'Llanowar Elves')
      .seat(1)
      .build();
    g.act(0).cast('SYNTHETIC Creature Tutor', { pay: true });
    resolveTop(g);
    const d = chooseCardsDecision(g);
    expect(d.legal).toEqual([g.id('Grizzly Bears'), g.id('Llanowar Elves')]);
    g.act(0).chooseCards('Llanowar Elves');
    g.expect.zone('Llanowar Elves', 'hand', { seat: 0 });
    const reveal = g.events.find((e) => e.kind === 'cardsRevealed');
    expect(reveal).toMatchObject({ seat: 0, names: ['Llanowar Elves'], from: 'library' });
  });

  test('a search triggered by an ability asks when the ability resolves (CR 603.6a)', () => {
    const g = scenario()
      .seat(0)
      .hand('SYNTHETIC Scout Creature')
      .pool('GGC')
      .library('Forest', { label: 'forest' })
      .library('Mountain')
      .seat(1)
      .build();
    g.act(0).cast('SYNTHETIC Scout Creature', { pay: true });
    resolveTop(g);
    g.expect.stack(['SYNTHETIC Scout Creature (ability)']);
    g.expect.pending('priority', 0);
    resolveTop(g);
    g.expect.pending('chooseCards', 0);
    g.act(0).chooseCards('forest');
    g.expect.zone('Forest', 'hand', { seat: 0 });
    g.expect.stack([]);
    g.expect.pending('priority', 0);
  });
});

describe('cards put onto the battlefield by a search', () => {
  test('enter with their own replacements: a land that enters tapped', () => {
    const g = scenario()
      .define(FETCH_ANY_LAND)
      .seat(0)
      .hand('SYNTHETIC Test Fetch Any Land')
      .pool('G')
      .library('SYNTHETIC Tapped Land', { label: 'tapped' })
      .seat(1)
      .build();
    g.act(0).cast('SYNTHETIC Test Fetch Any Land', { pay: true });
    resolveTop(g);
    g.act(0).chooseCards('tapped');
    g.expect.zone('SYNTHETIC Tapped Land', 'battlefield', { seat: 0 });
    g.expect.tapped('SYNTHETIC Tapped Land', true);
  });

  test('a shock land asks whether to pay 2 life as it enters (CR 614.12)', () => {
    const build = () => {
      const g = scenario()
        .define(FETCH_ANY_LAND)
        .seat(0)
        .hand('SYNTHETIC Test Fetch Any Land')
        .pool('G')
        .library('SYNTHETIC Shock Land', { label: 'shock' })
        .seat(1)
        .build();
      g.act(0).cast('SYNTHETIC Test Fetch Any Land', { pay: true });
      resolveTop(g);
      g.act(0).chooseCards('shock');
      return g;
    };
    const paid = build();
    paid.expect.pending('confirmOptional', 0);
    paid.act(0).accept();
    paid.expect.life(0, 38);
    paid.expect.tapped('SYNTHETIC Shock Land', false);
    paid.expect.pending('priority', 0);
    const declined = build();
    declined.act(0).decline();
    declined.expect.life(0, 40);
    declined.expect.tapped('SYNTHETIC Shock Land', true);
    declined.expect.pending('priority', 0);
  });

  test('landfall triggers for a land put onto the battlefield (CR 603.6a)', () => {
    const g = scenario()
      .seat(0)
      .hand('SYNTHETIC Land Fetch')
      .pool('GC')
      .battlefield('SYNTHETIC Landfall Tokenmaker')
      .library('Forest', { label: 'forest' })
      .seat(1)
      .build();
    g.act(0).cast('SYNTHETIC Land Fetch', { pay: true });
    resolveTop(g);
    g.act(0).chooseCards('forest');
    g.expect.stack(['SYNTHETIC Landfall Tokenmaker (ability)']);
    resolveTop(g);
    g.expect.zone('Soldier', 'battlefield', { seat: 0 });
  });

  test('landfall does not trigger for a land put into the hand', () => {
    const g = scenario()
      .seat(0)
      .hand('SYNTHETIC Quiet Land Search')
      .pool('G')
      .battlefield('SYNTHETIC Landfall Tokenmaker')
      .library('Forest', { label: 'forest' })
      .seat(1)
      .build();
    g.act(0).cast('SYNTHETIC Quiet Land Search', { pay: true });
    resolveTop(g);
    g.act(0).chooseCards('forest');
    g.expect.stack([]);
    g.expect.noObject('Soldier');
  });
});

describe('shuffling (CR 701.24)', () => {
  const NAMES = ['Island', 'Forest', 'Plains', 'Swamp', 'Mountain', 'Island', 'Forest', 'Plains'];
  function shuffleGame(seed: number) {
    const b = scenario().seed(seed).seat(0).hand('SYNTHETIC Creature Tutor').pool('GC');
    const labelled = NAMES.map((name, i) => ({ name, label: `c${i}` }));
    for (const c of labelled) b.library(c.name, { label: c.label });
    b.library('Grizzly Bears', { label: 'bears' });
    return b.seat(1).build();
  }
  const order = (g: ScenarioGame) =>
    g.state.seats[0]?.library.map((id) => g.state.objects[id]?.card);

  test('changes the order, deterministically from the seed in the state', () => {
    const run = (seed: number) => {
      const g = shuffleGame(seed);
      const before = order(g);
      g.act(0).cast('SYNTHETIC Creature Tutor', { pay: true });
      resolveTop(g);
      g.act(0).chooseCards('bears');
      return { before, after: order(g), g };
    };
    const a = run(7);
    const b = run(7);
    expect(a.after).toEqual(b.after);
    expect(a.g.hash()).toBe(b.g.hash());
    // The eight lands are in a different order afterwards (the chance of the same order is 1/40320).
    expect(a.after).toHaveLength(8);
    expect(a.after).not.toEqual(a.before?.slice(0, 8));
    // Another seed shuffles differently.
    expect(run(8).after).not.toEqual(a.after);
    // The generator in the state advanced.
    expect(a.g.state.rng).not.toEqual(shuffleGame(7).state.rng);
  });

  test('the found card is not part of the shuffle: it already left the library (CR 701.24b)', () => {
    const g = shuffleGame(3);
    g.act(0).cast('SYNTHETIC Creature Tutor', { pay: true });
    resolveTop(g);
    g.act(0).chooseCards('bears');
    expect(g.state.seats[0]?.library).toHaveLength(8);
    g.expect.zone('Grizzly Bears', 'hand', { seat: 0 });
    g.expect.noObject('Grizzly Bears', { zone: 'library' });
  });

  test('a search with no shuffle keeps the order of the rest of the library', () => {
    const g = scenario()
      .seat(0)
      .hand('SYNTHETIC Quiet Land Search')
      .pool('G')
      .library('Grizzly Bears', { label: 'a' })
      .library('Island', { label: 'b' })
      .library('Llanowar Elves', { label: 'c' })
      .library('Forest', { label: 'd' })
      .library('Plains', { label: 'e' })
      .seat(1)
      .build();
    const before = g.state.seats[0]?.library.map((id) => g.state.objects[id]?.card) ?? [];
    g.act(0).cast('SYNTHETIC Quiet Land Search', { pay: true });
    resolveTop(g);
    g.act(0).chooseCards('d');
    const after = g.state.seats[0]?.library.map((id) => g.state.objects[id]?.card) ?? [];
    // The Forest (index 3) left; every other card keeps its place relative to the others.
    expect(after).toEqual(before.filter((_, i) => i !== 3));
    g.expect.noEvent({ kind: 'libraryShuffled' });
    g.expect.zone('Forest', 'hand', { seat: 0 });
  });

  test('the cards offered are sorted by name, whatever the order of the library (CR 401.2)', () => {
    const offered = (order: readonly string[]) => {
      const b = scenario().seat(0).hand('SYNTHETIC Land Fetch').pool('GC');
      for (const n of order) b.library(n);
      const g = b.seat(1).build();
      g.act(0).cast('SYNTHETIC Land Fetch', { pay: true });
      resolveTop(g);
      return g.view(0).pendingCards?.map((o) => o.name);
    };
    const sorted = ['Forest', 'Forest', 'Island', 'Plains'];
    expect(offered(['Forest', 'Island', 'Plains', 'Forest'])).toEqual(sorted);
    expect(offered(['Plains', 'Forest', 'Forest', 'Island'])).toEqual(sorted);
  });
});

describe('hidden information during a search (SPEC 4.2, CR 401.2)', () => {
  test('the opponent sees that a search is in progress, and nothing about the library', () => {
    const g = landFetchGame();
    g.act(0).cast('SYNTHETIC Land Fetch', { pay: true });
    resolveTop(g);
    const d = chooseCardsDecision(g);
    const view = g.view(1);
    expect(view.pending).toBeNull();
    expect(view.decidingSeat).toBe(0);
    expect(view.pendingCards).toBeUndefined();
    expect(view.waitingOn).toEqual({
      seat: 0,
      purpose: 'search',
      sourceName: 'SYNTHETIC Land Fetch',
    });
    const text = JSON.stringify(view);
    // No library card id, no library name that is a secret, no zone name of the library.
    for (const id of g.state.seats[0]?.library ?? []) expect(text).not.toContain(`"${id}"`);
    expect(text).not.toContain('Grizzly Bears');
    expect(text).not.toContain('"library"');
    expect(view.seats[0]?.libraryCount).toBe(5);
    expect(d.legal.length).toBeGreaterThan(0);
  });

  test('the searcher sees exactly the cards on offer, and no others', () => {
    const g = landFetchGame();
    g.act(0).cast('SYNTHETIC Land Fetch', { pay: true });
    resolveTop(g);
    const d = chooseCardsDecision(g);
    const view = g.view(0);
    expect(view.pending).toBe(d);
    expect(view.waitingOn).toBeUndefined();
    expect(view.pendingCards?.map((o) => o.id)).toEqual(d.legal);
    expect(view.pendingCards?.map((o) => o.name)).toEqual(['Forest', 'Forest', 'Island', 'Plains']);
    const text = JSON.stringify(view);
    // The creature in the library does not match: it stays hidden even from its owner's view.
    expect(text).not.toContain(`"${g.id('bears')}"`);
    expect(text).not.toContain('Grizzly Bears');
    // Their own cards are shown, the opponent's library never is.
    expect(text).not.toContain(`"${g.id('theirs')}"`);
  });

  test('after the choice the views carry no leftover of the decision', () => {
    const g = landFetchGame();
    g.act(0).cast('SYNTHETIC Land Fetch', { pay: true });
    resolveTop(g);
    g.act(0).chooseCards('plains');
    for (const seat of [0, 1] as const) {
      const view = getView(g.state, seat);
      expect(view.pendingCards).toBeUndefined();
      expect(view.waitingOn).toBeUndefined();
    }
  });
});

describe('determinism and replay', () => {
  test('the same answers from the same state give the same game', () => {
    const play = () => {
      const g = scenario()
        .seed(11)
        .seat(0)
        .hand('SYNTHETIC Twin Land Fetch')
        .pool('GGC')
        .library('Island', 'Forest', 'Plains', 'Swamp', 'Mountain')
        .seat(1)
        .build();
      g.act(0).cast('SYNTHETIC Twin Land Fetch', { pay: true });
      resolveTop(g);
      const d = chooseCardsDecision(g);
      g.choose({ kind: 'chooseCards', objects: d.legal.slice(0, 2) });
      return g;
    };
    const a = play();
    const b = play();
    expect(a.hash()).toBe(b.hash());
    expect(a.log).toEqual(b.log);
  });
});
