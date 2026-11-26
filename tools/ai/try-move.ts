// The engine check of the AI coach (issue 627): from the position of a "That was a dumb move" report, play the reported
// action and the alternatives to compare it with, and say which leads to the better game for the AI seat.
//
//   node tools/ai/try-move.ts --body <issue description file> --options
//   node tools/ai/try-move.ts --body <file> [--try '<action json>' ...] [--samples 8] [--turns 2]
//
// --options  lists the legal actions of the reported decision as JSON lines (index, a summary, the action), to pick from
// --try      an alternative action, as the JSON of an engine `Action` (repeatable); the reported action is always played too
// --samples  how many copies of the position to play each action on (default 8). Each copy redraws what the AI seat
//            cannot see (`determinize`, seeds 1..n), so no action is judged on the real hidden cards
// --turns    how many turns to play after the action, every seat played by the HeuristicAgent (default 2)
//
// For each action it prints, over the samples: the AI seat's wins and losses within the horizon, and the mean and the
// spread of the evaluator's score for the AI seat at the end (`evaluate`, DEFAULT_WEIGHTS). The play-outs use the runner's
// logical clock, so the result replays exactly. An action the engine refuses at the position is reported as refused.

import '../corpus/register.ts';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import type { Action, GameState } from '@commander-arena/engine';

const { values } = parseArgs({
  options: {
    body: { type: 'string' },
    options: { type: 'boolean', default: false },
    try: { type: 'string', multiple: true, default: [] },
    samples: { type: 'string', default: '8' },
    turns: { type: 'string', default: '2' },
  },
});

const fail = (message: string): never => {
  process.stderr.write(`${message}\n`);
  process.exit(2);
};
if (values.body === undefined)
  fail('usage: node tools/ai/try-move.ts --body <file> [--options | --try <json> ...]');
const samples = Number(values.samples);
const turns = Number(values.turns);
if (!Number.isInteger(samples) || samples < 1) fail('--samples must be a whole number >= 1');
if (!Number.isInteger(turns) || turns < 1) fail('--turns must be a whole number >= 1');

const { reportOfBody, replayReport } = await import('./report-replay.ts');
const { applyAction, createRng, determinize, getLegalActions, getView } = await import(
  '@commander-arena/engine'
);
const { DEFAULT_BUDGET_MS, HeuristicAgent, evaluate, summarizeAction } = await import(
  '@commander-arena/ai'
);

const report = reportOfBody(await readFile(path.resolve(values.body as string), 'utf8'));
const replay = await replayReport(report);
if (!replay.ok) {
  process.stdout.write(`The report does not replay: ${replay.reason}\n`);
  process.exit(1);
}
const position = replay.position;
const me = report.aiSeat;
const reported = report.actions[report.reported]?.action as Action;

if (values.options) {
  const view = getView(position, me);
  for (const [i, action] of getLegalActions(position, me).entries()) {
    process.stdout.write(
      `${JSON.stringify({ index: i, summary: summarizeAction(view, action), action })}\n`,
    );
  }
  process.exit(0);
}

const MAX_ACTIONS = 3000;

/** Plays `state` on with a HeuristicAgent in every seat until `turns` more turns have started or the game ends. */
async function playOn(state: GameState, sample: number): Promise<GameState> {
  const agents = state.seats.map((_, seat) => new HeuristicAgent({ seed: 1000 * sample + seat }));
  const stopTurn = state.turn.number + turns;
  let current = state;
  let decisions = 0;
  for (let i = 0; i < MAX_ACTIONS; i += 1) {
    if (current.result !== null || current.turn.number > stopTurn) return current;
    const pending = current.pending;
    if (pending === null) return current;
    const seat = pending.seat;
    const view = getView(current, seat);
    if (view.pending === null) return current;
    const real = current;
    const action = await (agents[seat] as InstanceType<typeof HeuristicAgent>).decide(
      view,
      view.pending,
      {
        budgetMs: DEFAULT_BUDGET_MS,
        now: () => decisions,
        sample: (seed) => determinize(real, seat, createRng(seed)),
      },
    );
    decisions += 1;
    const applied = applyAction(current, seat, action);
    if (!applied.ok) return current;
    current = applied.state;
  }
  return current;
}

interface Outcome {
  readonly label: string;
  readonly refused: boolean;
  readonly wins: number;
  readonly losses: number;
  readonly scores: readonly number[];
}

async function tryAction(label: string, action: Action): Promise<Outcome> {
  let wins = 0;
  let losses = 0;
  const scores: number[] = [];
  for (let k = 1; k <= samples; k += 1) {
    const copy = determinize(position, me, createRng(k));
    const applied = applyAction(copy, me, action);
    if (!applied.ok) return { label, refused: true, wins, losses, scores };
    const end = await playOn(applied.state, k);
    if (end.result?.kind === 'win') {
      if (end.result.winner === me) wins += 1;
      else losses += 1;
    }
    scores.push(evaluate(getView(end, me), me).score);
  }
  return { label, refused: false, wins, losses, scores };
}

const view = getView(position, me);
const candidates: { label: string; action: Action }[] = [
  { label: `reported: ${summarizeAction(view, reported)}`, action: reported },
];
for (const text of values.try as string[]) {
  let action: Action;
  try {
    action = JSON.parse(text) as Action;
  } catch {
    fail(`--try is not JSON: ${text}`);
    continue;
  }
  candidates.push({ label: summarizeAction(view, action), action });
}

const fmt = (x: number) => x.toFixed(1);
const lines = [
  `Position: turn ${position.turn.number}, ${position.turn.step}; the AI is seat ${me}. ${samples} samples, ${turns} turns each.`,
  '',
  '| Action | Wins | Losses | Mean score | Lowest | Highest |',
  '| --- | --- | --- | --- | --- | --- |',
];
for (const c of candidates) {
  const o = await tryAction(c.label, c.action);
  if (o.refused) {
    lines.push(`| ${o.label} | refused by the engine | | | | |`);
    continue;
  }
  const mean = o.scores.reduce((a, b) => a + b, 0) / o.scores.length;
  lines.push(
    `| ${o.label} | ${o.wins} | ${o.losses} | ${fmt(mean)} | ${fmt(Math.min(...o.scores))} | ${fmt(Math.max(...o.scores))} |`,
  );
}
process.stdout.write(`${lines.join('\n')}\n`);
