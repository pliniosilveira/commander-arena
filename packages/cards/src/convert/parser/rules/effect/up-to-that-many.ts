/**
 * Effect rule of Lathiel, the Bounteous Dawn: "distribute up to that many +1/+1 counters among any number of other target creatures" (CR 601.2d, 603.3d, 122.6).
 */
import { literal, map, pattern, sequence } from '../../combinators';
import type { IrCounterSpec, IrNoun } from '../../ir/types';
import { defineRule, family, spanned } from '../registry';
import { type Clauses, single } from './operands';

const COUNTER_NAME = /[+-]\d+\/[+-]\d+|[a-z]+/i;

/**
 * `effect.distribute-counters-up-to-that-many`: "distribute up to that many +1/+1 counters among any number of other target creatures" (CR 601.2d: the controller divides the
 * counters among the targets as the ability is put on the stack, CR 603.3d, each target getting at least 1 and the total at most "that many"; CR 122.6: counters put on an object).
 * "That many" has no instruction before it here: the lowering reads it as the life gained this turn, and only in a triggered ability whose intervening "if" is "if you gained life this
 * turn". Not read: "distribute that many" (no "up to", which is `effect.distribute-counters`' exactly), "up to X", targets that are not "any number of", the singular "counter", or
 * anything after the sentence.
 */
export const EFFECT_DISTRIBUTE_COUNTERS_UP_TO_THAT_MANY = defineRule<Clauses>({
  id: 'effect.distribute-counters-up-to-that-many',
  family: 'effect',
  leading: ['distribute'],
  cites: [
    'CR 601.2d (Casting Spells)',
    'CR 603.3d (Handling Triggered Abilities)',
    'CR 122.6 (Counters)',
    'CR 115.1 (Targets)',
  ],
  examples: [
    'distribute up to that many +1/+1 counters among any number of other target creatures',
    'distribute up to that many +1/+1 counters among any number of target creatures you control',
  ],
  rejects: [
    'distribute that many +1/+1 counters among any number of other target creatures',
    'distribute up to X +1/+1 counters among any number of other target creatures',
    'distribute up to that many +1/+1 counter among any number of other target creatures',
    'distribute up to that many +1/+1 counters among other target creatures',
    'distribute up to that many +1/+1 counters among any number of other creatures',
    'distribute up to that many counters among any number of other target creatures',
    'distribute up to that many +1/+1 counters among any number of other target creatures and draw a card',
  ],
  parse: single(
    'effect.distribute-counters-up-to-that-many',
    sequence(
      literal('distribute up to that many '),
      map(
        spanned(pattern(COUNTER_NAME)),
        ({ value, span }): IrCounterSpec => ({
          kind: 'counterSpec',
          name: value[0].toLowerCase(),
          span,
          rule: 'effect.distribute-counters-up-to-that-many',
        }),
      ),
      literal(' counters among '),
      family<IrNoun>('noun', { only: ['noun.any-number-targets'] }),
    ),
    ([, counter, , to]) => ({
      verb: 'distributeCountersUpToThatMany',
      args: { counter, to },
    }),
  ),
});

export const UP_TO_THAT_MANY_EFFECT_RULES = [EFFECT_DISTRIBUTE_COUNTERS_UP_TO_THAT_MANY];
