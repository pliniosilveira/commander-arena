// HeuristicAgent in whole games (M7c, SPEC 9, 12, D-163): against RandomLegalAgent, GreedyAgent,
// CasualAgent and itself, in both seat orders (the seat alternates by game), over the deck styles the
// casual games use, which put every decision kind in front of it. No fallback, no rejected action, no
// agent error, no stuck run, no concession, and no decision answered the same way three times in a row
// (the sign of a loop on a declined payment). `playMatch` runs on the arena decks the same way.
import type { Action, GameConfig, GameView, PendingDecision } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import {
  AGENT_FACTORIES,
  type Agent,
  ARENA_DECKS,
  CasualAgent,
  type DecideContext,
  GreedyAgent,
  HeuristicAgent,
  playMatch,
  RandomLegalAgent,
  runGame,
} from '../src/index';
import { smallGameConfig, stylesFor } from './helpers';
import { soakGames, soakTimeout } from './soak';

const TIMEOUT_MS = 600_000;
const GAMES = soakGames();
const LIMITS = { maxTurns: 150, maxActions: 5000 };
/** Better than chance on the unbalanced soak decks (greedy-games.test.ts uses the same kind of floor). */
const SOAK_FLOOR = 0.6;

type Kind = 'heuristic' | 'random' | 'greedy' | 'casual';

/** Wraps the agent under test to count decisions answered identically three times in a row. */
class Watch implements Agent {
  readonly name: string;
  readonly inner: HeuristicAgent;
  repeats = 0;
  private last = '';
  private run = 0;

  constructor(inner: HeuristicAgent) {
    this.inner = inner;
    this.name = inner.name;
  }

  get fallbacks() {
    return this.inner.fallbacks;
  }

  async decide(view: GameView, decision: PendingDecision, ctx: DecideContext): Promise<Action> {
    const action = await this.inner.decide(view, decision, ctx);
    // The position as far as a loop could not change it: the turn, the step, the stack, what each seat has.
    const position = [
      view.turn,
      view.step,
      view.stack.map((o) => o.id),
      view.battlefield.map((o) => `${o.id}${o.tapped ? 't' : ''}${o.damage}`),
      view.seats.map((x) => [x.life, x.handCount, x.libraryCount, x.graveyard.length]),
    ];
    const key = JSON.stringify([position, { ...decision, id: 0 }, action]);
    this.run = key === this.last ? this.run + 1 : 1;
    if (this.run >= 3) this.repeats += 1;
    this.last = key;
    return action;
  }
}

const other = (kind: Exclude<Kind, 'heuristic'> | 'heuristic', seed: number): Agent =>
  kind === 'random'
    ? new RandomLegalAgent({ seed })
    : kind === 'greedy'
      ? new GreedyAgent({ seed })
      : kind === 'casual'
        ? new CasualAgent({ seed })
        : new HeuristicAgent({ seed });

async function play(game: number, opponent: Kind) {
  const config: GameConfig = smallGameConfig(game, stylesFor(game));
  const watch = new Watch(new HeuristicAgent({ seed: 9000 + 2 * game }));
  const foe = other(opponent, 9001 + 2 * game);
  // The heuristic agent sits in seat 0 in even games and in seat 1 in odd ones.
  const agents = (game % 2 === 0 ? [watch, foe] : [foe, watch]) as [Agent, Agent];
  const run = await runGame(config, agents, LIMITS);
  return { run, watch, seat: game % 2 };
}

describe('HeuristicAgent games run clean', () => {
  for (const opponent of ['random', 'greedy', 'casual', 'heuristic'] as const) {
    test(
      `${GAMES} games against ${opponent}, both seat orders`,
      async () => {
        let wins = 0;
        for (let g = 1; g <= GAMES; g += 1) {
          const { run, watch, seat } = await play(g, opponent);
          const tag = `heuristic vs ${opponent} game ${g}`;
          expect(run.reason, tag).toBe('result');
          expect(run.counters.fallbacks, tag).toBe(0);
          expect(run.counters.rejectedActions, tag).toBe(0);
          expect(run.agentErrors, tag).toEqual([]);
          expect(watch.fallbacks, tag).toHaveLength(0);
          expect(watch.repeats, tag).toBe(0);
          expect(
            run.log.filter((e) => e.seat === seat && e.action.kind === 'concede'),
            tag,
          ).toEqual([]);
          // One reason record per decision the agent was asked.
          expect(watch.inner.reasons.length, tag).toBe(
            run.log.filter((e) => e.seat === seat).length +
              run.rejected.filter((r) => r.seat === seat).length,
          );
          if (run.result?.kind === 'win' && run.result.winner === seat) wins += 1;
        }
        // A floor, not a measure of strength (issue 21): the small soak decks are unbalanced on purpose (some
        // style pairs give the random agent the better deck), so the rate here is 0.75 to 0.8 whatever the agent
        // does, and it moves with every card added to the pool. The strength claim is the paired arena test below.
        if (opponent === 'random') expect(wins / GAMES).toBeGreaterThanOrEqual(SOAK_FLOOR);
      },
      soakTimeout(TIMEOUT_MS),
    );
  }
});

describe('HeuristicAgent strength against RandomLegalAgent (issue 21, D-163)', () => {
  // On the arena decks with the same list on both seats and every seed played twice with the seats swapped,
  // deck and seat luck cancel out, so the rate measures the agent: 200 of 200 games at the time of writing
  // (`pnpm ai:arena --a heuristic --b random --games 200 --seed 1`). SPEC A11 asks for 95% in 200 games; 20
  // games keep the run short, and 0.9 leaves two lost games of room.
  test(
    'wins at least 90% of 20 paired games on the arena decks',
    async () => {
      const r = await playMatch({
        a: AGENT_FACTORIES.heuristic,
        b: AGENT_FACTORIES.random,
        decks: ARENA_DECKS,
        games: 20,
        baseSeed: 1,
      });
      expect(r.unfinished).toBe(0);
      expect(r.wins.a / 20).toBeGreaterThanOrEqual(0.9);
    },
    soakTimeout(TIMEOUT_MS),
  );
});

describe('HeuristicAgent in the match harness', () => {
  test(
    'plays paired games against every other agent and itself with no fault',
    async () => {
      for (const b of ['random', 'greedy', 'casual', 'heuristic'] as const) {
        const r = await playMatch({
          a: AGENT_FACTORIES.heuristic,
          b: AGENT_FACTORIES[b],
          decks: ARENA_DECKS,
          games: 4,
          baseSeed: 31,
        });
        expect(r.fallbacks, b).toBe(0);
        expect(r.rejectedActions, b).toBe(0);
        expect(r.unfinished, b).toBe(0);
        expect(r.wins.a + r.wins.b + r.draws, b).toBe(4);
      }
    },
    soakTimeout(TIMEOUT_MS),
  );
});
