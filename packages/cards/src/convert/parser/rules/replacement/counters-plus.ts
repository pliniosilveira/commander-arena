/**
 * Replacement rule of the Quandrix Unlimited deck, group A: "If one or more +1/+1 counters would be put on a creature you control, that many plus one +1/+1 counters are
 * put on it instead." (CR 614.1a, 122.6, 616.1: a replacement effect of the permanent that makes the counters put on the permanents it names more).
 */
import { fail, literal, pattern, quiet, satisfy, sequence } from '../../combinators';
import type { IrAbility, IrClause, IrNoun } from '../../ir/types';
import { quantity } from '../amount/index';
import { defineRule, family, quietly, spanned } from '../registry';
import { replacement } from './shared';

/**
 * `replacement.counters-plus`: "If one or more +1/+1 counters would be put on a creature you control, that many plus one +1/+1 counters are put on it instead.", with
 * "another creature you control", "a permanent you control" (then "on that permanent instead") or "an artifact or creature you control" (CR 614.1a, 122.6: every putting
 * of +1/+1 counters on a permanent of the controller that the phrase names, by an effect or as the permanent enters, is more by that number). The permanents are the
 * controller's own. Not read: another kind of counter ("charge counters", "counters" alone), another player's permanents ("an opponent controls"), a group ("creatures you
 * control"), "twice that many", another number format ("plus X"), "plus zero", a missing "instead", a missing period, a condition, or more after the sentence.
 */
export const REPLACEMENT_COUNTERS_PLUS = defineRule<IrAbility>({
  id: 'replacement.counters-plus',
  family: 'replacement',
  leading: ['if'],
  cites: [
    'CR 614.1a (Replacement Effects)',
    'CR 122.6 (Counters)',
    'CR 614.5 (Replacement Effects)',
    'CR 616.1 (Interaction of Replacement and/or Prevention Effects)',
  ],
  examples: [
    'If one or more +1/+1 counters would be put on a creature you control, that many plus one +1/+1 counters are put on it instead.',
    'If one or more +1/+1 counters would be put on another creature you control, that many plus one +1/+1 counters are put on it instead.',
    'If one or more +1/+1 counters would be put on a permanent you control, that many plus one +1/+1 counters are put on that permanent instead.',
    'If one or more +1/+1 counters would be put on an artifact or creature you control, that many plus one +1/+1 counters are put on it instead.',
    'If one or more +1/+1 counters would be put on a creature you control, that many plus two +1/+1 counters are put on it instead.',
  ],
  rejects: [
    'If one or more +1/+1 counters would be put on a creature you control, that many plus one +1/+1 counters are put on it instead',
    'If one or more +1/+1 counters would be put on a creature you control, that many plus one +1/+1 counters are put on it.',
    'If one or more charge counters would be put on a creature you control, that many plus one charge counters are put on it instead.',
    'If one or more counters would be put on a creature you control, that many plus one counters are put on it instead.',
    'If one or more +1/+1 counters would be put on a creature an opponent controls, that many plus one +1/+1 counters are put on it instead.',
    'If one or more +1/+1 counters would be put on a creature, that many plus one +1/+1 counters are put on it instead.',
    'If one or more +1/+1 counters would be put on creatures you control, that many plus one +1/+1 counters are put on them instead.',
    'If one or more +1/+1 counters would be put on a creature you control, twice that many +1/+1 counters are put on it instead.',
    'If one or more +1/+1 counters would be put on a creature you control, that many plus X +1/+1 counters are put on it instead.',
    'If one or more +1/+1 counters would be put on a creature you control, that many plus 0 +1/+1 counters are put on it instead.',
    'If one or more +1/+1 counters would be put on a creature you control, that many plus one -1/-1 counters are put on it instead.',
    'If one or more +1/+1 counters would be put on a creature you control, that many plus one +1/+1 counters are put on target creature instead.',
    'If one or more +1/+1 counters would be put on a creature you control, that many plus one +1/+1 counters are put on it instead. Draw a card.',
    'If one or more +1/+1 counters would be put on a creature you control, that many plus one +1/+1 counters are put on it instead if you control a Dragon.',
  ],
  parse: (ctx, pos) => {
    const id = 'replacement.counters-plus';
    const r = sequence(
      literal('if one or more +1/+1 counters would be put on '),
      quiet(family<IrNoun>('noun', { only: ['noun.a-permanent'] })),
      literal(', that many plus '),
      spanned(satisfy(quantity, (n) => n >= 1)),
      literal(' +1/+1 counters are put on '),
      pattern(/(?:it|that permanent)(?![\p{L}\p{N}])/iu),
      pattern(/ instead(?![\p{L}\p{N}])/iu),
      literal('.'),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, what, , extra] = r.value;
    // The permanents are the controller's own and one at a time: "a creature you control", not "a creature" or a count.
    if (what.filter.controller !== 'you' || what.count !== undefined || what.plural) {
      return fail(ctx, pos);
    }
    const span = { start: pos, end: r.pos };
    const event: IrClause = {
      kind: 'clause',
      verb: 'countersPlus',
      args: { what, amount: { kind: 'number', value: extra.value, span: extra.span } },
      optional: false,
      span,
      rule: id,
    };
    return { ok: true, value: replacement(id, span, event), pos: r.pos };
  },
});

export const COUNTERS_PLUS_REPLACEMENT_RULES = [REPLACEMENT_COUNTERS_PLUS].map(quietly);
