// The real precons as AI test decks (M7d, D-164). The soak plays the HeuristicAgent, at both levels, on
// the five committed precon snapshots, which the arena decks (24 cards) never exercised. It lives in tools/
// because the AI package may not read the web app's snapshots. Games are long (about 100 cards, 25 to 40
// turns), so a run plays 8 games, not the 20 of the convention (D-126); the 100-game and 200-game runs
// are `node tools/ai/arena.ts --precons` (docs/progress/M7.md).
import { AGENT_FACTORIES, MATCH_LIMITS, playMatch } from '@commander-arena/ai';
import { describe, expect, test } from 'vitest';
import { crossPairs, loadPreconDecks, mirrorPairs, readSnapshots } from './precons.ts';

const GAMES = 8;
const TIMEOUT_MS = 600_000;

describe('the precon decks of the AI tools', () => {
  test('every committed snapshot becomes a 100-card engine deck through the web pipeline', async () => {
    const { snapshots } = readSnapshots();
    expect(snapshots.length).toBeGreaterThanOrEqual(2);
    const loaded = await loadPreconDecks();
    // A precon the web app would refuse would be listed here with its reason.
    expect(loaded.problems).toEqual([]);
    expect(loaded.decks.map((d) => d.id)).toEqual(snapshots.map((s) => s.id));
    for (const entry of loaded.decks) {
      expect(entry.deck.cards, entry.id).toHaveLength(100);
      expect(entry.deck.commanders.length, entry.id).toBeGreaterThanOrEqual(1);
      for (const card of entry.deck.cards)
        expect(card.support, `${entry.id}: ${card.name}`).toBe('supported');
    }
  }, 120_000);

  test('mirror pairs are one deck each; cross pairs are every ordered pair of two different decks', async () => {
    const { decks } = await loadPreconDecks();
    expect(mirrorPairs(decks)).toHaveLength(decks.length);
    const cross = crossPairs(decks);
    expect(cross).toHaveLength(decks.length * (decks.length - 1));
    for (const [x, y] of cross) expect(x).not.toBe(y);
  }, 120_000);
});

describe.skipIf(process.env.TEST_TIER === 'pr')('the HeuristicAgent on the real precons soak', () => {
  test(
    'plays whole games between two precons with no fallback, no rejected action and a result',
    async () => {
      const { decks } = await loadPreconDecks();
      const result = await playMatch({
        a: AGENT_FACTORIES.heuristic,
        b: AGENT_FACTORIES.casual,
        decks: crossPairs(decks),
        games: GAMES,
        baseSeed: 1,
        limits: MATCH_LIMITS,
      });
      expect(result.games).toBe(GAMES);
      expect(result.unfinished, JSON.stringify(result.log.filter((g) => g.end !== 'result'))).toBe(
        0,
      );
      expect(result.fallbacks).toBe(0);
      expect(result.rejectedActions).toBe(0);
      expect(result.wins.a + result.wins.b + result.draws).toBe(GAMES);
    },
    TIMEOUT_MS,
  );
});
