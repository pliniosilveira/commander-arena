/**
 * Replacement rules of stage P34 (D-151, D-152): "As ~ enters, you may have it become a copy of any creature on the battlefield until end of turn,
 * except it has haste." (CR 614.12, 707.2, 707.9: the permanent enters as a copy, with the keywords the exception gives it).
 */
import { choice, fail, literal, map, optional, pattern, sequence } from '../../combinators';
import type { IrAbility, IrClause, IrKeywordList, IrNoun } from '../../ir/types';
import { KEYWORD_WORDS } from '../keyword/list';
import { permanentPhrase, withoutZone } from '../noun/phrases';
import { defineRule, quietly, spanned } from '../registry';
import { ENTERS, replacement } from './shared';

/**
 * `replacement.enters-as-copy`: "As ~ enters, you may have it become a copy of any creature on the battlefield until end of turn, except it has
 * haste." (CR 614.12, 707.2, 707.9b, 611.2: as the permanent enters its controller may choose a permanent of the kind on the battlefield, and it
 * enters as a copy of it, with the keyword abilities the exception names, for the length of time the text says, or for good). "You may" is part
 * of the phrase: the player may choose none. The kind is a phrase of permanents ("any creature", "any artifact").
 */
export const REPLACEMENT_ENTERS_AS_COPY = defineRule<IrAbility>({
  id: 'replacement.enters-as-copy',
  family: 'replacement',
  leading: ['as'],
  cites: [
    'CR 614.12 (Replacement Effects)',
    'CR 707.2 (Copying Objects)',
    'CR 707.9b (Copying Objects)',
    'CR 611.2 (Continuous Effects)',
  ],
  examples: [
    'As ~ enters, you may have it become a copy of any creature on the battlefield until end of turn, except it has haste.',
    'As ~ enters, you may have it become a copy of any creature on the battlefield until end of turn.',
    'As ~ enters the battlefield, you may have it become a copy of any artifact on the battlefield, except it has flying.',
    'As ~ enters, you may have it become a copy of any creature on the battlefield.',
  ],
  rejects: [
    'As ~ enters, you may have it become a copy of any creature on the battlefield until end of turn, except it has haste',
    'As ~ enters, you may have it become a copy of any creature until end of turn.',
    'As ~ enters, you may have it become a copy of target creature on the battlefield until end of turn.',
    'As ~ enters, you may have it become a copy of any creature on the battlefield until your next turn.',
    'As ~ enters, you may have it become a copy of a creature on the battlefield until end of turn.',
    'As ~ enters, you may have it become a copy of any creature you control on the battlefield until end of turn.',
    'As ~ enters, have it become a copy of any creature on the battlefield until end of turn.',
    'As ~ enters, you may have it become a copy of any creature on the battlefield until end of turn, except it has haste and is an Elf.',
    'As ~ enters, you may have it become a copy of any creature on the battlefield until end of turn, except it has flash.',
    'As ~ enters, you may have it become a copy of any creature on the battlefield until end of turn. Draw a card.',
  ],
  parse: (ctx, pos) => {
    const id = 'replacement.enters-as-copy';
    const head = sequence(
      pattern(/as /iu),
      choice(ENTERS, literal('it enters')),
      literal(', you may have it become a copy of any '),
    )(ctx, pos);
    if (!head.ok) return head;
    const kind = spanned(map(permanentPhrase(false, 'all'), withoutZone))(ctx, head.pos);
    if (!kind.ok) return kind;
    // The permanents it may copy are any on the battlefield: a controller or a quality of its own is another statement.
    if (kind.value.value.controller !== undefined) return fail(ctx, pos);
    const where = literal(' on the battlefield')(ctx, kind.pos);
    if (!where.ok) return where;
    const until = optional(literal(' until end of turn'), null)(ctx, where.pos);
    if (!until.ok) return until;
    const gains = optional(
      map(sequence(literal(', except it has '), spanned(KEYWORD_WORDS)), ([, words]) => words),
      null,
    )(ctx, until.pos);
    if (!gains.ok) return gains;
    const end = literal('.')(ctx, gains.pos);
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
    const gained: IrKeywordList | null =
      gains.value === null
        ? null
        : { kind: 'keywordList', names: gains.value.value, span: gains.value.span, rule: id };
    const event: IrClause = {
      kind: 'clause',
      verb: 'entersAsCopy',
      args: {
        what,
        duration: { kind: 'flag', value: until.value !== null, span, rule: id },
        ...(gained === null ? {} : { gains: gained }),
      },
      optional: true,
      span,
      rule: id,
    };
    return { ok: true, value: replacement(id, span, event), pos: end.pos };
  },
});

export const DRAGON_REPLACEMENT_RULES = [REPLACEMENT_ENTERS_AS_COPY].map(quietly);
