/**
 * `effect.add-counters`: "Put a +1/+1 counter on ~", "put two +1/+1 counters on target creature"
 * (CR 122.6: putting counters on an object). The count is a number, "a"/"an" or X (stage P16: the
 * X of the spell or ability, CR 107.3a; a line outside a spell or activated ability with an X in
 * its cost is refused by the lowering). The counter is "+1/+1", "-1/-1" or a named kind ("charge").
 * A single counter may be counted by the times a multikicker was paid (stage P17: "put a +1/+1 counter
 * on it for each time it was kicked", the engine's `timesKicked`); since stage P28 (D-131) by any count of "for each"
 * ("put a +1/+1 counter on ~ for each creature destroyed this way"), and a quantity above one multiplies it. The count
 * may be what the sentence defines X as: "put X +1/+1 counters on target creature, where X is that creature's power".
 */
import { literal, map, optional, pattern, satisfy, sequence } from '../../combinators';
import type { IrAmount, IrCounterSpec } from '../../ir/types';
import { EQUAL_AMOUNTS, FOR_EACH_TAIL, scaled } from '../amount/scaled';
import { defineRule, family, spanned } from '../registry';
import { type Clauses, operands, single } from './operands';

const COUNT_ONLY = ['amount.number', 'amount.article', 'amount.x'] as const;

/** The objects counters can be put on: this permanent, "it", a target, or each of a kind. */
const COUNTER_OPERANDS = [
  'noun.self',
  'noun.it',
  // Stage P49 (D-206): "put two +1/+1 counters on that token" (the token the sentence before made).
  'noun.that-token',
  'noun.target-permanent',
  'noun.all-permanents',
  'noun.each-permanent',
  // Stage P68 (D-230): "each permanent you control that's a creature or Vehicle".
  'noun.each-permanent-that-is',
  // Stage P48 (D-205): "Tap up to two target creatures. Put a stun counter on each of them."
  'noun.each-of-them',
] as const;

export const EFFECT_ADD_COUNTERS = defineRule<Clauses>({
  id: 'effect.add-counters',
  family: 'effect',
  leading: ['put'],
  cites: ['CR 122.6 (Counters)', 'CR 122.1 (Counters)'],
  examples: [
    'put a +1/+1 counter on ~',
    'put two +1/+1 counters on target creature',
    'put a +1/+1 counter on each creature you control',
    'put a -1/-1 counter on target creature',
    'put three charge counters on ~',
    'put two +1/+1 counters on it',
    'put two +1/+1 counters on that token',
    'put a stun counter on each of them',
    'put X +1/+1 counters on target creature',
    'put X +1/+1 counters on ~',
    'put X charge counters on ~',
    'put X +1/+1 counters on each creature you control',
    'put a +1/+1 counter on it for each time it was kicked',
    'put a charge counter on ~ for each time ~ was kicked',
    'put two +1/+1 counters on it for each time it was kicked',
    'put a +1/+1 counter on it for each creature you control',
    'put a +1/+1 counter on ~ for each creature destroyed this way',
    'put two +1/+1 counters on ~ for each opponent who has more life than you',
  ],
  rejects: [
    'put X +1/+1 counters on it for each time it was kicked',
    'put a +1/+1 counter on it for each time',
    'put a +1/+1 counter on it for each creature',
    'put a +1/+1 counter on that creature',
    'put a +1/+1 counter on each of those',
    'put a +1/+1 counter on each of it',
    'put a card from your hand onto the battlefield',
    'put Y +1/+1 counters on ~',
    'put X counters on ~',
    'put up to X +1/+1 counters on ~',
    'put a +1/+1 counter on target creature or Dragon',
    'put a +1/+1 counter on ~ and draw a card',
    'put a +1/+1 counter on',
  ],
  parse: single(
    'effect.add-counters',
    // A count of "for each time it was kicked" replaces the "a": two counters for each time would
    // multiply, which the engine's one amount cannot say.
    satisfy(
      sequence(
        literal('put '),
        family<IrAmount>('amount', { only: COUNT_ONLY }),
        literal(' '),
        map(
          spanned(pattern(/[+-]\d+\/[+-]\d+|[a-z]+/i)),
          ({ value, span }): IrCounterSpec => ({
            kind: 'counterSpec',
            name: value[0].toLowerCase(),
            span,
            rule: 'effect.add-counters',
          }),
        ),
        pattern(/ counters? on /i),
        operands(COUNTER_OPERANDS, 'effect.add-counters'),
        optional(FOR_EACH_TAIL, null),
      ),
      ([, count, , , , , each]) => each === null || scaled(count, each) !== null,
    ),
    ([, count, , counter, , objects, each]) => ({
      verb: 'addCounters',
      args: { count: each === null ? count : (scaled(count, each) ?? count), counter, objects },
    }),
  ),
});

/**
 * `effect.add-counters-number-of`: "Put a number of +1/+1 counters on each creature you control equal to the number of security votes" (stage P44, D-195,
 * CR 122.6, 608.2c): the count is the amount after "equal to", worked out as the instruction runs and put on each of the objects (the same count on every
 * one, as "put X +1/+1 counters on each creature you control" does). Not read: "a number of" with one counter or no counter, no "equal to", and an
 * object that is not one of the operands of `effect.add-counters`.
 */
export const EFFECT_ADD_COUNTERS_NUMBER_OF = defineRule<Clauses>({
  id: 'effect.add-counters-number-of',
  family: 'effect',
  leading: ['put'],
  cites: ['CR 122.6 (Counters)', 'CR 608.2c (Resolving Spells and Abilities)'],
  examples: [
    'put a number of +1/+1 counters on each creature you control equal to the number of security votes',
    'put a number of +1/+1 counters on ~ equal to the number of creatures you control',
    'put a number of charge counters on ~ equal to its power',
    'put a number of +1/+1 counters on target creature equal to twice the number of profit votes',
  ],
  rejects: [
    'put a number of +1/+1 counters on each creature you control',
    'put a number of +1/+1 counters on each creature you control equal to',
    'put a number of +1/+1 counters on each creature you control equal to 3',
    'put a number of counters on each creature you control equal to the number of security votes',
    'put a number of +1/+1 counter on each creature you control equal to the number of security votes',
    'put a +1/+1 counter on each creature you control equal to the number of security votes',
    'put the number of +1/+1 counters on each creature you control equal to the number of security votes',
    'put a number of +1/+1 counters on each creature you control equal to the number of security votes and draw a card',
    'put a number of +1/+1 counters on a creature you control equal to its power',
  ],
  parse: single(
    'effect.add-counters-number-of',
    sequence(
      literal('put a number of '),
      map(
        spanned(pattern(/[+-]\d+\/[+-]\d+|[a-z]+/i)),
        ({ value, span }): IrCounterSpec => ({
          kind: 'counterSpec',
          name: value[0].toLowerCase(),
          span,
          rule: 'effect.add-counters-number-of',
        }),
      ),
      pattern(/ counters on /i),
      operands(COUNTER_OPERANDS, 'effect.add-counters-number-of'),
      literal(' '),
      family<IrAmount>('amount', { only: EQUAL_AMOUNTS }),
    ),
    ([, counter, , objects, , count]) => ({
      verb: 'addCounters',
      args: { count, counter, objects },
    }),
  ),
});

export const COUNTER_RULES = [EFFECT_ADD_COUNTERS, EFFECT_ADD_COUNTERS_NUMBER_OF];
