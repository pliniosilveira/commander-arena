// determinize(state, viewer, rng) (SPEC 9, A10, A31, D-161): a sampled copy of the game for the deciding seat in
// which everything the viewer cannot know is drawn again.
// Pins: CR 401.2 (nobody may know the order of a library), CR 401.5 (the top card a permanent lets its controller
// look at is known), CR 701.20 and 701.23a (cards looked at or searched for are known to the searcher), CR
// 702.143a (a foretold card is known to its owner alone; it has foretell), CR 702.75a (Hideaway), CR 903.3
// (commanders are public), and SPEC 4.2 (determinism: only the supplied RngState is drawn from).
import { describe, expect, test, vi } from 'vitest';
import {
  applyAction,
  type CardId,
  checkInvariants,
  createRng,
  determinize,
  type GameState,
  getLegalActions,
  getView,
  type ObjectId,
  stateHash,
} from '../src/index';
import { scenario } from '../src/testing/index';
import { firstPolicy, newGame, play, randomPolicy } from './random-games';

// Many random positions are played and sampled: the first test that asks for them pays for all.
vi.setConfig({ testTimeout: 180_000 });

const SEEDS = [1, 2, 3, 4, 5, 6];
const STEPS = [0, 12, 40, 90, 200, 400];

/** Real positions of random games: every seed at several depths. */
let cached: { state: GameState; label: string }[] | null = null;
function positions(): { state: GameState; label: string }[] {
  if (cached !== null) return cached;
  const out: { state: GameState; label: string }[] = [];
  for (const seed of SEEDS) {
    for (const steps of STEPS) {
      const played = play(newGame(seed), randomPolicy(seed * 7 + 1), steps);
      if (played.state.result === null)
        out.push({ state: played.state, label: `${seed}@${steps}` });
    }
  }
  cached = out;
  return out;
}

const numberOf = (id: string): number => Number(id.slice(1));
const cardsOf = (state: GameState, ids: readonly ObjectId[]): CardId[] =>
  ids.map((id) => state.objects[id]?.card as CardId);
const namesOf = (state: GameState, ids: readonly ObjectId[]): string[] =>
  cardsOf(state, ids).map((c) => {
    const card = state.cards[c];
    return card === undefined ? '?' : (state.definitions[card.definition]?.name ?? '?');
  });
const sorted = (xs: readonly string[]): string[] => [...xs].sort();

describe('the input is left alone', () => {
  test('the state and the rng are not changed', () => {
    for (const { state } of positions()) {
      const rng = createRng(5);
      const before = stateHash(state);
      const rngBefore = JSON.stringify(rng);
      determinize(state, 0, rng);
      determinize(state, 1, rng);
      expect(stateHash(state)).toBe(before);
      expect(JSON.stringify(rng)).toBe(rngBefore);
    }
  });

  test('the sample has a PRNG and a seed of its own, not the real ones', () => {
    for (const { state, label } of positions()) {
      const sample = determinize(state, 0, createRng(9));
      expect(sample.rng, label).not.toEqual(state.rng);
      expect(sample.seed, label).not.toBe(state.seed);
    }
  });
});

describe('what the viewer sees does not change', () => {
  test('getView of the sample equals getView of the real state, for either viewer', () => {
    for (const { state, label } of positions()) {
      for (const viewer of [0, 1]) {
        const sample = determinize(state, viewer, createRng(label.length * 31 + viewer));
        expect(getView(sample, viewer), `${label} viewer ${viewer}`).toEqual(
          getView(state, viewer),
        );
      }
    }
  });

  test('zone counts, the stack, the battlefield and the graveyards are identical', () => {
    for (const { state, label } of positions()) {
      const sample = determinize(state, 0, createRng(3));
      expect(sample.battlefield, label).toEqual(state.battlefield);
      expect(sample.stack, label).toEqual(state.stack);
      expect(sample.exile, label).toEqual(state.exile);
      expect(sample.combat, label).toEqual(state.combat);
      state.seats.forEach((seat, i) => {
        const s = sample.seats[i];
        expect(s?.hand.length, label).toBe(seat.hand.length);
        expect(s?.library.length, label).toBe(seat.library.length);
        expect(s?.graveyard, label).toEqual(seat.graveyard);
        expect(s?.command, label).toEqual(seat.command);
      });
    }
  });

  test('the viewer keeps their own hand, card for card', () => {
    for (const { state, label } of positions()) {
      const sample = determinize(state, 1, createRng(4));
      expect(sample.seats[1]?.hand, label).toEqual(state.seats[1]?.hand);
      expect(cardsOf(sample, sample.seats[1]?.hand ?? []), label).toEqual(
        cardsOf(state, state.seats[1]?.hand ?? []),
      );
    }
  });
});

describe('what the viewer cannot know is drawn again', () => {
  test("another seat's hand and library keep their cards as a multiset (hand and library together)", () => {
    for (const { state, label } of positions()) {
      const sample = determinize(state, 0, createRng(11));
      const real = state.seats[1];
      const got = sample.seats[1];
      if (real === undefined || got === undefined) throw new Error('no seat');
      expect(sorted(namesOf(sample, [...got.hand, ...got.library])), label).toEqual(
        sorted(namesOf(state, [...real.hand, ...real.library])),
      );
      // The cards of each zone are drawn from the pool: the real hand is not kept.
    }
  });

  test('it is a real reshuffle: the hand slots and the library order change for some seeds', () => {
    const state = play(newGame(3), randomPolicy(5), 40).state;
    const real = state.seats[1];
    if (real === undefined) throw new Error('no seat');
    let handChanged = 0;
    let libraryChanged = 0;
    let handCrossed = 0;
    for (let seed = 1; seed <= 30; seed += 1) {
      const sample = determinize(state, 0, createRng(seed));
      const got = sample.seats[1];
      if (got === undefined) throw new Error('no seat');
      // The cards of the hand slots (same ids as the real hand) and the cards of the library in library order.
      const sampleHand = cardsOf(sample, real.hand);
      if (sampleHand.join() !== cardsOf(state, real.hand).join()) handChanged += 1;
      if (cardsOf(sample, got.library).join() !== cardsOf(state, real.library).join()) {
        libraryChanged += 1;
      }
      // A card that was in the library can now be in a hand slot: the pool is shared.
      const realHand = new Set(cardsOf(state, real.hand));
      if (sampleHand.some((c) => !realHand.has(c))) handCrossed += 1;
    }
    expect(handChanged).toBeGreaterThan(20);
    expect(libraryChanged).toBeGreaterThan(20);
    expect(handCrossed).toBeGreaterThan(20);
  });

  test("the viewer's own library is reordered, with the same cards", () => {
    const state = play(newGame(3), randomPolicy(5), 40).state;
    const real = state.seats[0];
    if (real === undefined) throw new Error('no seat');
    let changed = 0;
    for (let seed = 1; seed <= 20; seed += 1) {
      const got = determinize(state, 0, createRng(seed)).seats[0];
      if (got === undefined) throw new Error('no seat');
      expect([...got.library].sort()).toEqual([...real.library].sort());
      if (got.library.join() !== real.library.join()) changed += 1;
    }
    expect(changed).toBeGreaterThan(15);
  });

  test('the same seed gives the same sample, other seeds usually another', () => {
    const state = play(newGame(4), randomPolicy(2), 60).state;
    const a = determinize(state, 0, createRng(8));
    expect(stateHash(determinize(state, 0, createRng(8)))).toBe(stateHash(a));
    let different = 0;
    for (let seed = 9; seed < 29; seed += 1) {
      if (stateHash(determinize(state, 0, createRng(seed))) !== stateHash(a)) different += 1;
    }
    expect(different).toBeGreaterThan(17);
  });

  test('a commander is public: it is not pooled and keeps its card', () => {
    const real = play(newGame(3), randomPolicy(5), 40).state;
    const hand = real.seats[1]?.hand ?? [];
    const id = hand[0] as ObjectId;
    const card = real.objects[id]?.card as CardId;
    const instance = real.cards[card];
    if (instance === undefined) throw new Error('no card');
    const state: GameState = {
      ...real,
      cards: { ...real.cards, [card]: { ...instance, isCommander: true } },
    };
    for (let seed = 1; seed <= 15; seed += 1) {
      const got = determinize(state, 0, createRng(seed));
      expect(got.objects[id]?.card).toBe(card);
      const rest = (s: GameState) =>
        namesOf(s, [...(s.seats[1]?.hand ?? []), ...(s.seats[1]?.library ?? [])]);
      expect(sorted(rest(got))).toEqual(sorted(rest(state)));
    }
  });
});

describe('object ids do not give the real order or identities away', () => {
  test('at the start an id has the number of its card; in the sample it does not', () => {
    // Setup (rules/setup.ts) numbers the objects and the cards of a deck alike, so in the real state the id of an
    // untouched library object names its card (o17 is the 18th card of the decklist). The sample keeps the ids of
    // the slots and deals other cards into them.
    let real = 0;
    let sampled = 0;
    let slots = 0;
    for (const seed of SEEDS) {
      const state = newGame(seed);
      const sample = determinize(state, 0, createRng(seed));
      for (const id of state.seats[1]?.library ?? []) {
        slots += 1;
        if (numberOf(state.objects[id]?.card ?? 'c-1') === numberOf(id)) real += 1;
        if (numberOf(sample.objects[id]?.card ?? 'c-1') === numberOf(id)) sampled += 1;
      }
    }
    expect(real).toBe(slots);
    expect(sampled).toBeLessThan(slots / 10);
  });

  test("the order of a library's ids is not the real one", () => {
    const state = newGame(2);
    const real = state.seats[1]?.library ?? [];
    const sample = determinize(state, 0, createRng(1)).seats[1]?.library ?? [];
    expect(sample.join()).not.toBe(real.join());
    expect([...sample].sort()).toEqual([...real].sort());
  });
});

describe('the sample can be played', () => {
  test('a legal action of the real state is accepted by the sample', () => {
    for (const { state, label } of positions()) {
      const seat = state.pending?.seat;
      if (seat === undefined) continue;
      const sample = determinize(state, seat, createRng(17));
      for (const action of getLegalActions(state, seat).slice(0, 12)) {
        const r = applyAction(sample, seat, action);
        expect(r.ok, `${label}: ${JSON.stringify(action)}`).toBe(true);
      }
    }
  });

  test('sampled games are played to the end by random agents without invariant violations', {
    timeout: 180_000,
  }, () => {
    for (const seed of [1, 2, 3]) {
      const real = play(newGame(seed), randomPolicy(seed), 80).state;
      const sample = determinize(real, real.pending?.seat ?? 0, createRng(seed));
      expect(checkInvariants(sample)).toEqual([]);
      const done = play(sample, firstPolicy, 20_000, (s) => {
        const problems = checkInvariants(s);
        if (problems.length > 0) throw new Error(`seed ${seed}: ${problems.join('; ')}`);
      });
      expect(done.state.result, `seed ${seed}`).not.toBeNull();
    }
    for (const seed of [4, 5]) {
      const real = play(newGame(seed), randomPolicy(seed), 150).state;
      const sample = determinize(real, real.pending?.seat ?? 0, createRng(seed));
      play(sample, randomPolicy(seed + 100), 1_500, (s) => {
        const problems = checkInvariants(s);
        if (problems.length > 0) throw new Error(`seed ${seed}: ${problems.join('; ')}`);
      });
    }
  });
});

describe('what the viewer is looking at stays', () => {
  const LENS = 'SYNTHETIC Seer Lens';

  test('the top card a permanent lets the viewer look at stays on top, the rest is reordered', () => {
    const g = scenario()
      .seat(0)
      .battlefield(LENS)
      .library('Grizzly Bears', { label: 'a' })
      .library('Island')
      .library('Forest')
      .library('Plains')
      .library('Swamp')
      .library('Mountain')
      .seat(1)
      .library('Giant Spider', { label: 'x' })
      .library('Plains')
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    let restMoved = 0;
    for (let seed = 1; seed <= 20; seed += 1) {
      const sample = determinize(g.state, 0, createRng(seed));
      expect(sample.seats[0]?.library[0]).toBe(g.id('a'));
      expect(getView(sample, 0)).toEqual(getView(g.state, 0));
      if (sample.seats[0]?.library.slice(1).join() !== g.state.seats[0]?.library.slice(1).join())
        restMoved += 1;
    }
    expect(restMoved).toBeGreaterThan(15);
  });

  test('without the permanent the top card is not kept', () => {
    const g = scenario()
      .seat(0)
      .library('Grizzly Bears', { label: 'a' })
      .library('Island', 'Forest', 'Plains', 'Swamp', 'Mountain')
      .seat(1)
      .library('Giant Spider')
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    let moved = 0;
    for (let seed = 1; seed <= 20; seed += 1) {
      if (determinize(g.state, 0, createRng(seed)).seats[0]?.library[0] !== g.id('a')) moved += 1;
    }
    expect(moved).toBeGreaterThan(10);
  });
});

describe('face-down cards in exile', () => {
  const BOLT = 'SYNTHETIC Foretell Bolt';
  const INSIGHT = 'SYNTHETIC Foretell Insight';
  const GIANT = 'SYNTHETIC Foretell Giant';

  function foretoldGame() {
    const g = scenario()
      .seat(0)
      .library('Plains', 'Plains', 'Plains')
      .seat(1)
      .hand(BOLT, INSIGHT, 'Island')
      .library(GIANT, 'Plains', 'Plains', 'Swamp', 'Swamp', 'Forest')
      .battlefield('Mountain', { count: 3 })
      .at('precombatMain', { active: 1, turn: 4 })
      .build();
    g.act(1).foretell(BOLT, { pay: true });
    return g;
  }

  test("an opponent's foretold card is drawn from the cards that have foretell, never another", () => {
    const g = foretoldGame();
    const exiled = g.state.exile[0] as ObjectId;
    expect(g.state.objects[exiled]?.foretoldTurn).toBeDefined();
    const seen = new Set<string>();
    for (let seed = 1; seed <= 40; seed += 1) {
      const sample = determinize(g.state, 0, createRng(seed));
      const names = namesOf(sample, [exiled]);
      seen.add(names[0] as string);
      expect([BOLT, INSIGHT, GIANT]).toContain(names[0]);
      expect(sample.objects[exiled]?.foretoldTurn).toBe(g.state.objects[exiled]?.foretoldTurn);
      expect(getView(sample, 0)).toEqual(getView(g.state, 0));
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  test('its owner knows it: for the owner the foretold card does not change', () => {
    const g = foretoldGame();
    const exiled = g.state.exile[0] as ObjectId;
    for (let seed = 1; seed <= 10; seed += 1) {
      const sample = determinize(g.state, 1, createRng(seed));
      expect(sample.objects[exiled]?.card).toBe(g.state.objects[exiled]?.card);
      expect(getView(sample, 1)).toEqual(getView(g.state, 1));
    }
  });

  test('a Hideaway card is pooled for everyone but the player who may look at it', () => {
    const g = scenario()
      .seat(0)
      .library('Plains', 'Plains', 'Plains')
      .seat(1)
      .battlefield('Plains', { label: 'p' })
      .exile('Serra Angel', { label: 'angel' })
      .hand('Grizzly Bears', 'Giant Spider')
      .library('Island', 'Forest', 'Swamp', 'Mountain')
      .at('precombatMain', { active: 1, turn: 4 })
      .build();
    const angel = g.id('angel');
    const hideaway: GameState = {
      ...g.state,
      objects: {
        ...g.state.objects,
        [angel]: {
          ...(g.state.objects[angel] as NonNullable<(typeof g.state.objects)[ObjectId]>),
          hideaway: g.id('p'),
        },
      },
    };
    const moved = new Set<string | null | undefined>();
    for (let seed = 1; seed <= 40; seed += 1) {
      const forOpponent = determinize(hideaway, 0, createRng(seed));
      moved.add(forOpponent.objects[angel]?.card);
      expect(getView(forOpponent, 0)).toEqual(getView(hideaway, 0));
      // The looker (seat 1 controls the permanent) knows the card.
      expect(determinize(hideaway, 1, createRng(seed)).objects[angel]?.card).toBe(
        hideaway.objects[angel]?.card,
      );
    }
    expect(moved.size).toBeGreaterThan(1);
  });
});

describe('a casting in progress holds a snapshot of the real state', () => {
  test('the snapshot is determinized too: no real PRNG, no real library order', () => {
    const g = scenario()
      .seat(0)
      .hand('Lightning Bolt')
      .battlefield('Mountain')
      .library('Plains', 'Island', 'Forest', 'Swamp')
      .seat(1)
      .hand('Grizzly Bears', 'Giant Spider')
      .library('Island', 'Forest', 'Swamp', 'Mountain', 'Plains')
      .battlefield('Serra Angel')
      .at('precombatMain', { active: 0, turn: 3, priority: 0 })
      .build();
    g.act(0).cast('Lightning Bolt', { targets: ['Serra Angel'] });
    const casting = g.state.casting;
    if (casting === null) throw new Error('a cast is in progress');
    const sample = determinize(g.state, 0, createRng(2));
    const snapshot = sample.casting?.snapshot;
    if (snapshot === undefined) throw new Error('no snapshot');
    expect(snapshot.rng).not.toEqual(casting.snapshot.rng);
    expect(snapshot.seed).not.toBe(casting.snapshot.seed);
    expect(snapshot.seats[1]?.library).not.toEqual(casting.snapshot.seats[1]?.library);
    expect(getView(sample, 0)).toEqual(getView(g.state, 0));
  });
});
