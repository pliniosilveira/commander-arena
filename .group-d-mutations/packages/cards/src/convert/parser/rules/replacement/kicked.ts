/**
 * The replacement of a kicked permanent (CR 702.33d, 614.1c): "If ~ was kicked, it enters with two
 * +1/+1 counters on it." It is a replacement effect of the permanent itself, so the segmenter hands
 * the whole statement over, period included. The engine's `entersWithCounters` has no condition,
 * so the statement is read and refused by the lowering (the counters would have to be there as
 * the permanent enters, which a triggered ability cannot do).
 */
import { choice, literal, sequence } from '../../combinators';
import type { IrAbility, IrClause, IrCondition } from '../../ir/types';
import { defineRule, family, spanned } from '../registry';
import { countersTail, ENTERS, replacement } from './shared';

const IT_ENTERS = choice(literal('it enters the battlefield'), literal('it enters'), ENTERS);

/**
 * `replacement.enters-with-counters-kicked`: "If ~ was kicked, it enters with two +1/+1 counters
 * on it." The clause is the unconditional `entersWithCounters` one with the kicked condition on
 * it: it applies when the condition is true.
 */
export const REPLACEMENT_ENTERS_WITH_COUNTERS_KICKED = defineRule<IrAbility>({
  id: 'replacement.enters-with-counters-kicked',
  family: 'replacement',
  leading: ['if'],
  cites: ['CR 702.33d (Kicker)', 'CR 614.1c (Replacement Effects)', 'CR 122.6 (Counters)'],
  examples: [
    'If ~ was kicked, it enters with two +1/+1 counters on it.',
    'If ~ was kicked, ~ enters with a +1/+1 counter on it.',
    'If ~ was kicked, it enters the battlefield with three charge counters on it.',
  ],
  rejects: [
    '~ enters with two +1/+1 counters on it.',
    'If ~ was kicked, it enters with X +1/+1 counters on it.',
    'If ~ was kicked, it enters tapped.',
    'If ~ was kicked, it enters with two +1/+1 counters on it',
    'If you control a Dragon, it enters with two +1/+1 counters on it.',
    'If ~ was kicked, draw a card.',
  ],
  parse: (ctx, pos) => {
    const id = 'replacement.enters-with-counters-kicked';
    const r = sequence(
      literal('if '),
      spanned(family<IrCondition>('condition', { only: ['condition.kicked'] })),
      literal(', '),
      IT_ENTERS,
      countersTail(id),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, condition, , , { count, counter }] = r.value;
    const span = { start: pos, end: r.pos };
    const event: IrClause = {
      kind: 'clause',
      verb: 'entersWithCounters',
      args: { count, counter },
      optional: false,
      condition: condition.value,
      span,
      rule: id,
    };
    return { ok: true, value: replacement(id, span, event), pos: r.pos };
  },
});

export const KICKED_REPLACEMENT_RULES = [REPLACEMENT_ENTERS_WITH_COUNTERS_KICKED];
