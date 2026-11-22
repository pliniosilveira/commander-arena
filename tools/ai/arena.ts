// Entry point of `pnpm ai:arena`: plays two agents against each other on paired seeds with the seats
// swapped (D-162) and prints the table.
//
//   node tools/ai/arena.ts --a casual --b greedy --games 200 --seed 1
//
// --a, --b   random | casual | greedy | heuristic (default casual and greedy)
// --seats    2 (default) | 3 | 4. With 3 or 4 seats `--agents` lists one agent for each seat of the first game
//            (default: `--a` and `--b` cycled), every seed is played once for each rotation of the agents so each
//            agent sits in every seat, and `--games` is a multiple of the number of seats (issue 482). `--pairing`
//            is for two seats.
// --agents   with --seats 3 or 4: a comma-separated list, e.g. casual,greedy,heuristic
// --games    total games, an even number: each seed is played twice (default 200)
// --seed     the first game seed (default 1)
// --precons  play on the real precons of apps/web/src/precons/snapshots instead of the arena decks (D-164). With
//            --seats 3|4 every seat gets its own precon (set i gives seat k the precon i + k), and the decks stay with
//            the seat when the agents rotate (issue 527)
// --pairing  with --precons: `mirror` (default) gives both seats the same precon, one per pair index;
//            `cross` gives seat 0 one precon and seat 1 another, every ordered pair of two different
//            precons once per cycle. The decks stay with the seat when the agents swap seats.
// --max-turns, --max-actions  the limits of one game (defaults: MATCH_LIMITS; the precon games are longer)
// --log-slow <ms>  print one line per decision that took longer than this (agent, turn, decision kind, time)
// --real-clock  hand the agents a real clock (performance.now) so their time budget is live; the default is
//            the logical clock of the runner, which keeps a result independent of the machine's speed
//
// The decision time of every agent (mean and slowest) is always measured around `decide` here, in this
// script, where reading a real clock is allowed; the agents themselves only ever see `ctx.now`.
//
// The workspace packages are written for a bundler (imports without file extensions); the hooks of
// tools/corpus/register.ts retry such imports with ".ts", so the AI package is imported only after
// they are in place.

import '../corpus/register.ts';
import { parseArgs } from 'node:util';
import type { Agent, AgentFactory, MatchDeck, TableDeck } from '@commander-arena/ai';
import {
  type DecisionTimes,
  formatMatch,
  formatRound,
  formatTable,
  formatTimes,
  percentile,
} from './format.ts';

const KINDS = ['random', 'casual', 'greedy', 'heuristic'] as const;
type Kind = (typeof KINDS)[number];

const { values } = parseArgs({
  options: {
    a: { type: 'string', default: 'casual' },
    b: { type: 'string', default: 'greedy' },
    games: { type: 'string', default: '200' },
    seed: { type: 'string', default: '1' },
    'real-clock': { type: 'boolean', default: false },
    'log-slow': { type: 'string' },
    seats: { type: 'string', default: '2' },
    agents: { type: 'string' },
    precons: { type: 'boolean', default: false },
    pairing: { type: 'string', default: 'mirror' },
    'max-turns': { type: 'string' },
    'max-actions': { type: 'string' },
  },
});

const isKind = (s: string): s is Kind => (KINDS as readonly string[]).includes(s);
const games = Number(values.games);
const seed = Number(values.seed);
if (!isKind(values.a) || !isKind(values.b)) {
  process.stderr.write(`--a and --b must be one of ${KINDS.join(', ')}\n`);
  process.exit(2);
}
const seats = Number(values.seats);
if (seats !== 2 && seats !== 3 && seats !== 4) {
  process.stderr.write('--seats must be 2, 3 or 4\n');
  process.exit(2);
}
if (seats === 2 && values.agents !== undefined) {
  process.stderr.write('--agents is for --seats 3 or 4; use --a and --b for two seats\n');
  process.exit(2);
}
if (seats > 2 && values.pairing !== 'mirror') {
  process.stderr.write(
    '--pairing is for two seats; with --seats 3|4 --precons every seat gets its own precon\n',
  );
  process.exit(2);
}
if (!Number.isInteger(games) || games < seats || games % seats !== 0 || !Number.isInteger(seed)) {
  process.stderr.write(
    `--games must be a multiple of the number of seats (${seats}) and --seed a whole number\n`,
  );
  process.exit(2);
}

if (values.pairing !== 'mirror' && values.pairing !== 'cross') {
  process.stderr.write('--pairing must be mirror or cross\n');
  process.exit(2);
}
const limitOf = (text: string | undefined, name: string): number | undefined => {
  if (text === undefined) return undefined;
  const n = Number(text);
  if (!Number.isInteger(n) || n < 1) {
    process.stderr.write(`--${name} must be a positive whole number\n`);
    process.exit(2);
  }
  return n;
};
const logSlowMs = limitOf(values['log-slow'], 'log-slow');
const maxTurns = limitOf(values['max-turns'], 'max-turns');
const maxActions = limitOf(values['max-actions'], 'max-actions');

const {
  AGENT_FACTORIES,
  ARENA_DECKS,
  DEFAULT_BUDGET_MS,
  MATCH_LIMITS,
  isExplaining,
  playMatch,
  playTable,
} = await import('@commander-arena/ai');

/** Measures the time of every `decide` of the agents it makes, per label. */
const stats = new Map<
  string,
  { decisions: number; totalMs: number; slowestMs: number; overBudget: number; samples: number[] }
>();
function timed(factory: AgentFactory): AgentFactory {
  return {
    label: factory.label,
    create: (seed) => {
      const inner = factory.create(seed);
      const record = stats.get(factory.label) ?? {
        decisions: 0,
        totalMs: 0,
        slowestMs: 0,
        overBudget: 0,
        samples: [] as number[],
      };
      stats.set(factory.label, record);
      const wrapper: Agent = {
        get name() {
          return inner.name;
        },
        async decide(view, decision, ctx) {
          const start = performance.now();
          const action = await inner.decide(view, decision, ctx);
          const ms = performance.now() - start;
          record.decisions += 1;
          record.totalMs += ms;
          record.samples.push(ms);
          if (ms > record.slowestMs) record.slowestMs = ms;
          if (ms > DEFAULT_BUDGET_MS) record.overBudget += 1;
          if (logSlowMs !== undefined && ms > logSlowMs) {
            process.stdout.write(
              `slow decision: ${factory.label} ${ms.toFixed(1)} ms, turn ${view.turn}, ${decision.kind}, agent seed ${seed}\n`,
            );
          }
          return action;
        },
      };
      if (inner.fallbacks !== undefined) {
        Object.defineProperty(wrapper, 'fallbacks', { get: () => inner.fallbacks });
      }
      if (isExplaining(inner)) {
        Object.defineProperty(wrapper, 'reasons', { get: () => inner.reasons });
      }
      return wrapper;
    },
  };
}

let decks: readonly MatchDeck[] = ARENA_DECKS;
let tableDecks: readonly TableDeck[] = ARENA_DECKS.map((d) => (Array.isArray(d) ? d[0] : d));
let deckNote = '';
if (values.precons) {
  // After the hooks are registered: this reaches the web app's import modules and the workspace packages.
  const { crossPairs, loadPreconDecks, mirrorPairs, tableSets } = await import('./precons.ts');
  const loaded = await loadPreconDecks();
  for (const problem of loaded.problems) process.stderr.write(`precon left out: ${problem}\n`);
  if (loaded.decks.length < seats) {
    process.stderr.write(
      `--precons with ${seats} seats needs at least ${Math.max(seats, 2)} playable precon snapshots\n`,
    );
    process.exit(2);
  }
  if (seats > 2) {
    // One precon for each seat; the decks stay with the seat when the agents rotate (issue 527).
    tableDecks = tableSets(loaded.decks, seats);
    deckNote = `precons (one for each seat): ${loaded.decks.map((d) => d.id).join(', ')}; ${tableDecks.length} sets cycled by seed`;
  } else {
    decks = values.pairing === 'cross' ? crossPairs(loaded.decks) : mirrorPairs(loaded.decks);
    deckNote = `precons (${values.pairing}): ${loaded.decks.map((d) => d.id).join(', ')}; ${decks.length} deck entries cycled by seed`;
  }
}

if (seats > 2) {
  const kinds = (values.agents ?? `${values.a},${values.b}`).split(',').map((k) => k.trim());
  if (!kinds.every(isKind) || kinds.length < 2) {
    process.stderr.write(`--agents must list agents among ${KINDS.join(', ')}\n`);
    process.exit(2);
  }
  // One agent for each seat of the first game: the list cycled to the number of seats.
  const seated = Array.from({ length: seats }, (_, seat) => kinds[seat % kinds.length] as Kind);
  const tableResult = await playTable({
    agents: seated.map((k) => timed(AGENT_FACTORIES[k])),
    decks: tableDecks,
    limits: {
      maxTurns: maxTurns ?? MATCH_LIMITS.maxTurns,
      maxActions: maxActions ?? MATCH_LIMITS.maxActions,
    },
    games,
    baseSeed: seed,
    ...(values['real-clock'] ? { now: () => performance.now() } : {}),
  });
  const tableCommand = `node tools/ai/arena.ts --seats ${seats} --agents ${seated.join(',')} --games ${games} --seed ${seed}${values['real-clock'] ? ' --real-clock' : ''}${values.precons ? ' --precons' : ''}${maxTurns === undefined ? '' : ` --max-turns ${maxTurns}`}${maxActions === undefined ? '' : ` --max-actions ${maxActions}`}${logSlowMs === undefined ? '' : ` --log-slow ${logSlowMs}`}`;
  const tableTimes: DecisionTimes[] = [...stats].map(([label, t]) => ({
    label,
    ...t,
    p95Ms: percentile(t.samples, 0.95),
  }));
  process.stdout.write(`${formatTable(tableResult, { seed, command: tableCommand })}\n`);
  if (deckNote !== '') process.stdout.write(`${deckNote}\n`);
  process.stdout.write(
    `unfinished games: ${
      tableResult.log
        .filter((g) => g.end !== 'result')
        .map((g) => `seed ${g.seed} rotation ${g.rotation} ${g.end} turn ${g.turns}`)
        .join('; ') || 'none'
    }\n`,
  );
  process.stdout.write(`${formatTimes(tableTimes, DEFAULT_BUDGET_MS)}\n`);
  process.stdout.write(
    `${formatRound({
      decisions: tableTimes.reduce((n, t) => n + t.decisions, 0),
      ms: tableTimes.reduce((n, t) => n + t.totalMs, 0),
      turns: tableResult.averageTurns * tableResult.games,
      seats,
    })}\n`,
  );
  process.exit(0);
}

const result = await playMatch({
  a: timed(AGENT_FACTORIES[values.a]),
  b: timed(AGENT_FACTORIES[values.b]),
  decks,
  limits: {
    maxTurns: maxTurns ?? MATCH_LIMITS.maxTurns,
    maxActions: maxActions ?? MATCH_LIMITS.maxActions,
  },
  games,
  baseSeed: seed,
  ...(values['real-clock'] ? { now: () => performance.now() } : {}),
});
const command = `node tools/ai/arena.ts --a ${values.a} --b ${values.b} --games ${games} --seed ${seed}${values['real-clock'] ? ' --real-clock' : ''}${values.precons ? ` --precons --pairing ${values.pairing}` : ''}${maxTurns === undefined ? '' : ` --max-turns ${maxTurns}`}${maxActions === undefined ? '' : ` --max-actions ${maxActions}`}${logSlowMs === undefined ? '' : ` --log-slow ${logSlowMs}`}`;
const times: DecisionTimes[] = [...stats].map(([label, t]) => ({
  label,
  ...t,
  p95Ms: percentile(t.samples, 0.95),
}));
process.stdout.write(`${formatMatch(result, { seed, command })}\n`);
if (deckNote !== '') process.stdout.write(`${deckNote}\n`);
process.stdout.write(
  `unfinished games: ${
    result.log
      .filter((g) => g.end !== 'result')
      .map((g) => `seed ${g.seed} deck ${g.deck} a-seat ${g.aSeat} ${g.end} turn ${g.turns}`)
      .join('; ') || 'none'
  }\n`,
);
process.stdout.write(`${formatTimes(times, DEFAULT_BUDGET_MS)}\n`);
process.stdout.write(
  `${formatRound({
    decisions: times.reduce((n, t) => n + t.decisions, 0),
    ms: times.reduce((n, t) => n + t.totalMs, 0),
    turns: result.averageTurns * result.games,
    seats: 2,
  })}\n`,
);
