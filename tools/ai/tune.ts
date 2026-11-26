// Self-play tuning of the HeuristicAgent's weights (issue 624, phase 4): SPSA (`spsa.ts`) over a subset of
// `AgentWeights` (packages/ai/src/weights.ts), played in this process on the real precons.
//
//   node tools/ai/tune.ts --iterations 200 --pairs 8 --seed 1 --out tuned.json [--fields evaluator,attacks]
//   node tools/ai/tune.ts --iterations 400 --resume tuned.json --out tuned.json
//
// --fields      comma-separated dotted paths or prefixes of AgentWeights (`evaluator.land`, `attacks`);
//               default: DEFAULT_FIELDS below
// --iterations  the iteration to stop before (default 100); with --resume, the run continues up to it
// --pairs       pairs per iteration (default 8): each pair is one seed played twice, seats swapped
// --workers     processes that play the pairs of an iteration in parallel (default 1); the same flags give the
//               same weights whatever the number of workers: use the machine's core count
// --seed        the run seed (default 1): the signs of the perturbations, and the first game seed
// --a, --c, --A the SPSA gains (spsa.ts; defaults 0.5, 0.2, 5): step size, perturbation size in
//               normalised units (0.2 = 20% of a field's default), stability constant
// --out         the current theta as a partial AgentWeights, rewritten after every iteration, with the
//               run's state beside it in `<out>.state.json` (iteration, next game seed, exact theta)
// --resume      a weights file this tool wrote: continue from its state file, so a stopped run goes on
//               exactly as if it had not stopped (the same flags give the same run)
// --max-turns, --max-actions  the limits of one game (defaults: MATCH_LIMITS)
//
// Each iteration k plays theta+ (theta + c_k delta) against theta- (theta - c_k delta), both this tree's
// HeuristicAgent, on `--pairs` pairs of fresh game seeds: the run's seeds are consecutive from `--seed`
// and never reused, and pair j of the run is played on precon j mod the number of precons. theta+'s mean
// score s gives the gradient estimate (2 s - 1) / (2 c_k delta_i). The agents get the runner's logical
// clock, so a result does not depend on the speed of the machine. One line per iteration goes to stderr, with
// the new value of the eight fields that moved most.
//
// DEFAULT_FIELDS: the evaluator's main trade-offs (life, board pressure, cards in hand, lands, a creature
// body), which every decision's board score reads; the crack-back terms, which decide how much an attack
// risks; and the two gates of the main phase (the delta floor and what removal is worth). Left out:
// whole-number thresholds (land counts, the commander tax, mulligan lands), which a small continuous step
// rarely crosses and which make the gradient estimate noisy; the keyword table, many small terms that
// rarely decide a game; and the margins of a few hundredths, which matter little next to these.
//
// VALIDATION. A tuned file is accepted only when both hold:
//   1. After `node tools/ai/baseline.ts --ref HEAD` (the baseline is this commit's agent with its default
//      weights), `node tools/ai/benchmark.ts --candidate-weights tuned.json --seed 100000` gives the
//      verdict "better", on seeds the tuning never played: the tuner logs the range it used.
//   2. The blunder suite passes with the tuned weights:
//      `AI_WEIGHTS=tuned.json pnpm test:focus -- packages/ai/test/blunders`.
// The manual workflow `AI tune` runs this tool on one runner and uploads the weights file.

import '../corpus/register.ts';
import { type ChildProcess, fork } from 'node:child_process';
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import type { AgentFactory, PartialWeights } from '@commander-arena/ai';
import { gameScore } from './benchmark-stats.ts';
import {
  DEFAULT_GAINS,
  flatten,
  type Gains,
  largestChanges,
  normalise,
  perturb,
  perturbationSize,
  rawValues,
  selectPaths,
  signs,
  type TunedField,
  tunedField,
  unflatten,
  update,
} from './spsa.ts';
import type { WorkReply, WorkRequest } from './tune-worker.ts';

export const DEFAULT_FIELDS = [
  'evaluator.lifeCap',
  'evaluator.pressure',
  'evaluator.handCard',
  'evaluator.land',
  'evaluator.bodyBase',
  'evaluator.bodyPower',
  'evaluator.bodyToughness',
  'attacks.crackWeight',
  'attacks.crackLethalShare',
  'main.deltaFloor',
  'main.removalShare',
];

/** How many fields' moves one iteration's log line lists (all of them in a run of a handful of fields). */
const LOGGED_CHANGES = 8;

const { values } = parseArgs({
  options: {
    fields: { type: 'string' },
    iterations: { type: 'string', default: '100' },
    pairs: { type: 'string', default: '8' },
    workers: { type: 'string', default: '1' },
    seed: { type: 'string' },
    a: { type: 'string' },
    c: { type: 'string' },
    A: { type: 'string' },
    out: { type: 'string' },
    resume: { type: 'string' },
    'max-turns': { type: 'string' },
    'max-actions': { type: 'string' },
  },
});

const fail = (message: string): never => {
  process.stderr.write(`${message}\n`);
  process.exit(2);
};
const whole = (text: string | undefined, name: string, min: number): number | undefined => {
  if (text === undefined) return undefined;
  const n = Number(text);
  if (!Number.isInteger(n) || n < min) fail(`--${name} must be a whole number >= ${min}`);
  return n;
};
const real = (text: string | undefined, name: string, fallback: number): number => {
  if (text === undefined) return fallback;
  const n = Number(text);
  if (!Number.isFinite(n) || n < 0) fail(`--${name} must be a number >= 0`);
  return n;
};

/** What `<out>.state.json` holds: enough to continue a run exactly. */
interface TuneState {
  readonly version: 1;
  readonly seed: number;
  readonly gains: Gains;
  /** The tuned fields; their bounds are rebuilt with `tunedField` (JSON has no infinity). */
  readonly fields: readonly TunedField[];
  /** The next iteration to play. */
  readonly iteration: number;
  /** The first game seed of the next iteration. */
  readonly nextSeed: number;
  /** The first game seed of the run. */
  readonly firstSeed: number;
  /** theta in normalised units, one per field. */
  readonly theta: readonly number[];
}

const stateFile = (weightsFile: string): string => `${weightsFile}.state.json`;

function readState(file: string): TuneState {
  try {
    const state = JSON.parse(readFileSync(stateFile(file), 'utf8')) as TuneState;
    if (state.version !== 1 || state.fields.length !== state.theta.length)
      throw new Error('bad state');
    return { ...state, fields: state.fields.map((f) => tunedField(f.path, f.initial)) };
  } catch (error) {
    return fail(`--resume: cannot read ${stateFile(file)}: ${String(error)}`);
  }
}

/** Write a file whole: a run stopped mid-write never leaves half a file. */
function writeWhole(file: string, text: string): void {
  writeFileSync(`${file}.tmp`, text);
  renameSync(`${file}.tmp`, file);
}

const iterations = whole(values.iterations, 'iterations', 1) as number;
const pairs = whole(values.pairs, 'pairs', 1) as number;
const workers = whole(values.workers, 'workers', 1) as number;
const maxTurns = whole(values['max-turns'], 'max-turns', 1);
const maxActions = whole(values['max-actions'], 'max-actions', 1);

const { DEFAULT_WEIGHTS, HeuristicAgent, MATCH_LIMITS, playMatch, withWeights } = await import(
  '@commander-arena/ai'
);
const { loadPreconDecks, mirrorPairs } = await import('./precons.ts');

let state: TuneState;
if (values.resume !== undefined) {
  state = readState(values.resume);
  for (const flag of ['fields', 'seed', 'a', 'c', 'A'] as const) {
    if (values[flag] !== undefined) fail(`--${flag} is taken from the resumed run`);
  }
} else {
  const seed = whole(values.seed, 'seed', 0) ?? 1;
  const defaults = flatten(DEFAULT_WEIGHTS);
  let paths: string[] = [];
  try {
    paths = selectPaths(
      [...defaults.keys()],
      values.fields === undefined ? DEFAULT_FIELDS : values.fields.split(',').map((f) => f.trim()),
    );
  } catch (error) {
    fail(`--fields: ${error instanceof Error ? error.message : String(error)}`);
  }
  const fields = paths.map((p) => tunedField(p, defaults.get(p) as number));
  state = {
    version: 1,
    seed,
    gains: {
      a: real(values.a, 'a', DEFAULT_GAINS.a),
      c: real(values.c, 'c', DEFAULT_GAINS.c),
      A: real(values.A, 'A', DEFAULT_GAINS.A),
    },
    fields,
    iteration: 0,
    nextSeed: seed,
    firstSeed: seed,
    theta: fields.map((f) => normalise(f, f.initial)),
  };
}

const loaded = await loadPreconDecks();
for (const problem of loaded.problems) process.stderr.write(`precon left out: ${problem}\n`);
if (loaded.decks.length === 0) fail('no playable precon snapshot');
const decks = mirrorPairs(loaded.decks);

const agentOf = (label: string, theta: readonly number[]): AgentFactory => {
  const weights = withWeights(unflatten(rawValues(state.fields, theta)) as PartialWeights);
  return { label, create: (s) => new HeuristicAgent({ seed: s, weights }) };
};

const limits = {
  maxTurns: maxTurns ?? MATCH_LIMITS.maxTurns,
  maxActions: maxActions ?? MATCH_LIMITS.maxActions,
};

// `--workers n` (n > 1): the pairs of an iteration are dealt to n worker processes (`tune-worker.ts`). Each
// pair is played on the same seeds as in one process and the scores are summed, so a run gives the same
// weights whatever the number of workers.
const pool: ChildProcess[] = [];
if (workers > 1) {
  const script = fileURLToPath(new URL('./tune-worker.ts', import.meta.url));
  for (let i = 0; i < workers; i += 1) {
    const child = fork(script, [], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
    await new Promise<void>((resolveReady, rejectReady) => {
      child.once('message', () => resolveReady());
      child.once('exit', (code) => rejectReady(new Error(`worker exited with ${code}`)));
    });
    pool.push(child);
  }
}
let requestId = 0;
async function playOnWorkers(
  work: readonly { gameSeed: number; deck: number }[],
  plus: PartialWeights,
  minus: PartialWeights,
): Promise<('a' | 'b' | null)[]> {
  const chunks = pool.map((_, i) => work.filter((_, j) => j % pool.length === i));
  const replies = await Promise.all(
    pool.map(
      (child, i) =>
        new Promise<readonly ('a' | 'b' | null)[]>((done, failed) => {
          requestId += 1;
          const id = requestId;
          const onMessage = (reply: WorkReply): void => {
            if (reply.id !== id) return;
            child.off('message', onMessage);
            done(reply.winners);
          };
          child.on('message', onMessage);
          child.once('exit', (code) => failed(new Error(`worker exited with ${code}`)));
          child.send({ id, plus, minus, pairs: chunks[i] ?? [], limits } satisfies WorkRequest);
        }),
    ),
  );
  return replies.flat();
}

const fmt = (x: number): string => Number(x.toPrecision(4)).toString();

process.stderr.write(
  `tuning ${state.fields.length} fields (${state.fields.map((f) => f.path).join(', ')}), ` +
    `iterations ${state.iteration}..${iterations - 1}, ${pairs} pairs each\n`,
);

while (state.iteration < iterations) {
  const k = state.iteration;
  const delta = signs(state.seed, k, state.fields.length);
  const ck = perturbationSize(state.gains, k);
  const { plus, minus } = perturb(state.fields, state.theta, delta, ck);
  const a = agentOf('theta+', plus);
  const b = agentOf('theta-', minus);
  let total = 0;
  const tally = { won: 0, lost: 0, other: 0 };
  const work = Array.from({ length: pairs }, (_, j) => {
    const gameSeed = state.nextSeed + j;
    return { gameSeed, deck: (gameSeed - state.firstSeed) % decks.length };
  });
  let winners: ('a' | 'b' | null)[] = [];
  if (pool.length > 0) {
    winners = await playOnWorkers(
      work,
      unflatten(rawValues(state.fields, plus)) as PartialWeights,
      unflatten(rawValues(state.fields, minus)) as PartialWeights,
    );
  } else {
    for (const pair of work) {
      const result = await playMatch({
        a,
        b,
        decks: [decks[pair.deck] as (typeof decks)[number]],
        games: 2,
        baseSeed: pair.gameSeed,
        limits,
      });
      for (const game of result.log) winners.push(game.winner);
    }
  }
  for (const winner of winners) {
    total += gameScore(winner === 'a' ? 'win' : winner === 'b' ? 'loss' : 'draw');
    tally[winner === 'a' ? 'won' : winner === 'b' ? 'lost' : 'other'] += 1;
  }
  const score = total / (2 * pairs);
  const theta = update(state.fields, state.theta, delta, 2 * score - 1, state.gains, k);
  const moved = largestChanges(state.fields, state.theta, theta, LOGGED_CHANGES)
    .map((m) => `${m.path} ${fmt(m.from)} -> ${fmt(m.to)}`)
    .join(', ');
  process.stderr.write(
    `iteration ${k}: seeds ${state.nextSeed}..${state.nextSeed + pairs - 1}, ` +
      `theta+ scored ${fmt(score)} (${tally.won} won, ${tally.lost} lost, ${tally.other} drawn or unfinished); ` +
      `${moved}\n`,
  );
  state = { ...state, iteration: k + 1, nextSeed: state.nextSeed + pairs, theta };
  if (values.out !== undefined) {
    writeWhole(
      values.out,
      `${JSON.stringify(unflatten(rawValues(state.fields, theta)), null, 1)}\n`,
    );
    const fields = state.fields.map((f) => ({ path: f.path, initial: f.initial }));
    writeWhole(stateFile(values.out), `${JSON.stringify({ ...state, fields }, null, 1)}\n`);
  }
}

for (const child of pool) child.kill();
process.stdout.write(
  `${JSON.stringify(unflatten(rawValues(state.fields, state.theta)), null, 1)}\n`,
);
process.stderr.write(
  `done: game seeds ${state.firstSeed}..${state.nextSeed - 1} were used; validate on others\n`,
);
