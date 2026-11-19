/**
 * Effect rules of the Quandrix Unlimited deck, group G: "Distribute X +1/+1 counters among any number of target creatures you control" (CR 601.2d, 122.6).
 */
import { literal, map, pattern, sequence } from '../../combinators';
import type { IrAmount, IrCounterSpec, IrNoun } from '../../ir/types';
import { defineRule, family, spanned } from '../registry';
import { type Clauses, operands, single } from './operands';

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

/**
 * `effect.remove-counters-self`: "remove a +1/+1 counter from ~" (CR 122.1, 122.2: a counter comes off the permanent; with "you may" and "If you do" it is the offer the next
 * sentence reads, CR 608.2c). The permanent is the one with the ability: `~` or "it". The engine's `removeCounters`, which does something only when a counter of the kind was there.
 * Not read: "all counters" (`effect.remove-all-counters`), "any number of", a target, another kind of object, "X", or a missing kind.
 */
export const EFFECT_REMOVE_COUNTERS_SELF = defineRule<Clauses>({
  id: 'effect.remove-counters-self',
  family: 'effect',
  leading: ['remove'],
  cites: ['CR 122.1 (Counters)', 'CR 122.2 (Counters)', 'CR 608.2c (Resolving Spells and Abilities)'],
  examples: [
    'remove a +1/+1 counter from ~',
    'remove a +1/+1 counter from it',
    'remove two charge counters from ~',
    'remove a time counter from ~',
  ],
  rejects: [
    'remove all +1/+1 counters from ~',
    'remove any number of +1/+1 counters from ~',
    'remove a +1/+1 counter from target creature',
    'remove a counter from ~',
    'remove X +1/+1 counters from ~',
    'remove a +1/+1 counter from each creature you control',
    'remove a +1/+1 counter from ~ and draw a card',
    'remove a +1/+1 counter',
  ],
  parse: single(
    'effect.remove-counters-self',
    sequence(
      literal('remove '),
      family<IrAmount>('amount', { only: ['amount.number', 'amount.article'] }),
      literal(' '),
      map(
        spanned(pattern(COUNTER_NAME)),
        ({ value, span }): IrCounterSpec => ({
          kind: 'counterSpec',
          name: value[0].toLowerCase(),
          span,
          rule: 'effect.remove-counters-self',
        }),
      ),
      pattern(/ counters? from /i),
      operands(['noun.self', 'noun.it'], 'effect.remove-counters-self'),
    ),
    ([, count, , counter, , from]) => ({
      verb: 'removeCountersSelf',
      args: { count, counter, from },
    }),
  ),
});

export const QUANDRIX_G_EFFECT_RULES = [EFFECT_DISTRIBUTE_COUNTERS, EFFECT_REMOVE_COUNTERS_SELF];
