// Benchmark of the engine on big late-game boards (M45, D-173): the real precons through the web import
// pipeline, played by the casual agent to turn 20 or the end, the state of each game with the most
// permanents kept, and then timed: `getView` (which derives every object), `getLegalActions`,
// `applyAction` and the replay of the whole turn with the biggest board (combat steps apart).
//
//   node tools/perf/derive-bench.ts [--seeds 12] [--reps 15] [--max-turn 20] [--keep 4] [--first-seed 100] [--seed-list 127,116] [--json]
//
// It lives in tools/ so it may read a real clock (`performance.now`); the engine and the AI never do.
// Timings depend on the machine: only compare runs made one after the other on the same one.
// A fresh copy of the state (`structuredClone`) is made outside the timer for every cold measurement,
// so no cache keyed by a state object can be warm: that is what a new state costs in play.

import '../corpus/register.ts';
import { parseArgs } from 'node:util';
import type { Action, GameState, SeatId } from '@commander-arena/engine';

const { values } = parseArgs({
  options: {
    seeds: { type: 'string', default: '12' },
    reps: { type: 'string', default: '15' },
    'max-turn': { type: 'string', default: '20' },
    keep: { type: 'string', default: '4' },
    'first-seed': { type: 'string', default: '100' },
    'seed-list': { type: 'string' },
    json: { type: 'boolean', default: false },
  },
});
const SEEDS = Number(values.seeds);
const REPS = Number(values.reps);
const MAX_TURN = Number(values['max-turn']);
const KEEP = Number(values.keep);
const FIRST_SEED = Number(values['first-seed']);
/** Seeds to play instead of `--seeds` consecutive ones, e.g. the ones a long run found the biggest boards in. */
const SEED_LIST = values['seed-list']?.split(',').map(Number);

const { applyAction, getLegalActions, getView } = await import('@commander-arena/engine');
const { AGENT_FACTORIES, runGame } = await import('@commander-arena/ai');
const { crossPairs, loadPreconDecks } = await import('./../ai/precons.ts');

const loaded = await loadPreconDecks();
for (const problem of loaded.problems) process.stderr.write(`precon left out: ${problem}\n`);
const pairs = crossPairs(loaded.decks);

interface Step {
  readonly before: GameState;
  readonly seat: SeatId;
  readonly action: Action;
}
interface Kept {
  readonly label: string;
  readonly permanents: number;
  readonly state: GameState;
  /** The steps of the whole turn the state belongs to. */
  readonly turn: readonly Step[];
}

// ---- 1. Play seeded games and keep the biggest boards.
const kept: Kept[] = [];
for (let i = 0; i < (SEED_LIST?.length ?? SEEDS); i++) {
  const seed = SEED_LIST?.[i] ?? FIRST_SEED + i;
  // The deck pairing follows the seed, so a run from another first seed plays the same games as in a long run.
  const decks = pairs[(seed - 100) % pairs.length];
  if (decks === undefined) continue;
  const run = await runGame(
    { seed, decks },
    [AGENT_FACTORIES.casual.create(2 * seed + 1), AGENT_FACTORIES.casual.create(2 * seed + 2)],
    { maxTurns: MAX_TURN, maxActions: 20000 },
  );
  // Replay through applyAction to see every state, then pick the turn with the biggest board.
  const { createGame } = await import('@commander-arena/engine');
  let state = createGame({ seed, decks }).state;
  const steps: Step[] = [];
  for (const entry of run.log) {
    const applied = applyAction(state, entry.seat, entry.action);
    if (!applied.ok) throw new Error(`replay rejected: ${applied.error}`);
    steps.push({ before: state, seat: entry.seat, action: entry.action });
    state = applied.state;
  }
  let best = -1;
  let bestTurn = 0;
  for (const s of steps) {
    if (s.before.battlefield.length > best) {
      best = s.before.battlefield.length;
      bestTurn = s.before.turn.number;
    }
  }
  const turn = steps.filter((s) => s.before.turn.number === bestTurn);
  // The state to time single operations on: the biggest board at a priority decision.
  const peak = turn
    .filter((s) => s.before.pending?.kind === 'priority')
    .reduce((a, b) => (b.before.battlefield.length > a.before.battlefield.length ? b : a));
  kept.push({
    label: `seed ${seed} turn ${bestTurn} (${run.reason})`,
    permanents: best,
    state: peak.before,
    turn,
  });
  process.stderr.write(`played seed ${seed}: ${steps.length} actions, peak ${best} permanents\n`);
}
kept.sort((a, b) => b.permanents - a.permanents);
const chosen = kept.slice(0, KEEP);

// ---- 2. Time.
class Samples {
  readonly xs: number[] = [];
  add(ms: number): void {
    this.xs.push(ms);
  }
  get mean(): number {
    return this.xs.reduce((a, b) => a + b, 0) / Math.max(1, this.xs.length);
  }
  get max(): number {
    return this.xs.reduce((a, b) => Math.max(a, b), 0);
  }
  percentile(p: number): number {
    const sorted = [...this.xs].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? 0;
  }
}
const time = <T>(f: () => T): [T, number] => {
  const t = performance.now();
  const r = f();
  return [r, performance.now() - t];
};

interface Row {
  readonly operation: string;
  readonly state: string;
  readonly permanents: number;
  readonly n: number;
  readonly mean: number;
  readonly p99: number;
  readonly slowest: number;
}
const rows: Row[] = [];
const push = (operation: string, k: Kept, s: Samples): void => {
  rows.push({
    operation,
    state: k.label,
    permanents: k.permanents,
    n: s.xs.length,
    mean: s.mean,
    p99: s.percentile(0.99),
    slowest: s.max,
  });
};
const COMBAT = new Set(['combat']);

for (const k of chosen) {
  const seat = k.state.pending?.seat ?? 0;
  // Warm up the JIT on this state's shape.
  for (let i = 0; i < 3; i++) {
    const copy = structuredClone(k.state);
    getView(copy, seat);
    getLegalActions(copy, seat);
  }
  const cold = new Samples();
  const warm = new Samples();
  const legal = new Samples();
  const apply = new Samples();
  for (let rep = 0; rep < REPS; rep++) {
    const copy = structuredClone(k.state);
    cold.add(time(() => getView(copy, seat))[1]);
    warm.add(time(() => getView(copy, seat))[1]);
    const fresh = structuredClone(k.state);
    const [actions, ms] = time(() => getLegalActions(fresh, seat));
    legal.add(ms);
    // applyAction for the first few distinct actions of this state, on fresh copies.
    for (const action of actions.slice(0, 5)) {
      const c = structuredClone(k.state);
      apply.add(time(() => applyAction(c, seat, action))[1]);
    }
  }
  push('getView, first call on a new state (derives every object)', k, cold);
  push('getView, second call on the same state', k, warm);
  push('getLegalActions, new state', k, legal);
  push('applyAction, first 5 legal actions, new state', k, apply);
}

// The replay of the biggest turn: every action of it through applyAction on the real chain of states.
const big = chosen[0];
if (big !== undefined) {
  const perAction = new Samples();
  const combatTotal = new Samples();
  const turnTotal = new Samples();
  const legalChain = new Samples();
  const byKind = new Map<string, Samples>();
  for (let rep = 0; rep < Math.max(3, Math.floor(REPS / 3)); rep++) {
    let state = structuredClone(big.turn[0]?.before as GameState);
    let all = 0;
    let combat = 0;
    for (const step of big.turn) {
      const phase = state.turn.phase;
      const [applied, ms] = time(() => applyAction(state, step.seat, step.action));
      if (!applied.ok) throw new Error(`replay of the turn rejected: ${applied.error}`);
      perAction.add(ms);
      const kindKey = `${step.action.kind} in ${state.turn.step}`;
      const kindSamples = byKind.get(kindKey) ?? new Samples();
      kindSamples.add(ms);
      byKind.set(kindKey, kindSamples);
      all += ms;
      if (COMBAT.has(String(phase))) combat += ms;
      const seatNow = applied.state.pending?.seat;
      if (seatNow !== undefined)
        legalChain.add(time(() => getLegalActions(applied.state, seatNow))[1]);
      state = applied.state;
    }
    turnTotal.add(all);
    combatTotal.add(combat);
  }
  for (const [kind, samples] of [...byKind].sort((a, b) => b[1].max - a[1].max).slice(0, 5)) {
    push(`  slowest kind: ${kind}`, big, samples);
  }
  push(`applyAction along the biggest turn (${big.turn.length} actions)`, big, perAction);
  push('getLegalActions along the biggest turn (state after each action)', big, legalChain);
  push('whole turn, sum of applyAction', big, turnTotal);
  push('combat steps of that turn, sum of applyAction', big, combatTotal);
}

if (values.json) {
  process.stdout.write(`${JSON.stringify(rows, null, 2)}\n`);
} else {
  const fmt = (x: number) => x.toFixed(2).padStart(9);
  process.stdout.write(
    `seeds ${SEED_LIST?.length ?? SEEDS}, reps ${REPS}, max turn ${MAX_TURN}, kept ${chosen.length} states; permanents: ${chosen
      .map((c) => c.permanents)
      .join(', ')}\n`,
  );
  process.stdout.write(
    `${'operation'.padEnd(70)} perm   n      mean(ms)   p99(ms)   slowest(ms)  state\n`,
  );
  for (const r of rows) {
    process.stdout.write(
      `${r.operation.padEnd(70)} ${String(r.permanents).padStart(4)} ${String(r.n).padStart(4)} ${fmt(r.mean)} ${fmt(r.p99)} ${fmt(r.slowest)}  ${r.state}\n`,
    );
  }
}
process.stderr.write(`max resident set ${Math.round(process.resourceUsage().maxRSS / 1024)} MB\n`);
