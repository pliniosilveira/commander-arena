import { defineConfig } from 'vitest/config';
import TimeBalancedSequencer from './tools/test/shard-sequencer.ts';

export default defineConfig({
  test: {
    passWithNoTests: true,
    projects: ['packages/*', 'apps/*', 'tools'],
    // The PR tier splits its files into shards by recorded time, not by count (tools/test/shard-plan.ts).
    sequence: { sequencer: TimeBalancedSequencer },
  },
});
