/**
 * Condition of the counters on the permanent itself being all gone (CR 122.1): "~ has no charge counters on it". The engine's `amountIs` of the `countersOn` this
 * permanent has, equal to 0.
 */
import { pattern } from '../../combinators';
import type { IrCondition, IrNoun } from '../../ir/types';
import { defineRule, spanned } from '../registry';

/**
 * `condition.this-has-no-counters`: "~ has no charge counters on it", "~ has no +1/+1 counters on it" (CR 122.1: a permanent has no counters of a kind when none of them
 * is on it; CR 603.4: read as the ability triggers and as it resolves, for an intervening "if"). The counters are those of the one kind the words name on the permanent
 * the ability is on. Not read: "no counters" of no kind, "it", a number ("fewer than two"), another permanent's counters and a past tense.
 */
export const CONDITION_THIS_HAS_NO_COUNTERS = defineRule<IrCondition>({
  id: 'condition.this-has-no-counters',
  family: 'condition',
  leading: ['~'],
  cites: ['CR 122.1 (Counters)', 'CR 603.4 (Handling Triggered Abilities)'],
  examples: ['~ has no charge counters on it', '~ has no +1/+1 counters on it'],
  rejects: [
    '~ has no charge counters on it.',
    '~ has no counters on it',
    'it has no charge counters on it',
    '~ has a charge counter on it',
    '~ has no charge counters',
    '~ had no charge counters on it',
    '~ has no charge counters on it and',
    'target creature has no charge counters on it',
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      pattern(/~ has no ([+-]\d+\/[+-]\d+|[a-z]+) counters on it(?![\p{L}\p{N}])/iu),
    )(ctx, pos);
    if (!r.ok) return r;
    const match = r.value.value;
    const counter = (match[1] ?? '').toLowerCase();
    const span = r.value.span;
    const of: IrNoun = {
      kind: 'noun',
      det: 'self',
      filter: { raw: '~' },
      upTo: false,
      plural: false,
      other: false,
      span,
      rule: 'condition.this-has-no-counters',
    };
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: {
          kind: 'amountIs',
          amount: { kind: 'countersOn', of, counter, span },
          compare: { cmp: 'equal', value: 0 },
        },
        span,
        rule: 'condition.this-has-no-counters',
      },
      pos: r.pos,
    };
  },
});

export const NO_COUNTERS_CONDITION_RULES = [CONDITION_THIS_HAS_NO_COUNTERS];
