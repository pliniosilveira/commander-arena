// CasualAgent in whole games (SPEC 9, 12): against RandomLegalAgent and against itself, in all
// seat orders, over the same rotating deck styles the random-agent games use. No fallback, no
// rejected action, no agent error, no stuck run; the agent never sends activateAbility or concede;
// it beats RandomLegalAgent clearly and casts far more spells.
//
// Measured (game seeds 1 to 60, agent seeds 5000 + 2 * seed and 5001 + 2 * seed; the games are
// deterministic and the tests print the same numbers to the console):
// - casual in seat 0 against random in seat 1 wins 47 of 60 games (78%); MIN_WIN_RATE is 65%.
// - seat 0 casts 4.50 spells per game in the first 12 turns against 1.52 for a random agent in
//   the same games (a random-vs-random run of the same seeds and decks), about 3 times as many;
//   over whole games it is 6.97 against 5.27, because the decks are small and casual games end
//   sooner when casual wins.
import type { GameConfig } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { type Agent, CasualAgent, type GameRun, RandomLegalAgent, runGame } from '../src/index';
import { smallGameConfig, stylesFor } from './helpers';
import { soakGames, soakTimeout } from './soak';

// Whole-game tests run many games; under a loaded machine they need more than the 5 s default.
// 100 games with the whole engine: about 100 s alone, more on a loaded machine (CI, a full local run).
const TIMEOUT_MS = 300_000;
const GAMES = soakGames();
const LIMITS = { maxTurns: 150, maxActions: 5000 };

type Kind = 'casual' | 'random';
const make = (kind: Kind, seed: number): Agent & { fallbacks: readonly unknown[] } =>
  kind === 'casual' ? new CasualAgent({ seed }) : new RandomLegalAgent({ seed });

async function play(
  game: number,
  kinds: readonly [Kind, Kind],
  limits = LIMITS,
): Promise<{ run: GameRun; config: GameConfig; agents: readonly [Agent, Agent] }> {
  const config = smallGameConfig(game, stylesFor(game));
  const agents = [make(kinds[0], 5000 + 2 * game), make(kinds[1], 5001 + 2 * game)] as const;
  const run = await runGame(config, agents, limits);
  return { run, config, agents };
}

const count = (run: GameRun, seat: number, kind: string): number =>
  run.log.filter((e) => e.seat === seat && e.action.kind === kind).length;

const MATCHUPS: readonly (readonly [Kind, Kind])[] = [
  ['casual', 'random'],
  ['casual', 'casual'],
  ['random', 'casual'],
];

describe('CasualAgent games run clean', () => {
  for (const kinds of MATCHUPS) {
    test(
      `${GAMES} games ${kinds[0]} vs ${kinds[1]}: no faults, never activates or concedes`,
      async () => {
        for (let g = 1; g <= GAMES; g += 1) {
          const { run, agents } = await play(g, kinds);
          const tag = `${kinds.join(' vs ')} game ${g}`;
          expect(run.reason, tag).not.toBe('stuck');
          expect(run.reason, tag).toBe('result');
          expect(run.counters.fallbacks, tag).toBe(0);
          expect(run.counters.rejectedActions, tag).toBe(0);
          expect(run.agentErrors, tag).toEqual([]);
          for (const agent of agents) expect(agent.fallbacks, tag).toHaveLength(0);
          kinds.forEach((kind, seat) => {
            if (kind !== 'casual') return;
            expect(count(run, seat, 'activateAbility'), `${tag} seat ${seat}`).toBe(0);
            expect(count(run, seat, 'concede'), `${tag} seat ${seat}`).toBe(0);
          });
        }
      },
      soakTimeout(TIMEOUT_MS),
    );
  }
});

describe('CasualAgent against RandomLegalAgent', () => {
  const SEEDS = Array.from({ length: 60 }, (_, i) => i + 1);

  test(
    'wins clearly more than half of 60 fixed games',
    async () => {
      let wins = 0;
      for (const g of SEEDS) {
        const { run } = await play(g, ['casual', 'random']);
        if (run.result?.kind === 'win' && run.result.winner === 0) wins += 1;
      }
      const rate = wins / SEEDS.length;
      console.log(
        `casual (seat 0) vs random, 60 games: ${wins} wins (${(rate * 100).toFixed(0)}%)`,
      );
      expect(rate).toBeGreaterThanOrEqual(MIN_WIN_RATE);
    },
    TIMEOUT_MS,
  );

  // Spells cast in a whole game are bounded by the cards drawn (the test decks have about 12
  // spells), and casual games end sooner because the agent wins, so the whole-game totals are
  // close. The tempo the owner cares about is spells cast per turn, so both agents are compared
  // over the same first TEMPO_TURNS turns of the same games (same seeds, same decks).
  test(
    'casts at least twice as many spells as RandomLegalAgent in the same turns',
    async () => {
      let casual = 0;
      let random = 0;
      let casualWhole = 0;
      let randomWhole = 0;
      const early = { maxTurns: TEMPO_TURNS, maxActions: LIMITS.maxActions };
      for (const g of SEEDS) {
        casual += count((await play(g, ['casual', 'random'], early)).run, 0, 'castSpell');
        random += count((await play(g, ['random', 'random'], early)).run, 0, 'castSpell');
        casualWhole += count((await play(g, ['casual', 'random'])).run, 0, 'castSpell');
        randomWhole += count((await play(g, ['random', 'random'])).run, 0, 'castSpell');
      }
      console.log(
        `spells cast per game, seat 0, 60 games: first ${TEMPO_TURNS} turns casual ` +
          `${(casual / 60).toFixed(2)} vs random ${(random / 60).toFixed(2)}; whole games casual ` +
          `${(casualWhole / 60).toFixed(2)} vs random ${(randomWhole / 60).toFixed(2)}`,
      );
      expect(casual).toBeGreaterThanOrEqual(2 * random);
    },
    TIMEOUT_MS,
  );
});

const TEMPO_TURNS = 12;
const MIN_WIN_RATE = 0.65;
