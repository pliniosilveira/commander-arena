import { literal, sequence } from '../../combinators';
import type { IrArg } from '../../ir/types';
import { defineRule, family } from '../registry';
import { type Clauses, single } from './operands';

/**
 * `effect.adapt`: "Adapt 4" (CR 701.46a: "If this permanent has no +1/+1 counters on it, put N +1/+1 counters on it"; Pteramander). The engine's `conditional` over `sourceHasCounter` with
 * `addCounters` on the source. The number is a digit count or a count word. Not read: no number, "adapt X" (nobody announces an X for it), "you adapt 4", another count word.
 */
export const EFFECT_ADAPT = defineRule<Clauses>({
  id: 'effect.adapt',
  family: 'effect',
  leading: ['adapt'],
  cites: ['CR 701.46a (Adapt)', 'CR 122.1b (Counters)'],
  examples: ['adapt 4', 'adapt 2', 'adapt two'],
  rejects: ['adapt', 'adapt X', 'adapts 4', 'you adapt 4', 'adapt 4 times'],
  parse: single(
    'effect.adapt',
    sequence(literal('adapt '), family<IrArg>('amount', { only: ['amount.number'] })),
    ([, count]) => ({ verb: 'adapt', args: { count } }),
  ),
});

export const ADAPT_EFFECT_RULES = [EFFECT_ADAPT];
