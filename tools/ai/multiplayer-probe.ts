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
// --precons  play the real precons of apps/web/src/precons/snapshots (seat i gets precon (game + i) mod n)
//            instead of the arena decks; the investigation of docs/MORE_OPPONENTS_INVESTIGATION.md used them
// --max-turns, --max-actions  the limits of one game (default 100 and 8000 with --precons, else MATCH_LIMITS)
// --verbose  print one line per game
//
// Besides how each game ended, the probe counts what the agents' views show about a player who has lost
// (CR 800.4a): permanents still under them, them being the active seat, a decision asked of them, a
// stack object they control. Decisions counted, not games.
//
// Not part of any test tier. The app itself still plays two seats.

import '../corpus/register.ts';
import { parseArgs } from 'node:util';
import { newLostSeatCounters, watchLostSeats } from './lost-seat-counters.ts';

const KINDS = ['random', 'casual', 'greedy', 'heuristic'] as const;

const { values } = parseArgs({
  options: {
    players: { type: 'string', default: '3' },
    games: { type: 'string', default: '10' },
    agent: { type: 'string', default: 'random' },
    seed: { type: 'string', default: '1' },
    verbose: { type: 'boolean', default: false },
    precons: { type: 'boolean', default: false },
    'max-turns': { type: 'string' },
    'max-actions': { type: 'string' },
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
const limitOf = (text: string | undefined, fallback: number, name: string): number => {
  if (text === undefined) return fallback;
  const n = Number(text);
  if (!Number.isInteger(n) || n < 1) fail(`--${name} must be a positive whole number`);
  return n;
};
const limits = {
  maxTurns: limitOf(values['max-turns'], values.precons ? 100 : MATCH_LIMITS.maxTurns, 'max-turns'),
  maxActions: limitOf(
    values['max-actions'],
    values.precons ? 8000 : MATCH_LIMITS.maxActions,
    'max-actions',
  ),
};
let pool: readonly (typeof ARENA_DECKS)[number][] = ARENA_DECKS;
if (values.precons) {
  const { loadPreconDecks } = await import('./precons.ts');
  const loaded = await loadPreconDecks();
  for (const problem of loaded.problems) process.stderr.write(`${problem}\n`);
  pool = loaded.decks.map((d) => d.deck);
  if (pool.length < players) fail('--precons needs at least as many playable precons as players');
}

const anomalies = newLostSeatCounters();
const factory = AGENT_FACTORIES[kind as (typeof KINDS)[number]];

const totals = { rejected: 0, fallbacks: 0, turns: 0 };
const rejections = new Set<string>();
const outcomes = new Map<string, number[]>();
const note = (key: string, seed: number) => outcomes.set(key, [...(outcomes.get(key) ?? []), seed]);

for (let i = 0; i < games; i += 1) {
  const seed = baseSeed + i;
  const decks = Array.from({ length: players }, (_, s) => pool[(i + s) % pool.length]);
  const config = {
    seed,
    decks: decks.filter((d): d is NonNullable<typeof d> => d !== undefined),
  };
  const agents = Array.from({ length: players }, (_, s) =>
    watchLostSeats(factory.create(seed * 10 + s), anomalies),
  );
  let key: string;
  try {
    const run = await runGame(config, agents, limits);
    key = run.reason === 'result' ? `result (${run.result?.kind ?? 'none'})` : run.reason;
    if (run.agentErrors.length > 0) key += `; ${run.agentErrors[0]}`;
    totals.rejected += run.rejected.length;
    totals.fallbacks += run.counters.fallbacks;
    totals.turns += run.state.turn.number;
    for (const r of run.rejected.slice(0, 2)) rejections.add(r.error);
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
process.stdout.write(
  `rejected actions ${totals.rejected}, fallbacks ${totals.fallbacks}, average final turn ${(totals.turns / games).toFixed(1)}, limits ${limits.maxTurns} turns / ${limits.maxActions} actions\n`,
);
if (rejections.size > 0)
  process.stdout.write(`rejections sampled: ${[...rejections].join(' | ')}\n`);
process.stdout.write(`views of players who have lost (decisions): ${JSON.stringify(anomalies)}\n`);
