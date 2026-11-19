/**
 * Replacement rule of the Quandrix Unlimited deck, group D2 (Altered Ego): "You may have ~ enter as a copy of any creature on the battlefield, except it enters with X additional
 * +1/+1 counters on it." (CR 614.12, 707.2, 707.9b, 107.3m, 122.6: the permanent enters as a copy, and the exception gives it counters of the X of the spell it came from.)
 */
import { fail, literal, map, sequence } from '../../combinators';
import type { IrAbility, IrClause, IrNoun } from '../../ir/types';
import { permanentPhrase, withoutZone } from '../noun/phrases';
import { defineRule, quietly, spanned } from '../registry';
import { replacement } from './shared';

const EXCEPTION = ', except it enters with X additional +1/+1 counters on it.';

/**
 * `replacement.enters-as-copy-x-counters`: "You may have ~ enter as a copy of any creature on the battlefield, except it enters with X additional +1/+1 counters on it." The copy lasts
 * for good (no duration is said) and may be of any permanent of the kind on the battlefield: a controller or a quality of its own is another statement. The lowering gives the
 * exception to the engine's `entersAsCopy.withX`.
 */
export const REPLACEMENT_ENTERS_AS_COPY_X_COUNTERS = defineRule<IrAbility>({
  id: 'replacement.enters-as-copy-x-counters',
  family: 'replacement',
  leading: ['you'],
  cites: [
    'CR 614.12 (Replacement Effects)',
    'CR 707.2 (Copying Objects)',
    'CR 707.9b (Copying Objects)',
    'CR 107.3m (Numbers and Symbols)',
    'CR 122.6 (Counters)',
  ],
  examples: [
    'You may have ~ enter as a copy of any creature on the battlefield, except it enters with X additional +1/+1 counters on it.',
    'You may have ~ enter as a copy of any artifact on the battlefield, except it enters with X additional +1/+1 counters on it.',
  ],
  rejects: [
    'You may have ~ enter as a copy of any creature on the battlefield, except it enters with X additional +1/+1 counters on it',
    'You may have ~ enter as a copy of any creature on the battlefield.',
    'You may have ~ enter as a copy of any creature you control on the battlefield, except it enters with X additional +1/+1 counters on it.',
    'You may have ~ enter as a copy of any creature on the battlefield, except it enters with two additional +1/+1 counters on it.',
    'You may have ~ enter as a copy of any creature on the battlefield, except it enters with X additional -1/-1 counters on it.',
    'You may have ~ enter as a copy of any creature on the battlefield, except it enters with X additional +1/+1 counters on it. Draw a card.',
  ],
  parse: (ctx, pos) => {
    const id = 'replacement.enters-as-copy-x-counters';
    const head = literal('you may have ~ enter as a copy of any ')(ctx, pos);
    if (!head.ok) return head;
    const kind = spanned(map(permanentPhrase(false, 'all'), withoutZone))(ctx, head.pos);
    if (!kind.ok) return kind;
    if (kind.value.value.controller !== undefined) return fail(ctx, pos);
    const where = sequence(literal(' on the battlefield'), literal(EXCEPTION))(ctx, kind.pos);
    if (!where.ok) return where;
    const span = { start: pos, end: where.pos };
    const what: IrNoun = {
      kind: 'noun',
      det: 'a',
      filter: kind.value.value,
      upTo: false,
      plural: false,
      other: false,
      span: kind.value.span,
      rule: id,
    };
    const event: IrClause = {
      kind: 'clause',
      verb: 'entersAsCopy',
      args: {
        what,
        duration: { kind: 'flag', value: false, span, rule: id },
        withX: { kind: 'flag', value: true, span, rule: id },
      },
      optional: true,
      span,
      rule: id,
    };
    return { ok: true, value: replacement(id, span, event), pos: where.pos };
  },
});

export const ENTERS_AS_COPY_COUNTERS_RULES = [REPLACEMENT_ENTERS_AS_COPY_X_COUNTERS].map(quietly);
