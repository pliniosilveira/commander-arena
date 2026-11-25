// A worker process of `tools/ai/tune.ts --workers <n>`: started with `fork`, it loads the precon decks once,
// then plays the pairs the parent sends and replies with each game's winner. The parent sums the results, so
// the order in which workers finish never changes a run: `--workers` changes only how fast it goes.
//
// Message in:  { id, plus, minus, pairs: [{ gameSeed, deck }], limits: { maxTurns, maxActions } }
// Message out: { id, winners: ('a' | 'b' | null)[] }   (two games per pair, in the order of `pairs`)

import '../corpus/register.ts';
import type { AgentFactory, PartialWeights } from '@commander-arena/ai';

export interface WorkRequest {
  readonly id: number;
  readonly plus: PartialWeights;
  readonly minus: PartialWeights;
  readonly pairs: readonly { readonly gameSeed: number; readonly deck: number }[];
  readonly limits: { readonly maxTurns: number; readonly maxActions: number };
}

export interface WorkReply {
  readonly id: number;
  readonly winners: readonly ('a' | 'b' | null)[];
}

const { HeuristicAgent, playMatch, withWeights } = await import('@commander-arena/ai');
const { loadPreconDecks, mirrorPairs } = await import('./precons.ts');
const decks = mirrorPairs((await loadPreconDecks()).decks);

const agentOf = (label: string, partial: PartialWeights): AgentFactory => {
  const weights = withWeights(partial);
  return { label, create: (s) => new HeuristicAgent({ seed: s, weights }) };
};

process.on('message', async (message: WorkRequest) => {
  const a = agentOf('theta+', message.plus);
  const b = agentOf('theta-', message.minus);
  const winners: ('a' | 'b' | null)[] = [];
  for (const pair of message.pairs) {
    const result = await playMatch({
      a,
      b,
      decks: [decks[pair.deck] as (typeof decks)[number]],
      games: 2,
      baseSeed: pair.gameSeed,
      limits: message.limits,
    });
    for (const game of result.log) winners.push(game.winner);
  }
  process.send?.({ id: message.id, winners } satisfies WorkReply);
});
process.send?.({ ready: true });
