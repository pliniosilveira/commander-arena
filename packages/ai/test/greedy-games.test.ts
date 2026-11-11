// GreedyAgent in whole games (M7b, SPEC 9, 12): against RandomLegalAgent and against itself, in all
// seat orders, over the same rotating deck styles the casual games use. No fallback, no rejected
// action, no agent error, no stuck run; the agent never activates an ability or concedes; every
// decision is recorded with a reason; it beats RandomLegalAgent over the games of the run.
import type { GameConfig } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { type Agent, type GameRun, GreedyAgent, RandomLegalAgent, runGame } from '../src/index';
import { smallGameConfig, stylesFor } from './helpers';
import { soakGames, soakTimeout } from './soak';

const TIMEOUT_MS = 300_000;
const GAMES = soakGames();
const LIMITS = { maxTurns: 150, maxActions: 5000 };

type Kind = 'greedy' | 'random';
const make = (kind: Kind, seed: number): Agent =>
  kind === 'greedy' ? new GreedyAgent({ seed }) : new RandomLegalAgent({ seed });

async function play(
  game: number,
  kinds: readonly [Kind, Kind],
): Promise<{ run: GameRun; config: GameConfig; agents: readonly [Agent, Agent] }> {
  const config = smallGameConfig(game, stylesFor(game));
  const agents = [make(kinds[0], 7000 + 2 * game), make(kinds[1], 7001 + 2 * game)] as const;
  return { run: await runGame(config, agents, LIMITS), config, agents };
}

const count = (run: GameRun, seat: number, kind: string): number =>
  run.log.filter((e) => e.seat === seat && e.action.kind === kind).length;

/** Games of greedy against random in both seat orders, counted by the clean-run tests below. */
const versusRandom = { played: 0, wins: 0 };

const MATCHUPS: readonly (readonly [Kind, Kind])[] = [
  ['greedy', 'random'],
  ['greedy', 'greedy'],
  ['random', 'greedy'],
];

describe('GreedyAgent games run clean', () => {
  for (const kinds of MATCHUPS) {
    test(
      `${GAMES} games ${kinds[0]} vs ${kinds[1]}: no faults, never activates or concedes`,
      async () => {
        for (let g = 1; g <= GAMES; g += 1) {
          const { run, agents } = await play(g, kinds);
          const tag = `${kinds.join(' vs ')} game ${g}`;
          expect(run.reason, tag).toBe('result');
          if (kinds.includes('random') && kinds.includes('greedy')) {
            versusRandom.played += 1;
            if (run.result?.kind === 'win' && kinds[run.result.winner] === 'greedy') {
              versusRandom.wins += 1;
            }
          }
          expect(run.counters.fallbacks, tag).toBe(0);
          expect(run.counters.rejectedActions, tag).toBe(0);
          expect(run.agentErrors, tag).toEqual([]);
          kinds.forEach((kind, seat) => {
            const agent = agents[seat];
            if (kind !== 'greedy' || !(agent instanceof GreedyAgent)) return;
            expect(agent.fallbacks, `${tag} seat ${seat}`).toHaveLength(0);
            expect(count(run, seat, 'activateAbility'), `${tag} seat ${seat}`).toBe(0);
            expect(count(run, seat, 'concede'), `${tag} seat ${seat}`).toBe(0);
            // One reason record per decision the agent was asked.
            expect(agent.reasons.length, `${tag} seat ${seat}`).toBe(
              run.log.filter((e) => e.seat === seat).length +
                run.rejected.filter((r) => r.seat === seat).length,
            );
          });
        }
      },
      soakTimeout(TIMEOUT_MS),
    );
  }
});

describe('GreedyAgent against RandomLegalAgent', () => {
  // The games of the first block are the sample: tests of a file run in order.
  test('wins clearly more than half of the games, from either seat', () => {
    console.log(
      `greedy vs random, ${versusRandom.played} games (both seats): ${versusRandom.wins} wins`,
    );
    expect(versusRandom.played).toBe(2 * GAMES);
    expect(versusRandom.wins / versusRandom.played).toBeGreaterThanOrEqual(0.6);
  });
});
