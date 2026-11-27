/**
 * Replacement rule of the Miracle Worker deck build (issue 109, Mirrormade): "You may have ~ enter as a copy of any artifact or enchantment on the battlefield." (CR 614.1c, 614.12,
 * 707.2: the permanent enters as a copy of any permanent of the kinds, whoever controls it, with no exception.)
 */
import { fail, literal, map } from '../../combinators';
import type { IrAbility, IrClause, IrNoun } from '../../ir/types';
import { permanentPhrase, withoutZone } from '../noun/phrases';
import { defineRule, quietly, spanned } from '../registry';
import { replacement } from './shared';

/**
 * `replacement.enters-as-copy-plain`: "You may have ~ enter as a copy of any artifact or enchantment on the battlefield." The copy lasts for good (no duration is said) and has no exception;
 * the permanents it may copy are any on the battlefield, so a controller or a quality of its own is another statement. The engine's `entersAsCopy` with only `what`. Not read: "a" for "any",
 * an owner named, an exception ("except ..." is another rule), a duration, another sentence after it.
 */
export const REPLACEMENT_ENTERS_AS_COPY_PLAIN = defineRule<IrAbility>({
  id: 'replacement.enters-as-copy-plain',
  family: 'replacement',
  leading: ['you'],
  cites: [
    'CR 614.1c (Replacement Effects)',
    'CR 614.12 (Replacement Effects)',
    'CR 707.2 (Copying Objects)',
  ],
  examples: [
    'You may have ~ enter as a copy of any artifact or enchantment on the battlefield.',
    'You may have ~ enter as a copy of any artifact on the battlefield.',
    'You may have ~ enter as a copy of any artifact or creature on the battlefield.',
  ],
  rejects: [
    'You may have ~ enter as a copy of any artifact or enchantment on the battlefield',
    'You may have ~ enter as a copy of an artifact or enchantment on the battlefield.',
    'You may have ~ enter as a copy of any artifact or enchantment you control on the battlefield.',
    'You may have ~ enter as a copy of any artifact or enchantment.',
    'You may have ~ enter as a copy of any artifact or enchantment on the battlefield until end of turn.',
    "You may have ~ enter as a copy of any artifact or enchantment on the battlefield, except it's a Dragon in addition to its other types.",
    'You may have ~ enter as a copy of any artifact or enchantment on the battlefield. Draw a card.',
  ],
  parse: (ctx, pos) => {
    const id = 'replacement.enters-as-copy-plain';
    const head = literal('you may have ~ enter as a copy of any ')(ctx, pos);
    if (!head.ok) return head;
    const kind = spanned(map(permanentPhrase(false, 'all'), withoutZone))(ctx, head.pos);
    if (!kind.ok) return kind;
    // The permanents it may copy are any on the battlefield: a controller is another statement.
    if (kind.value.value.controller !== undefined) return fail(ctx, pos);
    const end = literal(' on the battlefield.')(ctx, kind.pos);
    if (!end.ok) return end;
    const span = { start: pos, end: end.pos };
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
      args: { what, duration: { kind: 'flag', value: false, span, rule: id } },
      optional: true,
      span,
      rule: id,
    };
    return { ok: true, value: replacement(id, span, event), pos: end.pos };
  },
});

export const COPY_PLAIN_REPLACEMENT_RULES = [REPLACEMENT_ENTERS_AS_COPY_PLAIN].map(quietly);
