/**
 * Effect rules of the Quandrix Unlimited deck, group G: "Distribute X +1/+1 counters among any number of target creatures you control" (CR 601.2d, 122.6).
 */
import { literal, map, pattern, sequence } from '../../combinators';
import type { IrAmount, IrCounterSpec, IrNoun } from '../../ir/types';
import { defineRule, family, spanned } from '../registry';
import { type Clauses, single } from './operands';

const COUNTER_NAME = /[+-]\d+\/[+-]\d+|[a-z]+/i;

/**
 * `effect.distribute-counters`: "Distribute X +1/+1 counters among any number of target creatures you control" (CR 601.2d: the caster divides the counters among the targets as the
 * spell is cast, each target getting at least 1; CR 122.6: counters put on an object). The count is a number or the X the spell announces (CR 107.3a); the targets are "any number of
 * target ..." (no fewest, at most as many as the counters). Not read: "up to" targets, "target creature" (one target), a missing "among", the singular "counter", "that many",
 * "divided as you choose", counters put on each of the targets, or anything after the sentence.
 */
export const EFFECT_DISTRIBUTE_COUNTERS = defineRule<Clauses>({
  id: 'effect.distribute-counters',
  family: 'effect',
  leading: ['distribute'],
  cites: [
    'CR 601.2d (Casting Spells)',
    'CR 122.6 (Counters)',
    'CR 115.1 (Targets)',
    'CR 107.3a (Numbers and Symbols)',
  ],
  examples: [
    'distribute X +1/+1 counters among any number of target creatures you control',
    'distribute three +1/+1 counters among any number of target creatures',
    'distribute 4 -1/-1 counters among any number of target creatures you don’t control',
  ],
  rejects: [
    'distribute X +1/+1 counters among target creatures you control',
    'distribute X +1/+1 counters among up to three target creatures you control',
    'distribute X +1/+1 counter among any number of target creatures you control',
    'distribute X +1/+1 counters among any number of creatures you control',
    'distribute X +1/+1 counters any number of target creatures you control',
    'distribute that many +1/+1 counters among any number of target creatures you control',
    'distribute X counters among any number of target creatures you control',
    'distribute X +1/+1 counters among any number of target creatures you control and draw a card',
    'distribute X +1/+1 counters as you choose among any number of target creatures',
  ],
  parse: single(
    'effect.distribute-counters',
    sequence(
      literal('distribute '),
      family<IrAmount>('amount', { only: ['amount.number', 'amount.x'] }),
      literal(' '),
      map(
        spanned(pattern(COUNTER_NAME)),
        ({ value, span }): IrCounterSpec => ({
          kind: 'counterSpec',
          name: value[0].toLowerCase(),
          span,
          rule: 'effect.distribute-counters',
        }),
      ),
      literal(' counters among '),
      family<IrNoun>('noun', { only: ['noun.any-number-targets'] }),
    ),
    ([, count, , counter, , to]) => ({
      verb: 'distributeCounters',
      args: { count, counter, to },
    }),
  ),
});

export const QUANDRIX_G_EFFECT_RULES = [EFFECT_DISTRIBUTE_COUNTERS];
