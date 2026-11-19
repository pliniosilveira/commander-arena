/**
 * Condition of the number of counters of one kind on the permanent itself (CR 122.1) after "as long as" of a static ability: "it has ten or more +1/+1 counters on
 * it". The engine's `amountIs` of the `countersOn` this permanent has, compared with a whole number. The same count with the subject `~`, after the "if" of a
 * trigger, is `condition.this-counter-count` (`self-state.ts`); the two do not read the same text.
 */
import { map, type Parser, pattern, satisfy, sequence } from '../../combinators';
import type { IrComparison, IrCondition, IrNoun } from '../../ir/types';
import { quantity } from '../amount/index';
import { defineRule, spanned } from '../registry';

const COUNT_COMPARE: Parser<IrComparison> = map(
  sequence(
    satisfy(quantity, (n) => n >= 2),
    pattern(/ or (more|fewer)(?= )/iu),
  ),
  ([value, word]) => ({
    cmp: (word[1] ?? '').toLowerCase() === 'more' ? ('atLeast' as const) : ('atMost' as const),
    value,
  }),
);

/**
 * `condition.this-has-counter-count`: "it has ten or more +1/+1 counters on it", "it has 2 or fewer charge counters on it" (CR 122.1: a permanent has as many counters of a
 * kind as are on it; CR 611.3a: read continuously after "as long as"; counters belong to no layer, CR 613.8). The counters are those of the one kind the words name on
 * the permanent the ability is on. Not read: a bare number ("has ten counters"), counters of no kind, another permanent's counters and a past tense.
 */
export const CONDITION_THIS_HAS_COUNTER_COUNT = defineRule<IrCondition>({
  id: 'condition.this-has-counter-count',
  family: 'condition',
  leading: ['it'],
  cites: [
    'CR 122.1 (Counters)',
    'CR 611.3a (Continuous Effects)',
    'CR 613.8 (Interaction of Continuous Effects)',
  ],
  examples: [
    'it has ten or more +1/+1 counters on it',
    'it has 3 or more charge counters on it',
    'it has two or fewer charge counters on it',
  ],
  rejects: [
    '~ has ten or more +1/+1 counters on it',
    'it has ten or more +1/+1 counters on it.',
    'it has ten +1/+1 counters on it',
    'it has ten or more counters on it',
    'it has ten or more +1/+1 counters',
    'it had ten or more +1/+1 counters on it',
    'it has one or more +1/+1 counters on it',
    'it has 0 or more +1/+1 counters on it',
    'target creature has ten or more +1/+1 counters on it',
    'it has ten or more +1/+1 counters on it and',
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      sequence(
        pattern(/it has /iu),
        COUNT_COMPARE,
        pattern(/ ([+-]\d+\/[+-]\d+|[a-z]+) counters on it(?![\p{L}\p{N}])/iu),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, compare, tail] = r.value.value;
    const counter = (tail[1] ?? '').toLowerCase();
    const span = r.value.span;
    const of: IrNoun = {
      kind: 'noun',
      det: 'self',
      filter: { raw: '~' },
      upTo: false,
      plural: false,
      other: false,
      span,
      rule: 'condition.this-has-counter-count',
    };
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: {
          kind: 'amountIs',
          amount: { kind: 'countersOn', of, counter, span },
          compare,
        },
        span,
        rule: 'condition.this-has-counter-count',
      },
      pos: r.pos,
    };
  },
});

export const COUNTER_COUNT_CONDITION_RULES = [CONDITION_THIS_HAS_COUNTER_COUNT];
