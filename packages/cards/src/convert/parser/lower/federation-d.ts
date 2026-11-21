/**
 * Lowerings of group D of the Federation Fleet deck: reveal the top card, draw when it is of a kind, and otherwise put counters on this permanent.
 */
import type { Effect } from '@commander-arena/engine';
import type { IrClause } from '../ir/types';
import { amountArg, arg, type Effects, failure } from './clauses';
import { lowerFilter } from './nouns';
import type { Lowering } from './types';

/**
 * "You may reveal the top card of your library. Draw a card if it's an artifact card. If you don't draw a card this way, put two +1/+1 counters on ~." (CR 701.20a, 608.2c, 122.6): the
 * engine's `revealTop` of the controller's own library that draws a card when the card matches (the `may` around it asks before the card is shown), then a `conditional` that puts the counters on
 * this permanent when this resolution drew no card (`thisWayAtLeast` of `playersDrew`, as `not`): a declined reveal and a card of another kind both end there.
 */
const REVEAL_TOP_DRAW_ELSE_COUNTERS: Lowering<IrClause, Effects> = {
  head: 'revealTopDrawElseCounters',
  id: 'lower.reveal-top-draw-else-counters',
  needs: [
    'effect:revealTop',
    'effect:conditional',
    'effect:addCounters',
    'condition:thisWayAtLeast',
  ],
  // The words "you may" of the clause are the offer of the engine's `may` effect, which asks the question before the card is revealed.
  acceptsOptional: true,
  lower(clause, ctx) {
    const what = arg(clause, 'what');
    const counter = arg(clause, 'counter');
    if (what?.kind !== 'noun' || counter?.kind !== 'counterSpec') return failure(clause);
    const count = amountArg(clause, 'count', ctx);
    if (!count.ok) return count;
    const filter = lowerFilter(what);
    if (!filter.ok) return filter;
    const you = { kind: 'you' } as const;
    const reveal: Effect = {
      kind: 'revealTop',
      player: you,
      ifMatches: filter.value,
      onMatch: { kind: 'draw', player: you, count: 1 },
    };
    // The counters are put on this permanent: nothing the text names is a target or a choice.
    ctx.putCounters.push({ counter: counter.name, creatures: false });
    return {
      ok: true,
      value: [
        clause.optional ? { kind: 'may', effect: reveal } : reveal,
        {
          kind: 'conditional',
          condition: {
            kind: 'not',
            term: { kind: 'thisWayAtLeast', what: 'playersDrew', count: 1 },
          },
          effect: {
            kind: 'addCounters',
            objects: { kind: 'this' },
            counter: counter.name,
            count: count.value,
          },
        },
      ],
      rule: clause.rule,
    };
  },
};

export const FEDERATION_D_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  REVEAL_TOP_DRAW_ELSE_COUNTERS,
];
