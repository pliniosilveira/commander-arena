/**
 * Replacement rules of the Gisa deck (issue 41), group 5 (D-1444): "~ escapes with two +1/+1 counters on it." (Woe Strider, CR 702.138c).
 */
import { literal, sequence } from '../../combinators';
import type { IrAbility, IrClause } from '../../ir/types';
import { flag } from '../effect/dragons';
import { defineRule } from '../registry';
import { countersTail, replacement } from './shared';

/**
 * `replacement.escapes-with-counters`: "~ escapes with two +1/+1 counters on it." (CR 702.138c: "If this permanent escaped, it enters with those counters", a
 * replacement effect of the permanent as it enters, CR 614.1c). The same clause as `replacement.enters-with-counters` with the flag `escapes`: the engine's
 * `entersWithCounters` with `ifEscaped`, valid on a face that lists an escape cost (`validateCard`). A number of counters ("a", "two", ...) of a kind, never X and never
 * "for each": the engine's counters of an escaped permanent are a fixed number. Not read: "enters with", "if it escaped", another subject, a missing period, "escape with".
 */
export const REPLACEMENT_ESCAPES_WITH_COUNTERS = defineRule<IrAbility>({
  id: 'replacement.escapes-with-counters',
  family: 'replacement',
  leading: ['~'],
  cites: [
    'CR 702.138c (Escape)',
    'CR 702.138b (Escape)',
    'CR 614.1c (Replacement Effects)',
    'CR 122.6 (Counters)',
  ],
  examples: [
    '~ escapes with two +1/+1 counters on it.',
    '~ escapes with a +1/+1 counter on it.',
    '~ escapes with three charge counters on it.',
  ],
  rejects: [
    '~ escapes with two +1/+1 counters on it',
    '~ escapes with X +1/+1 counters on it.',
    '~ escapes with a +1/+1 counter on it for each creature you control.',
    '~ escape with two +1/+1 counters on it.',
    '~ escapes with two +1/+1 counters.',
    '~ escapes tapped.',
    '~ escapes with flying.',
    '~ enters with two +1/+1 counters on it.',
    '~ escapes with two +1/+1 counters on it and draw a card.',
    'It escapes with two +1/+1 counters on it.',
  ],
  parse: (ctx, pos) => {
    const id = 'replacement.escapes-with-counters';
    const r = sequence(literal('~ escapes'), countersTail(id))(ctx, pos);
    if (!r.ok) return r;
    const { count, counter } = r.value[1];
    const span = { start: pos, end: r.pos };
    const event: IrClause = {
      kind: 'clause',
      verb: 'entersWithCounters',
      args: { count, counter, escapes: flag(id, true, span) },
      optional: false,
      span,
      rule: id,
    };
    return { ok: true, value: replacement(id, span, event), pos: r.pos };
  },
});

export const GISA_G5_REPLACEMENT_RULES = [REPLACEMENT_ESCAPES_WITH_COUNTERS];
