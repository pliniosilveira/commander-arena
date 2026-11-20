// The N-seat probe (issue 362): plays 3 or 4 seat games with one agent kind per seat and reports how
// each ended, so the crashes of the engine gaps of #336 (CR 800.4) can be replayed from their seeds.
//
//   node tools/ai/multiplayer-probe.ts --players 3 --games 20 --agent random [--seed 1] [--verbose]
//
// --players  3 | 4
// --agent    random | casual | greedy | heuristic (the AI still reasons about one opponent, so this probes
//            the engine, not the quality of play)
// --games    how many games (default 10); game i uses seed S + i
// --seed     the first game seed (default 1)
// --verbose  print one line per game
//
// Not part of any test tier. Games run with `allowMoreThanTwoSeats` on, which the app never sets.

import '../corpus/register.ts';
import { parseArgs } from 'node:util';

const KINDS = ['random', 'casual', 'greedy', 'heuristic'] as const;

const { values } = parseArgs({
  options: {
    players: { type: 'string', default: '3' },
    games: { type: 'string', default: '10' },
    agent: { type: 'string', default: 'random' },
    seed: { type: 'string', default: '1' },
    verbose: { type: 'boolean', default: false },
  },
});
const players = Number(values.players);
const games = Number(values.games);
const baseSeed = Number(values.seed);
const kind = KINDS.find((k) => k === values.agent);
if (players !== 3 && players !== 4) fail('--players must be 3 or 4');
if (!Number.isInteger(games) || games < 1 || !Number.isInteger(baseSeed)) {
  fail('--games must be a positive whole number and --seed a whole number');
}
if (kind === undefined) fail(`--agent must be one of ${KINDS.join(', ')}`);

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(2);
}

const { AGENT_FACTORIES, ARENA_DECKS, MATCH_LIMITS, runGame } = await import('@commander-arena/ai');
const factory = AGENT_FACTORIES[kind as (typeof KINDS)[number]];

const outcomes = new Map<string, number[]>();
const note = (key: string, seed: number) => outcomes.set(key, [...(outcomes.get(key) ?? []), seed]);

for (let i = 0; i < games; i += 1) {
  const seed = baseSeed + i;
  const decks = Array.from(
    { length: players },
    (_, s) => ARENA_DECKS[(i + s) % ARENA_DECKS.length],
  );
  const config = {
    seed,
    decks: decks.filter((d): d is NonNullable<typeof d> => d !== undefined),
    allowMoreThanTwoSeats: true,
  };
  const agents = Array.from({ length: players }, (_, s) => factory.create(seed * 10 + s));
  let key: string;
  try {
    const run = await runGame(config, agents, MATCH_LIMITS);
    key = run.reason === 'result' ? `result (${run.result?.kind ?? 'none'})` : run.reason;
    if (run.agentErrors.length > 0) key += `; ${run.agentErrors[0]}`;
    if (values.verbose) {
      process.stdout.write(
        `seed ${seed}: ${key}, turn ${run.state.turn.number}, ${run.log.length} actions\n`,
      );
    }
  } catch (error) {
    key = `crash: ${error instanceof Error ? error.message : String(error)}`;
    if (values.verbose) process.stdout.write(`seed ${seed}: ${key}\n`);
  }
  note(key, seed);
}

process.stdout.write(`${players} seats, ${games} games, ${kind} agents, seeds from ${baseSeed}\n`);
for (const [key, seeds] of outcomes) {
  process.stdout.write(
    `${String(seeds.length).padStart(5)}  ${key}  (seeds ${seeds.join(', ')})\n`,
  );
}
