// Vitest's `--shard=N/M` for the PR tier, by time instead of by file count (see shard-plan.ts for why and how).
//
// Only the PR tier (`TEST_TIER=pr`, set by `pnpm test:pr`) uses the recorded weights, which are the times of the PR tier's files. Every other run with `--shard` (the nightly, the manual
// soak) keeps Vitest's own split, because the weights say nothing about the files only those runs play.

import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { BaseSequencer, type TestSpecification } from 'vitest/node';
import { planShards, type ShardWeights, weightOf } from './shard-plan.ts';

const recorded = JSON.parse(
  readFileSync(new URL('./shard-weights.json', import.meta.url), 'utf8'),
) as ShardWeights;

export default class TimeBalancedSequencer extends BaseSequencer {
  override async shard(files: TestSpecification[]): Promise<TestSpecification[]> {
    if (process.env.TEST_TIER !== 'pr') return super.shard(files);
    const { index, count } = this.ctx.config.shard ?? { index: 1, count: 1 };
    const root = this.ctx.config.root;
    // The path from the repository root, with forward slashes, as the weights name the files.
    const idOf = (spec: TestSpecification) => relative(root, spec.moduleId).split('\\').join('/');
    const plan = planShards(
      files.map((spec) => ({ id: idOf(spec), seconds: weightOf(recorded, idOf(spec)) })),
      count,
    );
    const mine = new Set(plan[index - 1] ?? []);
    return files.filter((spec) => mine.has(idOf(spec)));
  }
}
