// Merges the shard files of an AI benchmark run (`tools/ai/benchmark.ts --out`) and prints the Markdown
// report: the verdict, the score with its 95% interval, and the score of each precon.
//
//   node tools/ai/benchmark-report.ts [--candidate <name>] [--baseline <name>] shard-1.json shard-2.json ...

import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { formatSummary, type PairRecord } from './benchmark-stats.ts';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    candidate: { type: 'string', default: 'candidate' },
    baseline: { type: 'string', default: 'baseline' },
  },
});
if (positionals.length === 0) {
  process.stderr.write('give the shard files of one run\n');
  process.exit(2);
}

interface ShardFile {
  readonly seed: number;
  readonly games: number;
  readonly deckNames: readonly string[];
  readonly pairs: readonly PairRecord[];
}

const shards = positionals.map((file) => JSON.parse(readFileSync(file, 'utf8')) as ShardFile);
const first = shards[0] as ShardFile;
for (const s of shards) {
  if (s.seed !== first.seed || s.games !== first.games) {
    process.stderr.write('the shard files are of different runs (seed or games differ)\n');
    process.exit(2);
  }
}
const pairs = shards.flatMap((s) => s.pairs).sort((a, b) => a.seed - b.seed);
const seeds = new Set(pairs.map((p) => p.seed));
if (seeds.size !== pairs.length) {
  process.stderr.write('a seed appears in two shard files\n');
  process.exit(2);
}
const missing = first.games / 2 - pairs.length;
process.stdout.write(
  `${formatSummary(pairs, { candidate: values.candidate, baseline: values.baseline, deckNames: first.deckNames })}\n`,
);
if (missing > 0)
  process.stdout.write(`\n${missing} pairs of the run are missing (a shard failed).\n`);
