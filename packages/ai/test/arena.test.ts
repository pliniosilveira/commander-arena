// The match harness (M7b, PRIOR_ART 7.2 heuristic 10): paired seeds with swapped seats, mirrored
// decks, consistent tallies, deterministic results, reason histograms. Tiny matches only: the
// 200-game runs of A11 are `pnpm ai:arena`, not unit tests (D-126).
import { beforeAll, describe, expect, test } from 'vitest';
import {
  AGENT_FACTORIES,
  type AgentFactory,
  ARENA_DECKS,
  type MatchResult,
  playMatch,
} from '../src/index';

const { greedy, random } = AGENT_FACTORIES;

describe('the arena decks', () => {
  test('every deck has a commander, lands and creatures, and only real fixtures', () => {
    for (const deck of ARENA_DECKS) {
      expect(deck.commanders).toEqual([0]);
      expect(deck.cards).toHaveLength(24);
      const types = deck.cards.flatMap((c) => c.faces[0]?.types ?? []);
      expect(types.filter((t) => t === 'land').length).toBeGreaterThanOrEqual(9);
      expect(types.filter((t) => t === 'creature').length).toBeGreaterThanOrEqual(8);
      for (const card of deck.cards) expect(card.name.startsWith('SYNTHETIC')).toBe(false);
    }
  });
});

const TIMEOUT_MS = 180_000;

describe('playMatch', () => {
  const match = (a: AgentFactory, b: AgentFactory, games: number, baseSeed: number) =>
    playMatch({ a, b, decks: ARENA_DECKS, games, baseSeed });

  let first: MatchResult;
  beforeAll(async () => {
    first = await match(greedy, random, 4, 11);
  }, TIMEOUT_MS);

  test('plays each seed twice with the seats swapped, on the same seed and deck', () => {
    expect(first.games).toBe(4);
    expect(first.log).toHaveLength(4);
    for (let pair = 0; pair < 2; pair += 1) {
      const [one, two] = [first.log[2 * pair], first.log[2 * pair + 1]];
      expect(one?.aSeat).toBe(0);
      expect(two?.aSeat).toBe(1);
      expect(one?.seed).toBe(11 + pair);
      expect(two?.seed).toBe(one?.seed);
      expect(two?.deck).toBe(one?.deck);
    }
    expect(first.log.map((g) => g.deck)).toEqual([0, 0, 1, 1]);
  });

  test('records the reasons of agents that explain themselves, per agent', () => {
    expect(first.a).toBe('greedy');
    expect(first.b).toBe('random');
    expect(first.reasons.a.delegated).toBeGreaterThan(0);
    expect(first.reasons.a.land).toBeGreaterThan(0);
    expect(first.reasons.a['no-play']).toBeGreaterThan(0);
    expect(first.reasons.b).toEqual({});
    expect(first.fallbacks).toBe(0);
    expect(first.rejectedActions).toBe(0);
    expect(first.unfinished).toBe(0);
  });

  test(
    'is deterministic: the same options give the same result',
    async () => {
      expect(await match(greedy, random, 4, 11)).toEqual(first);
    },
    TIMEOUT_MS,
  );

  test(
    'a mirrored match of one agent kind (random vs random): the tallies add up',
    async () => {
      const r = await match(random, random, 2, 21);
      expect(r.wins.a + r.wins.b + r.draws + r.unfinished).toBe(r.games);
      expect(r.winsBySeat[0] + r.winsBySeat[1]).toBe(r.wins.a + r.wins.b);
      expect(r.winsByAgentSeat.a[0] + r.winsByAgentSeat.a[1]).toBe(r.wins.a);
      expect(r.winsByAgentSeat.b[0] + r.winsByAgentSeat.b[1]).toBe(r.wins.b);
      expect(r.winsByAgentSeat.a[0] + r.winsByAgentSeat.b[0]).toBe(r.winsBySeat[0]);
      expect(r.winsByAgentSeat.a[1] + r.winsByAgentSeat.b[1]).toBe(r.winsBySeat[1]);
      expect(r.log.filter((g) => g.winner === 'a')).toHaveLength(r.wins.a);
      expect(r.log.filter((g) => g.winner === 'b')).toHaveLength(r.wins.b);
      expect(r.averageTurns).toBeGreaterThan(1);
      expect(r.reasons).toEqual({ a: {}, b: {} });
    },
    TIMEOUT_MS,
  );

  test(
    'a pair of decks gives each seat its own list and keeps it when the agents swap seats',
    async () => {
      const first = ARENA_DECKS[0];
      if (first === undefined) throw new Error('need an arena deck');
      // The same list one card shorter: the size of a deck shows in the first view of its seat.
      const x = first;
      const y = { ...first, cards: first.cards.slice(0, -1) };
      const sizes: number[][] = [];
      const spy: AgentFactory = {
        label: 'spy',
        create: (seed) => {
          const inner = random.create(seed);
          let seen = false;
          return {
            name: 'spy',
            decide(view, decision, ctx) {
              if (!seen) {
                // The first decision of an agent is the mulligan, before any card left hand or library.
                seen = true;
                sizes.push(view.seats.map((s) => s.handCount + s.libraryCount));
              }
              return inner.decide(view, decision, ctx);
            },
          };
        },
      };
      const result = await playMatch({ a: spy, b: spy, decks: [[x, y]], games: 2, baseSeed: 5 });
      expect(result.games).toBe(2);
      expect(result.log.map((g) => [g.deck, g.aSeat])).toEqual([
        [0, 0],
        [0, 1],
      ]);
      // Seat 0 held deck x and seat 1 deck y in both games of the pair.
      expect(sizes).toHaveLength(4);
      for (const seen of sizes) expect(seen).toEqual([x.cards.length - 1, y.cards.length - 1]);
    },
    TIMEOUT_MS,
  );

  test('refuses a match without decks', async () => {
    await expect(
      playMatch({ a: greedy, b: greedy, decks: [], games: 2, baseSeed: 1 }),
    ).rejects.toThrow(/deck/);
  });

  test('refuses an odd number of games: every seed is played twice', async () => {
    await expect(
      playMatch({ a: greedy, b: greedy, decks: ARENA_DECKS, games: 3, baseSeed: 1 }),
    ).rejects.toThrow(/even/);
  });
});
