// The AI benchmark (issue 624, phase 1): the HeuristicAgent of the working tree against a frozen baseline
// (the agent of another commit, `tools/ai/baseline.ts`), or against the fixed GreedyAgent of the working
// tree (`--opponent greedy`), on the real precons, paired seeds with the seats swapped.
//
//   node tools/ai/baseline.ts --ref main
//   node tools/ai/benchmark.ts --games 400 --seed 1 [--shard 1/4] [--out shard-1.json]
//   node tools/ai/benchmark-report.ts shard-*.json
//
// An old build against the fixed opponent, to compare builds that each scored even against their parent:
//
//   node tools/ai/baseline.ts --ref <commit> --out tools/ai/.candidate
//   node tools/ai/benchmark.ts --candidate tools/ai/.candidate --opponent greedy --games 400 --seed 1
//
// --opponent   heuristic (default): the baseline folder's HeuristicAgent; greedy: this tree's GreedyAgent,
//              the same opponent for every candidate (--baseline and --baseline-weights are refused)
// --baseline   the folder of the baseline's agent code (default tools/ai/.baseline)
// --candidate  a folder of agent code to play instead of the working tree's (default: the working tree)
// --candidate-weights, --baseline-weights  a JSON file of a partial AgentWeights (packages/ai/src/weights.ts)
//              merged over that side's defaults with its own withWeights; refused for agent code without weights
// --games      total games, an even number: each seed is played twice, the seats swapped (default 400)
// --seed       the first game seed (default 1); pair i plays seed + i on precon i mod the number of precons
// --shard      i/n: play only the pairs whose index is i - 1 modulo n, so n machines split one run
// --out        write the pairs as JSON for benchmark-report.ts; the summary is always printed
// --max-turns, --max-actions  the limits of one game (defaults: MATCH_LIMITS)
//
// The agents get the runner's logical clock, so a result does not depend on the speed of the machine and a
// run replays exactly. The manual workflow `AI benchmark` runs it in shards on GitHub's runners.

import '../corpus/register.ts';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import type { Agent, AgentFactory, AgentWeights, PartialWeights } from '@commander-arena/ai';
import { DEFAULT_BASELINE_FOLDER } from './baseline-folder.ts';
import type { GameOutcome, PairRecord } from './benchmark-stats.ts';
import { formatSummary } from './benchmark-stats.ts';

const { values } = parseArgs({
  options: {
    opponent: { type: 'string', default: 'heuristic' },
    baseline: { type: 'string' },
    candidate: { type: 'string' },
    'candidate-weights': { type: 'string' },
    'baseline-weights': { type: 'string' },
    games: { type: 'string', default: '400' },
    seed: { type: 'string', default: '1' },
    shard: { type: 'string', default: '1/1' },
    out: { type: 'string' },
    'max-turns': { type: 'string' },
    'max-actions': { type: 'string' },
  },
});

const fail = (message: string): never => {
  process.stderr.write(`${message}\n`);
  process.exit(2);
};
const games = Number(values.games);
const seed = Number(values.seed);
if (!Number.isInteger(games) || games < 2 || games % 2 !== 0)
  fail('--games must be an even number');
if (!Number.isInteger(seed)) fail('--seed must be a whole number');
const shardMatch = /^(\d+)\/(\d+)$/.exec(values.shard);
const shardIndex = Number(shardMatch?.[1]);
const shardCount = Number(shardMatch?.[2]);
if (shardMatch === null || shardIndex < 1 || shardIndex > shardCount) {
  fail('--shard must be i/n with 1 <= i <= n');
}
const positive = (text: string | undefined, name: string): number | undefined => {
  if (text === undefined) return undefined;
  const n = Number(text);
  if (!Number.isInteger(n) || n < 1) fail(`--${name} must be a positive whole number`);
  return n;
};
const maxTurns = positive(values['max-turns'], 'max-turns');
const maxActions = positive(values['max-actions'], 'max-actions');
const opponent = values.opponent;
if (opponent !== 'heuristic' && opponent !== 'greedy')
  fail('--opponent must be heuristic or greedy');
if (opponent === 'greedy' && (values.baseline ?? values['baseline-weights']) !== undefined) {
  fail('--opponent greedy plays the GreedyAgent: --baseline and --baseline-weights do not apply');
}

const { GreedyAgent, HeuristicAgent, MATCH_LIMITS, playMatch, withWeights } = await import(
  '@commander-arena/ai'
);
const { loadPreconDecks, mirrorPairs } = await import('./precons.ts');

/** The partial weights of a JSON file, or undefined when no file is named. */
function readWeights(file: string | undefined, flag: string): PartialWeights | undefined {
  if (file === undefined) return undefined;
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as PartialWeights;
  } catch (error) {
    return fail(`--${flag}: cannot read ${file}: ${String(error)}`);
  }
}

/** The agent code a side plays: the HeuristicAgent and, when it has them, its weights helper. */
interface AgentModule {
  HeuristicAgent?: new (options: { seed: number; weights?: AgentWeights }) => Agent;
  withWeights?: (partial: PartialWeights) => AgentWeights;
}

/** The HeuristicAgent of agent code, with `partial` merged over its default weights when given. */
function heuristicOf(
  mod: AgentModule,
  where: string,
  label: string,
  partial: PartialWeights | undefined,
  flag: string,
): AgentFactory {
  const Heuristic = mod.HeuristicAgent;
  if (Heuristic === undefined) return fail(`${where} has no HeuristicAgent`);
  if (partial === undefined) return { label, create: (s) => new Heuristic({ seed: s }) };
  if (mod.withWeights === undefined) {
    return fail(
      `--${flag}: the agent code of ${where} has no weights (it predates issue 624 phase 2)`,
    );
  }
  let weights: AgentWeights;
  try {
    weights = mod.withWeights(partial);
  } catch (error) {
    return fail(`--${flag}: ${error instanceof Error ? error.message : String(error)}`);
  }
  return { label, create: (s) => new Heuristic({ seed: s, weights }) };
}

/** The agent code of a folder (a copy of `packages/ai/src`). */
async function moduleFrom(folder: string): Promise<AgentModule> {
  const url = pathToFileURL(join(resolve(folder), 'index.ts')).href;
  try {
    return await import(url);
  } catch (error) {
    return fail(`cannot load the agent code of ${folder}: ${String(error)}`);
  }
}

const baselineFolder = values.baseline ?? DEFAULT_BASELINE_FOLDER;
const baseline: AgentFactory =
  opponent === 'greedy'
    ? { label: 'baseline', create: (s) => new GreedyAgent({ seed: s }) }
    : heuristicOf(
        await moduleFrom(baselineFolder),
        baselineFolder,
        'baseline',
        readWeights(values['baseline-weights'], 'baseline-weights'),
        'baseline-weights',
      );
const candidate = heuristicOf(
  values.candidate === undefined
    ? { HeuristicAgent, withWeights }
    : await moduleFrom(values.candidate),
  values.candidate ?? 'the working tree',
  'candidate',
  readWeights(values['candidate-weights'], 'candidate-weights'),
  'candidate-weights',
);

const loaded = await loadPreconDecks();
for (const problem of loaded.problems) process.stderr.write(`precon left out: ${problem}\n`);
if (loaded.decks.length === 0) fail('no playable precon snapshot');
const decks = mirrorPairs(loaded.decks);
const deckNames = loaded.decks.map((d) => d.id);

const pairs: PairRecord[] = [];
/** The candidate is side `a`; a game that ends without a result (a cap) is `unfinished`, not a draw. */
const outcome = (winner: 'a' | 'b' | null, drew: boolean): GameOutcome =>
  winner === 'a' ? 'win' : winner === 'b' ? 'loss' : drew ? 'draw' : 'unfinished';

for (let i = 0; i < games / 2; i += 1) {
  if (i % shardCount !== shardIndex - 1) continue;
  const deck = i % decks.length;
  const result = await playMatch({
    a: candidate,
    b: baseline,
    decks: [decks[deck] as (typeof decks)[number]],
    games: 2,
    baseSeed: seed + i,
    limits: {
      maxTurns: maxTurns ?? MATCH_LIMITS.maxTurns,
      maxActions: maxActions ?? MATCH_LIMITS.maxActions,
    },
  });
  const [first, second] = result.log;
  if (first === undefined || second === undefined) throw new Error('a pair did not play two games');
  pairs.push({
    seed: seed + i,
    deck,
    games: [outcome(first.winner, first.drew), outcome(second.winner, second.drew)],
    turns: [first.turns, second.turns],
  });
  process.stderr.write(
    `pair ${i} (seed ${seed + i}, ${deckNames[deck]}): ${pairs.at(-1)?.games.join(', ')}\n`,
  );
}

if (values.out !== undefined) {
  writeFileSync(
    values.out,
    `${JSON.stringify({ seed, games, shard: values.shard, opponent, deckNames, pairs }, null, 1)}\n`,
  );
}
process.stdout.write(
  `${formatSummary(pairs, { candidate: 'candidate', baseline: opponent === 'greedy' ? 'greedy' : 'baseline', deckNames })}\n`,
);
